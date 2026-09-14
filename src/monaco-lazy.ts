import type * as Monaco from 'monaco-editor';

export type MonacoEditorModule = typeof import('monaco-editor');

type WorkerConstructor = new () => Worker;

export async function loadMonaco(): Promise<MonacoEditorModule> {
  const [monacoModule, editorWorker, jsonWorker, cssWorker, htmlWorker, tsWorker] = await Promise.all([
    import('monaco-editor'),
    import('monaco-editor/esm/vs/editor/editor.worker?worker'),
    import('monaco-editor/esm/vs/language/json/json.worker?worker'),
    import('monaco-editor/esm/vs/language/css/css.worker?worker'),
    import('monaco-editor/esm/vs/language/html/html.worker?worker'),
    import('monaco-editor/esm/vs/language/typescript/ts.worker?worker'),
  ]);

  const workers: Record<string, WorkerConstructor> = {
    editor: editorWorker.default,
    json: jsonWorker.default,
    css: cssWorker.default,
    html: htmlWorker.default,
    typescript: tsWorker.default,
  };

  Object.assign(self, {
    MonacoEnvironment: {
      getWorker(_: string, label: string): Worker {
        if (label === 'json') return new workers.json();
        if (label === 'css' || label === 'scss' || label === 'less') return new workers.css();
        if (label === 'html' || label === 'handlebars' || label === 'razor') return new workers.html();
        if (label === 'typescript' || label === 'javascript') return new workers.typescript();
        return new workers.editor();
      },
    },
  });

  return monacoModule;
}

export type MonacoEditor = Monaco.editor.IStandaloneCodeEditor;
