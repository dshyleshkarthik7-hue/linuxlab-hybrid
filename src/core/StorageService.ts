const DB_NAME = 'LinuxLab_IDB';
const DB_VERSION = 3;

export interface WorkspaceFile { filename: string; content: string; timestamp: number; }
export interface LearningSession { id: string; mode: 'real-linux'; title: string; startedAt: number; updatedAt: number; commands: string[]; lessonId?: string; completed?: boolean; }
export interface QuizAttempt { id: string; quizId: string; score: number; total: number; timestamp: number; answers: string[]; }

export class StorageService {
  private static getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('workspace')) db.createObjectStore('workspace', { keyPath: 'filename' });
        if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'labId' });
        if (!db.objectStoreNames.contains('sessions')) {
          const store = db.createObjectStore('sessions', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('quizAttempts')) db.createObjectStore('quizAttempts', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private static async op<T>(store: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = action(tx.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async saveFile(filename: string, content: string): Promise<void> {
    await this.op('workspace', 'readwrite', store => store.put({ filename, content, timestamp: Date.now() }));
  }
  static async getFile(filename: string): Promise<string | null> {
    const file = await this.op<WorkspaceFile | undefined>('workspace', 'readonly', store => store.get(filename));
    return file?.content ?? null;
  }
  static async getWorkspace(): Promise<Record<string, string>> {
    const files = await this.op<WorkspaceFile[]>('workspace', 'readonly', store => store.getAll());
    return Object.fromEntries(files.map(file => [file.filename, file.content]));
  }
  static async saveProgress(labId: string, score: number, passed: boolean): Promise<void> {
    await this.op('progress', 'readwrite', store => store.put({ labId, score, passed, timestamp: Date.now() }));
  }
  static async getProgress(labId: string): Promise<{ score: number; passed: boolean } | null> {
    const value = await this.op<any>('progress', 'readonly', store => store.get(labId));
    return value ? { score: value.score, passed: value.passed } : null;
  }
  static async saveSession(session: LearningSession): Promise<void> {
    await this.op('sessions', 'readwrite', store => store.put({ ...session, updatedAt: Date.now() }));
  }
  static async getSessions(): Promise<LearningSession[]> {
    const sessions = await this.op<LearningSession[]>('sessions', 'readonly', store => store.getAll());
    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  static async saveQuizAttempt(attempt: QuizAttempt): Promise<void> {
    await this.op('quizAttempts', 'readwrite', store => store.put(attempt));
  }
  static async exportData(): Promise<Record<string, unknown>> {
    const db = await this.getDB();
    try {
      const names = ['workspace', 'progress', 'sessions', 'quizAttempts'];
      const data: Record<string, unknown> = { version: 1, exportedAt: new Date().toISOString() };
      for (const name of names) {
        data[name] = await new Promise<unknown[]>((resolve, reject) => {
          const request = db.transaction(name, 'readonly').objectStore(name).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      return data;
    } finally {
      db.close();
    }
  }
}