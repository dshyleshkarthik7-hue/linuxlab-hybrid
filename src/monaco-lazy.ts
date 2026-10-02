import type * as Monaco from 'monaco-editor';

export type MonacoEditorModule = typeof import('monaco-editor');

type WorkerConstructor = new () => Worker;

export async function loadMonaco(): Promise<MonacoEditorModule> {
  const monacoModule = await import('monaco-editor');

  const editorWorkerUrl = new URL(
    'monaco-editor/esm/vs/editor/editor.worker.js',
    import.meta.url,
  );

  const editorWorkerConstructor: WorkerConstructor = class extends Worker {
    constructor() {
      super(editorWorkerUrl, { type: 'module' });
    }
  };

  Object.assign(self, {
    MonacoEnvironment: {
      getWorker(): Worker {
        return new editorWorkerConstructor();
      },
    },
  });

  return monacoModule;
}

export type MonacoEditor = Monaco.editor.IStandaloneCodeEditor;
