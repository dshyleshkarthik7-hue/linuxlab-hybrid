const DB_NAME = 'LinuxLab_IDB';
const DB_VERSION = 2;

export interface WorkspaceFile {
  filename: string;
  content: string;
  timestamp: number;
}

export class StorageService {
  private static async getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('workspace')) {
          db.createObjectStore('workspace', { keyPath: 'filename' });
        }
        if (!db.objectStoreNames.contains('progress')) {
          db.createObjectStore('progress', { keyPath: 'labId' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveFile(filename: string, content: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('workspace', 'readwrite');
      tx.objectStore('workspace').put({ filename, content, timestamp: Date.now() } satisfies WorkspaceFile);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getFile(filename: string): Promise<string | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('workspace', 'readonly').objectStore('workspace').get(filename);
      req.onsuccess = () => resolve(req.result ? req.result.content : null);
      req.onerror = () => reject(req.error);
    });
  }

  static async getWorkspace(): Promise<Record<string, string>> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('workspace', 'readonly').objectStore('workspace').getAll();
      req.onsuccess = () => {
        const files: Record<string, string> = {};
        for (const item of (req.result || []) as WorkspaceFile[]) files[item.filename] = item.content;
        resolve(files);
      };
      req.onerror = () => reject(req.error);
    });
  }

  static async saveProgress(labId: string, score: number, passed: boolean): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('progress', 'readwrite');
      tx.objectStore('progress').put({ labId, score, passed, timestamp: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  static async getProgress(labId: string): Promise<{ score: number; passed: boolean } | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction('progress', 'readonly').objectStore('progress').get(labId);
      req.onsuccess = () => {
        const result = req.result;
        resolve(result ? { score: result.score, passed: result.passed } : null);
      };
      req.onerror = () => reject(req.error);
    });
  }
}
