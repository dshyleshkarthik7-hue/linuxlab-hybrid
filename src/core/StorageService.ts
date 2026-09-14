const DB_NAME = 'LinuxLab_IDB';
const DB_VERSION = 5;

const STORE_NAMES = ['workspace', 'progress', 'sessions', 'quizAttempts'] as const;
type StoreName = (typeof STORE_NAMES)[number];

const ALLOWED_WORKSPACE_FILES = new Set(['main.c', 'Main.java']);
const MAX_WORKSPACE_FILE_BYTES = 1_000_000;
const MAX_WORKSPACE_TOTAL_BYTES = 2_000_000;
const MAX_SESSION_COUNT = 50;
const MAX_COMMANDS_PER_SESSION = 500;
const MAX_COMMAND_BYTES = 4_000;
const MAX_QUIZ_ATTEMPTS = 200;
const MAX_QUIZ_ANSWERS = 100;
const MAX_QUIZ_ANSWER_BYTES = 2_000;

export interface WorkspaceFile {
  filename: string;
  content: string;
  timestamp: number;
}

export interface LearningSession {
  id: string;
  mode: 'simulator' | 'real-linux';
  title: string;
  startedAt: number;
  updatedAt: number;
  commands: string[];
  lessonId?: string;
  completed?: boolean;
}

export interface QuizAttempt {
  id: string;
  quizId: string;
  score: number;
  total: number;
  timestamp: number;
  answers: string[];
}

type ProgressRecord = { labId: string; score: number; passed: boolean; timestamp: number };

function assertWorkspaceFilename(filename: string): void {
  if (!ALLOWED_WORKSPACE_FILES.has(filename)) throw new Error(`Unsupported workspace filename: ${filename}`);
}
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function assertBoundedString(value: string, maxBytes: number, label: string): void {
  if (utf8Bytes(value) > maxBytes) throw new Error(`${label} exceeds the ${maxBytes}-byte limit`);
}
function normalizeSession(session: LearningSession): LearningSession {
  if (!session.id || !session.title) throw new Error('Session id and title are required');
  assertBoundedString(session.id, 256, 'Session id');
  assertBoundedString(session.title, 4_000, 'Session title');
  const commands = session.commands.slice(-MAX_COMMANDS_PER_SESSION).map(command => {
    assertBoundedString(command, MAX_COMMAND_BYTES, 'Session command');
    return command;
  });
  return { ...session, commands };
}
function normalizeQuizAttempt(attempt: QuizAttempt): QuizAttempt {
  if (!attempt.id || !attempt.quizId) throw new Error('Quiz attempt id and quiz id are required');
  assertBoundedString(attempt.id, 256, 'Quiz attempt id');
  assertBoundedString(attempt.quizId, 256, 'Quiz id');
  if (attempt.answers.length > MAX_QUIZ_ANSWERS) throw new Error('Quiz attempt contains too many answers');
  const answers = attempt.answers.map(answer => {
    assertBoundedString(answer, MAX_QUIZ_ANSWER_BYTES, 'Quiz answer');
    return answer;
  });
  return { ...attempt, answers };
}

export class StorageService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB is unavailable')); return; }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'filename' });
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'labId' });
        if (!db.objectStoreNames.contains('sessions')) { const sessions = db.createObjectStore('sessions', { keyPath: 'id' }); sessions.createIndex('updatedAt', 'updatedAt'); }
        if (!db.objectStoreNames.contains('quizAttempts')) db.createObjectStore('quizAttempts', { keyPath: 'id' });
      };
      request.onblocked = () => { this.dbPromise = null; reject(new Error('IndexedDB upgrade is blocked by another open LinuxLab tab')); };
      request.onerror = () => { this.dbPromise = null; reject(request.error ?? new Error('Failed to open IndexedDB')); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); this.dbPromise = null; }; resolve(db); };
    });
    return this.dbPromise;
  }

  private static async request<T>(storeName: StoreName, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      let settled = false; let result!: T;
      const fail = (error: unknown): void => { if (settled) return; settled = true; reject(error instanceof Error ? error : new Error(String(error))); };
      let request: IDBRequest<T>;
      try { request = action(transaction.objectStore(storeName)); } catch (error) { fail(error); return; }
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => fail(request.error ?? new Error('IndexedDB request failed'));
      transaction.oncomplete = () => { if (!settled) { settled = true; resolve(result); } };
      transaction.onerror = () => fail(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () => fail(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  private static async write<T>(storeName: StoreName, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<void> { await this.request<T>(storeName, 'readwrite', action); }

  static saveFile(filename: string, content: string): Promise<void> {
    assertWorkspaceFilename(filename);
    assertBoundedString(content, MAX_WORKSPACE_FILE_BYTES, 'Workspace file');
    return this.write('workspace', store => store.put({ filename, content, timestamp: Date.now() }));
  }
  static async getFile(filename: string): Promise<string | null> { assertWorkspaceFilename(filename); const file = await this.request<WorkspaceFile | undefined>('workspace', 'readonly', store => store.get(filename)); return file?.content ?? null; }
  static async getWorkspace(): Promise<Record<string, string>> {
    const files = await this.request<WorkspaceFile[]>('workspace', 'readonly', store => store.getAll());
    const result: Record<string, string> = {}; let totalBytes = 0;
    for (const file of files) { const bytes = utf8Bytes(file.content); if (bytes <= MAX_WORKSPACE_FILE_BYTES && totalBytes + bytes <= MAX_WORKSPACE_TOTAL_BYTES) { result[file.filename] = file.content; totalBytes += bytes; } }
    return result;
  }
  static saveProgress(labId: string, score: number, passed: boolean): Promise<void> { assertBoundedString(labId, 256, 'Lab id'); return this.write('progress', store => store.put({ labId, score, passed, timestamp: Date.now() })); }
  static async getProgress(labId: string): Promise<ProgressRecord | null> { const progress = await this.request<ProgressRecord | undefined>('progress', 'readonly', store => store.get(labId)); return progress ?? null; }
  static saveSession(session: LearningSession): Promise<void> {
    const normalized = normalizeSession(session);
    return this.write('sessions', store => store.put({ ...normalized, updatedAt: Date.now() }));
  }
  static async getSessions(): Promise<LearningSession[]> {
    const sessions = await this.request<LearningSession[]>('sessions', 'readonly', store => store.getAll());
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SESSION_COUNT);
  }
  static deleteSession(id: string): Promise<void> { return this.write('sessions', store => store.delete(id)); }
  static clearSessions(): Promise<void> { return this.write('sessions', store => store.clear()); }
  static async getQuizAttempts(): Promise<QuizAttempt[]> { const attempts = await this.request<QuizAttempt[]>('quizAttempts', 'readonly', store => store.getAll()); return attempts.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_QUIZ_ATTEMPTS); }
  static saveQuizAttempt(attempt: QuizAttempt): Promise<void> { const normalized = normalizeQuizAttempt(attempt); return this.write('quizAttempts', store => store.put(normalized)); }
  static async clearLearningData(): Promise<void> { const db = await this.getDB(); await new Promise<void>((resolve, reject) => { const transaction = db.transaction([...STORE_NAMES], 'readwrite'); for (const storeName of STORE_NAMES) transaction.objectStore(storeName).clear(); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear learning data')); transaction.onabort = () => reject(transaction.error ?? new Error('Clearing learning data was aborted')); }); }
  static async exportData(): Promise<Record<string, unknown>> { const data: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString() }; for (const storeName of STORE_NAMES) data[storeName] = await this.request<unknown[]>(storeName, 'readonly', store => store.getAll()); return data; }
}
