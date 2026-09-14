import type * as Monaco from 'monaco-editor';

export type MonacoEditorModule = typeof import('monaco-editor');

type WorkerConstructor = new () => Worker;

export async function loadMonaco(): Promise<MonacoEditorModule> {
  const [monacoModule, editorWorker] = await Promise.all([
    import('monaco-editor'),
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
  ]);

  const editorWorkerConstructor: WorkerConstructor = editorWorker.default;

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
