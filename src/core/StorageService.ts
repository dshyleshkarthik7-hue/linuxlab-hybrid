const DB_NAME='LinuxLab_IDB'; const DB_VERSION=3;
export interface WorkspaceFile{filename:string;content:string;timestamp:number}
export interface LearningSession{id:string;mode:'simulator'|'real-linux';title:string;startedAt:number;updatedAt:number;commands:string[];lessonId?:string;completed?:boolean}
export interface QuizAttempt{id:string;quizId:string;score:number;total:number;timestamp:number;answers:string[]}
export class StorageService{
 private static getDB():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const db=(e.target as IDBOpenDBRequest).result;if(!db.objectStoreNames.contains('workspace'))db.createObjectStore('workspace',{keyPath:'filename'});if(!db.objectStoreNames.contains('progress'))db.createObjectStore('progress',{keyPath:'labId'});if(!db.objectStoreNames.contains('sessions')){const s=db.createObjectStore('sessions',{keyPath:'id'});s.createIndex('updatedAt','updatedAt')}if(!db.objectStoreNames.contains('quizAttempts'))db.createObjectStore('quizAttempts',{keyPath:'id'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
 private static async op<T>(store:string,mode:IDBTransactionMode,fn:(s:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await this.getDB();return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),r=fn(tx.objectStore(store));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.oncomplete=()=>db.close()})}
 static saveFile(filename:string,content:string){return this.op('workspace','readwrite',s=>s.put({filename,content,timestamp:Date.now()})).then(()=>{})}
 static getFile(filename:string){return this.op<WorkspaceFile|undefined>('workspace','readonly',s=>s.get(filename)).then(v=>v?.content??null)}
 static getWorkspace(){return this.op<WorkspaceFile[]>('workspace','readonly',s=>s.getAll()).then(v=>Object.fromEntries(v.map(x=>[x.filename,x.content])))}
 static saveProgress(labId:string,score:number,passed:boolean){return this.op('progress','readwrite',s=>s.put({labId,score,passed,timestamp:Date.now()})).then(()=>{})}
 static getProgress(labId:string){return this.op<any>('progress','readonly',s=>s.get(labId)).then(v=>v?{score:v.score,passed:v.passed}:null)}
 static saveSession(session:LearningSession){return this.op('sessions','readwrite',s=>s.put({...session,updatedAt:Date.now()})).then(()=>{})}
 static getSessions(){return this.op<LearningSession[]>('sessions','readonly',s=>s.getAll()).then(v=>v.sort((a,b)=>b.updatedAt-a.updatedAt))}
 static saveQuizAttempt(a:QuizAttempt){return this.op('quizAttempts','readwrite',s=>s.put(a)).then(()=>{})}
}