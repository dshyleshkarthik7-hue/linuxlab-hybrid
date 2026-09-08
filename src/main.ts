import * as xtermModule from '@xterm/xterm';
import * as fitModule from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import * as monaco from 'monaco-editor';

// Vite worker imports for Monaco Editor
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

// Define the global Monaco environment to resolve workers
(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

import { InBrowserLinuxEngine } from './engine/LinuxEngine';
import { AssessmentRunner } from './engine/AssessmentRunner';
import { StorageService } from './core/StorageService';

const TerminalConstructor = (xtermModule as any).Terminal || (xtermModule as any).default?.Terminal || (xtermModule as any).default || xtermModule;
const FitAddonConstructor = (fitModule as any).FitAddon || (fitModule as any).default?.FitAddon || (fitModule as any).default || fitModule;

class LinuxLabApp {
  private engine: InBrowserLinuxEngine;
  private assessment: AssessmentRunner;
  private editor: monaco.editor.IStandaloneCodeEditor | null = null;
  private simTerm: any;
  private simFitAddon: any;

  private currentFile: string = 'main.c';
  private currentInputBuffer: string = '';
  private waitingForProgramInput = false;
  private pendingProgramCommand = '';
  private commandHistory: string[] = [];
  private replaceTerminalInput(next: string): void {
    while (this.currentInputBuffer.length) {
      this.simTerm.write('\\b \\b');
      this.currentInputBuffer = this.currentInputBuffer.slice(0, -1);
    }
    this.currentInputBuffer = next;
    this.simTerm.write(next);
  }

  private sessionId = crypto.randomUUID();
  private sessionStartedAt = Date.now();

  constructor() {
    this.sessionId = crypto.randomUUID();
      this.sessionStartedAt = Date.now();
      this.engine = new InBrowserLinuxEngine();
    this.assessment = new AssessmentRunner(this.engine);

    requestAnimationFrame(() => {
      this.initSimulatorTerminal();
      this.initMonaco();
      this.bindEvents();
      void this.restoreWorkspace();
    });
  }

  private initMonaco(): void {
    const container = document.getElementById('monaco-container');
    if (!container) return;

    const initialCode = this.engine.readFile('/root/main.c') || '';

    this.editor = monaco.editor.create(container, {
      value: initialCode,
      language: 'c',
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", monospace',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
    });

    this.attachEditorHook();

    setTimeout(() => {
      this.editor?.layout();
    }, 200);
  }

  private attachEditorHook(): void {
    this.engine.setEditorHook((filename: string, content: string) => this.switchFileTab(filename, content));
  }

  private initSimulatorTerminal(): void {
    const container = document.getElementById('simulator-terminal-container');
    if (!container) return;

    this.simTerm = new TerminalConstructor({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
      theme: {
        background: '#020617',
        foreground: '#e2e8f0',
        cursor: '#38bdf8',
        selectionBackground: '#1e3a8a',
      },
      convertEol: true,
      rows: 24,
      cols: 80,
    });

    this.simFitAddon = new FitAddonConstructor();
    this.simTerm.loadAddon(this.simFitAddon);
    this.simTerm.open(container);

    setTimeout(() => {
      try {
        this.simFitAddon.fit();
      } catch (error) { console.warn('[LinuxLab] Terminal fit failed:', error); }
    }, 150);

    this.simTerm.writeln('\x1b[1;36m====================================================\x1b[0m');
    this.simTerm.writeln('\x1b[1;32m   LinuxLab Engine A: Interactive Web Shell & POSIX  \x1b[0m');
    this.simTerm.writeln('\x1b[1;36m====================================================\x1b[0m');
    this.simTerm.writeln('\x1b[1;33mEDUCATIONAL SANDBOX — NOT A REAL LINUX KERNEL. Some commands, networking, and compilation behavior are simulated.\x1b[0m');
    this.simTerm.writeln('For real kernel/system behavior use the Real Linux Lab. Never treat sandbox network output as a real connection.');
    this.simTerm.writeln('C runtime: \x1b[33mgcc main.c -o app && ./app\x1b[0m | input: \x1b[33m./app 42\x1b[0m | \x1b[33mhelp\x1b[0m');
    this.simTerm.writeln('Supports educational C: variables, arrays, functions, if/else, for/while, printf, scanf, strings/math helpers. Real/full C: Engine B + GCC.\r\n');
    this.simTerm.write(this.engine.getPrompt());

    this.simTerm.onData((data: string) => {
      this.handleInput(data);
    });
  }

  private handleInput(data: string): void {
    if (data === '\r') {
      this.simTerm.writeln('');
      const cmd = this.currentInputBuffer;
      this.currentInputBuffer = '';

      if (cmd.trim().length > 0) {
        void this.executeTerminalCommand(cmd);
      } else {
        this.simTerm.write(this.engine.getPrompt());
      }
      return;
    }

    if (data === '\u007F' || data === '\b') {
      if (this.currentInputBuffer.length > 0) {
        this.currentInputBuffer = this.currentInputBuffer.slice(0, -1);
        this.simTerm.write('\b \b');
      }
      return;
    }

    if (data >= ' ' || data === '\t') {
      this.currentInputBuffer += data;
      this.simTerm.write(data);
    }
  }

  private replaceTerminalInput(next: string): void {
    while (this.currentInputBuffer.length) {
      this.simTerm.write('\\b \\b');
      this.currentInputBuffer = this.currentInputBuffer.slice(0, -1);
    }
    this.currentInputBuffer = next;
    this.simTerm.write(next);
  }

  private async executeTerminalCommand(cmd: string): Promise<void> {
    // The learning runtime normally receives stdin as arguments. Make scanf feel
    // interactive by pausing the terminal and collecting those values first.
    if (this.waitingForProgramInput) {
      this.waitingForProgramInput = false;
      const pending = this.pendingProgramCommand;
      this.pendingProgramCommand = '';
      cmd = `${pending} ${cmd.trim()}`.trim();
    } else {
      const source = this.engine.readFile('/root/main.c') || '';
      const executesProgram = /(^|&&\s*)\.\/[^\s]+(?:\s|$)/.test(cmd);
      const alreadyHasInput = /\.\/[^\s]+\s+[^&\s]/.test(cmd);
      if (executesProgram && /scanf\s*\(/.test(source) && !alreadyHasInput) {
        this.waitingForProgramInput = true;
        this.pendingProgramCommand = cmd;
        this.simTerm.writeln('\x1b[33m[Program paused for input]\x1b[0m');
        this.simTerm.write('Enter value(s) (for example: 5), then press Enter: ');
        return;
      }
    }

    try {
      this.commandHistory.push(cmd);
      if (this.commandHistory.length > 200) this.commandHistory.shift();
      const output = await this.engine.execute(cmd);
      if (output) this.simTerm.writeln(output);
      void this.persistSession(cmd);
    } catch (error) {
      console.error('[LinuxLab] Command execution failed:', error);
      this.simTerm.writeln(`\x1b[31mError: ${error instanceof Error ? error.message : String(error)}\x1b[0m`);
    } finally {
      this.simTerm.write(this.engine.getPrompt());
    }
  }

  private async persistSession(command: string): Promise<void> {
    try {
      const existing = await StorageService.getSessions();
      const current = existing.find(s => s.id === this.sessionId);
      const commands = [...(current?.commands ?? []), command].slice(-200);
      await StorageService.saveSession({
        id: this.sessionId,
        mode: 'simulator' as const,
        title: 'POSIX Simulator Session',
        startedAt: this.sessionStartedAt,
        updatedAt: Date.now(),
        commands,
      });
    } catch (error) { console.warn('[LinuxLab] Session save failed:', error); }
  }

  private switchFileTab(filename: string, forcedContent?: string): void {
    this.currentFile = filename;
    const content = forcedContent ?? this.engine.readFile(`/root/${filename}`) ?? '';
    const lang = filename.endsWith('.java') ? 'java' : 'c';

    if (this.editor) {
      const model = this.editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, lang);
      }
      this.editor.setValue(content);
    }

    document.querySelectorAll('.file-tab').forEach((tab) => tab.classList.remove('active'));
    if (filename === 'main.c') document.getElementById('tab-main-c')?.classList.add('active');
    if (filename === 'Main.java') document.getElementById('tab-main-java')?.classList.add('active');
  }


  private async restoreWorkspace(): Promise<void> {
    try {
      const saved = await StorageService.getWorkspace();
      for (const [filename, content] of Object.entries(saved)) {
        if (filename === 'main.c' || filename === 'Main.java') {
          this.engine.writeFile(`/root/${filename}`, content);
        }
      }
      const restored = saved[this.currentFile];
      if (restored !== undefined) this.switchFileTab(this.currentFile, restored);
      const feedback = document.getElementById('test-output-list');
      if (feedback && Object.keys(saved).length) {
        feedback.replaceChildren(); const notice = document.createElement('span'); notice.style.color = '#38bdf8'; notice.textContent = '↻ Restored saved workspace from IndexedDB.'; feedback.appendChild(notice);
      }
    } catch (error) {
      console.warn('[LinuxLab] Workspace restore unavailable:', error);
    }
  }

  private saveCurrentEditorToFS(): void {
    if (!this.editor) return;
    const val = this.editor.getValue();
    this.engine.writeFile(`/root/${this.currentFile}`, val);
    void StorageService.saveFile(this.currentFile, val).catch((error) => console.warn('[LinuxLab] IndexedDB save failed:', error));

    const feedback = document.getElementById('test-output-list');
    if (feedback) {
      feedback.replaceChildren(); const notice = document.createElement('span'); notice.style.color = '#4ade80'; notice.textContent = `✓ Saved '/root/${this.currentFile}' to Virtual File System.`; feedback.appendChild(notice);
    }
  }

  private runAutomatedGrading(): void {
    if (!this.editor) return;
    this.saveCurrentEditorToFS();
    const code = this.editor.getValue();
    const feedbackList = document.getElementById('test-output-list');
    if (!feedbackList) return;

    let res;
    if (this.currentFile.endsWith('.java')) {
      res = this.assessment.runJavaTestSuite(code);
    } else {
      res = this.assessment.runCTestSuite(code);
    }

    feedbackList.replaceChildren();
    const summary = document.createElement('div');
    summary.className = 'assessment-summary';
    summary.textContent = `${res.score}% — ${res.passed}/${res.total} checks passed`;
    feedbackList.appendChild(summary);
    for (const check of res.checks) {
      const line = document.createElement('div');
      line.className = check.passed ? 'assessment-check passed' : 'assessment-check failed';
      line.textContent = `${check.passed ? '✓' : '○'} ${check.label} — ${check.feedback}`;
      feedbackList.appendChild(line);
    }
    void StorageService.saveProgress(this.currentFile.endsWith('.java') ? 'java-prime' : 'c-table', res.score, res.score >= 80)
      .catch((error) => console.warn('[LinuxLab] Progress save failed:', error));
  }

  private bindEvents(): void {
    document.getElementById('tab-main-c')?.addEventListener('click', () => this.switchFileTab('main.c'));
    document.getElementById('tab-main-java')?.addEventListener('click', () => this.switchFileTab('Main.java'));
    document.getElementById('btn-save-fs')?.addEventListener('click', () => this.saveCurrentEditorToFS());
    document.getElementById('btn-run-tests')?.addEventListener('click', () => this.runAutomatedGrading());

    document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
      this.simTerm.clear();
      this.currentInputBuffer = '';
      this.simTerm.write(this.engine.getPrompt());
    });

    document.querySelectorAll<HTMLButtonElement>('.learning-step').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.learning-step').forEach(item => item.classList.remove('active'));
        button.classList.add('active');
        const cmd = button.dataset.cmd ?? '';
        this.currentInputBuffer = cmd;
        this.simTerm.write('\r\n' + this.engine.getPrompt() + cmd);
      });
    });

    document.getElementById('btn-reset')?.addEventListener('click', () => {
      this.currentInputBuffer = '';
      this.waitingForProgramInput = false;
      this.pendingProgramCommand = '';
      this.engine = new InBrowserLinuxEngine();
      this.attachEditorHook();
      this.assessment = new AssessmentRunner(this.engine);
      this.switchFileTab('main.c');
      this.simTerm.clear();
      this.simTerm.writeln('\x1b[33m[Virtual Environment Reset Complete]\x1b[0m\r\n');
      this.simTerm.write(this.engine.getPrompt());
    });

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveCurrentEditorToFS();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.runAutomatedGrading();
      }
    });

    window.addEventListener('resize', () => {
      this.editor?.layout();
      try {
        this.simFitAddon?.fit();
      } catch (error) { console.warn('[LinuxLab] Terminal resize failed:', error); }
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new LinuxLabApp();
});