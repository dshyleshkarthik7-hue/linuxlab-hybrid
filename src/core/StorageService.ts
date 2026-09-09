const DB_NAME = 'LinuxLab_IDB';
const DB_VERSION = 5;

const STORE_NAMES = ['workspace', 'progress', 'sessions', 'quizAttempts'] as const;
type StoreName = (typeof STORE_NAMES)[number];

const ALLOWED_WORKSPACE_FILES = new Set(['main.c', 'Main.java']);

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
  if (!ALLOWED_WORKSPACE_FILES.has(filename)) {
    throw new Error(`Unsupported workspace filename: ${filename}`);
  }
}

export class StorageService {
  private static dbPromise: Promise<IDBDatabase> | null = null;

  private static getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB is unavailable'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('workspace')) {
          db.createObjectStore('workspace', { keyPath: 'filename' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'labId' });
        }
        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('quizAttempts')) {
          db.createObjectStore('quizAttempts', { keyPath: 'id' });
        }
      };

      request.onblocked = () => {
        this.dbPromise = null;
        reject(new Error('IndexedDB upgrade is blocked by another open LinuxLab tab'));
      };
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('Failed to open IndexedDB'));
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
    });

    return this.dbPromise;
  }

  private static async request<T>(
    storeName: StoreName,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      let settled = false;

      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      let request: IDBRequest<T>;
      try {
        request = action(transaction.objectStore(storeName));
      } catch (error) {
        fail(error);
        return;
      }

      request.onsuccess = () => {
        if (!settled) {
          settled = true;
          resolve(request.result);
        }
      };
      request.onerror = () => fail(request.error ?? new Error('IndexedDB request failed'));
      transaction.onerror = () => fail(transaction.error ?? new Error('IndexedDB transaction failed'));
      transaction.onabort = () => fail(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  private static async write<T>(
    storeName: StoreName,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<void> {
    await this.request<T>(storeName, 'readwrite', action);
  }

  static saveFile(filename: string, content: string): Promise<void> {
    assertWorkspaceFilename(filename);
    return this.write('workspace', store =>
      store.put({ filename, content, timestamp: Date.now() }),
    );
  }

  static async getFile(filename: string): Promise<string | null> {
    assertWorkspaceFilename(filename);
    const file = await this.request<WorkspaceFile | undefined>(
      'workspace',
      'readonly',
      store => store.get(filename),
    );
    return file?.content ?? null;
  }

  static async getWorkspace(): Promise<Record<string, string>> {
    const files = await this.request<WorkspaceFile[]>('workspace', 'readonly', store => store.getAll());
    return Object.fromEntries(files.map(file => [file.filename, file.content]));
  }

  static saveProgress(labId: string, score: number, passed: boolean): Promise<void> {
    return this.write('progress', store =>
      store.put({ labId, score, passed, timestamp: Date.now() }),
    );
  }

  static async getProgress(labId: string): Promise<ProgressRecord | null> {
    const progress = await this.request<ProgressRecord | undefined>(
      'progress',
      'readonly',
      store => store.get(labId),
    );
    return progress ?? null;
  }

  static saveSession(session: LearningSession): Promise<void> {
    return this.write('sessions', store =>
      store.put({ ...session, updatedAt: Date.now() }),
    );
  }

  static async getSessions(): Promise<LearningSession[]> {
    const sessions = await this.request<LearningSession[]>('sessions', 'readonly', store => store.getAll());
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  static deleteSession(id: string): Promise<void> {
    return this.write('sessions', store => store.delete(id));
  }

  static clearSessions(): Promise<void> {
    return this.write('sessions', store => store.clear());
  }

  static async getQuizAttempts(): Promise<QuizAttempt[]> {
    const attempts = await this.request<QuizAttempt[]>('quizAttempts', 'readonly', store => store.getAll());
    return attempts.sort((a, b) => b.timestamp - a.timestamp);
  }

  static saveQuizAttempt(attempt: QuizAttempt): Promise<void> {
    return this.write('quizAttempts', store => store.put(attempt));
  }

  static async clearLearningData(): Promise<void> {
    const db = await this.getDB();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([...STORE_NAMES], 'readwrite');
      for (const storeName of STORE_NAMES) transaction.objectStore(storeName).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Failed to clear learning data'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Clearing learning data was aborted'));
    });
  }

  static async exportData(): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {
      version: 1,
      exportedAt: new Date().toISOString(),
    };

    for (const storeName of STORE_NAMES) {
      data[storeName] = await this.request<unknown[]>(storeName, 'readonly', store => store.getAll());
    }

    return data;
  }
}
