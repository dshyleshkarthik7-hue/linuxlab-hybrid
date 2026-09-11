import { COMMAND_LESSONS, type LinuxCommandLesson } from '../commands/commandCatalog.ts';
import { InBrowserLinuxEngine } from '../engine/LinuxEngine.ts';
import type { CommandResult } from '../engine/CommandResult.ts';
import { LinuxObservatory, type ProcessTelemetry, type SystemTelemetry } from '../observability/LinuxObservatory.ts';

export type LearningLevel = 'beginner' | 'intermediate' | 'expert';

export type LevelPath = {
  id: LearningLevel;
  title: string;
  description: string;
  focus: readonly string[];
  prerequisites: readonly LearningLevel[];
};

export const LEARNING_PATHS: readonly LevelPath[] = [
  { id: 'beginner', title: 'Beginner', description: 'Filesystem, files, text, shell composition.', focus: ['pwd','ls','cd','mkdir','touch','cat','echo','grep','true','false','test','pipes','redirection'], prerequisites: [] },
  { id: 'intermediate', title: 'Intermediate', description: 'Permissions, processes, networking, and troubleshooting.', focus: ['chmod','chown','ps','kill','find','sed','awk','ip','df','free'], prerequisites: ['beginner'] },
  { id: 'expert', title: 'Expert', description: 'Diagnostics, automation, services, storage, and performance.', focus: ['strace','lsof','systemctl','journalctl','mount','tar','ssh','curl','xargs','awk'], prerequisites: ['beginner','intermediate'] },
];

// Only commands proven to have an implementation in InBrowserLinuxEngine are advertised as executable.
export const EXECUTABLE_COMMANDS = new Set([
  'clear','pwd','whoami','date','echo','uname','ping','curl','traceroute','ifconfig','ip','top','htop','ps','free','df',
  'ls','cd','mkdir','touch','rm','cp','mv','find','true','false','test','[','cat','grep','nano','vi','vim','which',
]);

export type ExecutableCommand = LinuxCommandLesson & { executable: true; level: LearningLevel };

export class ExecutableCommandCatalog {
  constructor(private readonly lessons: readonly LinuxCommandLesson[] = COMMAND_LESSONS) {}
  all(): readonly LinuxCommandLesson[] { return this.lessons; }
  isExecutable(name: string): boolean { return EXECUTABLE_COMMANDS.has(name); }
  forLevel(level: LearningLevel): readonly ExecutableCommand[] {
    const path = LEARNING_PATHS.find(p => p.id === level)!;
    const allowed = level === 'expert' ? new Set(this.lessons.map(x => x.name)) : new Set(path.focus);
    return this.lessons.filter(x => allowed.has(x.name) && this.isExecutable(x.name)).map(x => ({ ...x, executable: true, level }));
  }
}

export type TutorContext = {
  level: LearningLevel; command: string; argv: readonly string[]; cwd: string;
  stdout: string; stderr: string; exitCode: number; telemetry: SystemTelemetry; processes: readonly ProcessTelemetry[];
};

export class LinuxTutorContext {
  constructor(private readonly observatory: LinuxObservatory) {}
  build(level: LearningLevel, commandLine: string, result: CommandResult, cwd: string): TutorContext {
    const tokens = commandLine.trim().split(/\s+/).filter(Boolean);
    return { level, command: tokens[0] ?? '', argv: tokens.slice(1), cwd, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, telemetry: this.observatory.system(), processes: this.observatory.processTree() };
  }
  prompt(context: TutorContext): string {
    return [`Learning level: ${context.level}`, `Command: ${context.command}`, `Arguments: ${context.argv.join(' ')}`, `Working directory: ${context.cwd}`, `Exit code: ${context.exitCode}`, `stdout:\n${context.stdout}`, `stderr:\n${context.stderr}`, `Telemetry source: ${context.telemetry.source}`, 'Give a level-appropriate hint and diagnostic question before the complete solution.'].join('\n');
  }
}

export type AlpineImage = { id: 'developer' | 'virt' | 'linux4'; url: string; version: string; architecture: 'x86'; sha256: string | null };
export const ALPINE_IMAGES: readonly AlpineImage[] = [
  { id: 'developer', url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso', version: 'v1.0.0', architecture: 'x86', sha256: null },
  { id: 'virt', url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/V2.00/alpine-virt-3.24.1-x86.iso', version: '3.24.1', architecture: 'x86', sha256: null },
  { id: 'linux4', url: 'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v3.00/linux4.iso', version: 'v3.00', architecture: 'x86', sha256: null },
];

export class AlpineIntegration {
  constructor(private readonly image: AlpineImage = ALPINE_IMAGES[0]) {
    if (!image.url.startsWith('https://') || !image.version) throw new Error('Alpine image must have a versioned HTTPS URL');
  }
  metadata(): AlpineImage { return { ...this.image }; }
  isIntegrityVerified(): boolean { return Boolean(this.image.sha256 && /^[a-f0-9]{64}$/i.test(this.image.sha256)); }
}

export type MobileTerminalState = { keyboardVisible: boolean; viewportHeight: number; safeBottomInset: number; fontScale: number };
export class MobileTerminalController {
  private state: MobileTerminalState = { keyboardVisible: false, viewportHeight: 0, safeBottomInset: 0, fontScale: 1 };
  updateViewport(height: number, inset = 0): MobileTerminalState { this.state = { ...this.state, viewportHeight: Math.max(0, Math.floor(height)), safeBottomInset: Math.max(0, Math.floor(inset)) }; return this.snapshot(); }
  setKeyboardVisible(visible: boolean): MobileTerminalState { this.state = { ...this.state, keyboardVisible: visible }; return this.snapshot(); }
  adjustFontScale(delta: number): MobileTerminalState { this.state = { ...this.state, fontScale: Math.min(1.5, Math.max(.85, this.state.fontScale + delta)) }; return this.snapshot(); }
  snapshot(): MobileTerminalState { return { ...this.state }; }
}

export class P1Runtime {
  readonly engine = new InBrowserLinuxEngine();
  readonly observatory: LinuxObservatory;
  readonly tutor: LinuxTutorContext;
  readonly alpine: AlpineIntegration;
  readonly mobile = new MobileTerminalController();
  readonly catalog = new ExecutableCommandCatalog();
  readonly paths = LEARNING_PATHS;
  private level: LearningLevel;
  constructor(level: LearningLevel = 'beginner', observatory = new LinuxObservatory('SIMULATED')) { this.level = level; this.observatory = observatory; this.tutor = new LinuxTutorContext(observatory); this.alpine = new AlpineIntegration(); }
  setLevel(level: LearningLevel): void { this.level = level; }
  getLevel(): LearningLevel { return this.level; }
  async execute(commandLine: string): Promise<{ result: CommandResult; tutorContext: TutorContext }> {
    const started = performance.now();
    const stdout = await this.engine.execute(commandLine);
    const exitCode = this.engine.getExitCode();
    const result: CommandResult = { command: commandLine, stdout: exitCode === 0 ? stdout : '', stderr: exitCode === 0 ? '' : stdout, exitCode, durationMs: Math.max(0, performance.now() - started) };
    return { result, tutorContext: this.tutor.build(this.level, commandLine, result, this.engine.getCwd()) };
  }
}
