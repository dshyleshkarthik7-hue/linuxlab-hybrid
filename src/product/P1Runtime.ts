import { StructuredLinuxEngine } from '../engine/StructuredLinuxEngine.ts';
import type { CommandResult } from '../engine/CommandResult.ts';
import { LinuxObservatory } from '../observability/LinuxObservatory.ts';
import { COMMAND_LESSONS } from '../commands/commandCatalog.ts';

export type LearningLevel = 'beginner' | 'intermediate' | 'expert';
export interface TutorContext {
  level: LearningLevel;
  command: string;
  exitCode: number;
  cwd: string;
  hint: string;
  explanation: string;
  nextStep: string;
  telemetry: ReturnType<LinuxObservatory['system']>;
}

export interface LearningPath { id: LearningLevel; title: string; description: string; commands: string[]; }
export const LEARNING_PATHS: LearningPath[] = [
  { id: 'beginner', title: 'Beginner', description: 'Shell navigation and everyday commands.', commands: ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo'] },
  { id: 'intermediate', title: 'Intermediate', description: 'Pipelines, redirection, search, and scripting.', commands: ['grep', 'find', 'sort', 'uniq', 'wc', '>', '|', '&&'] },
  { id: 'expert', title: 'Expert', description: 'System concepts, compilation, and advanced shell work.', commands: ['gcc', 'ps', 'top', 'df', 'free', 'chmod', 'env'] },
];

export class LinuxTutorContext {
  constructor(private readonly observatory: LinuxObservatory) {}
  build(level: LearningLevel, command: string, result: CommandResult, cwd: string): TutorContext {
    const telemetry = this.observatory.system();
    const name = command.trim().split(/\s+/)[0] ?? '';
    const lesson = COMMAND_LESSONS.find(item => item.name === name);
    const explanation = lesson?.summary ?? 'This command is outside the indexed curriculum.';
    const hint = result.exitCode === 0
      ? `${name || 'Command'} succeeded. ${explanation}.`
      : `${name || 'Command'} exited with status ${result.exitCode}. ${result.stderr.trim() || 'Inspect the arguments and command output.'}`;
    const nextStep = result.exitCode === 0
      ? level === 'beginner' ? 'Try changing one argument and observe the output.' : 'Compose this command with another command using a pipeline or conditional.'
      : 'Read stderr, correct the smallest mistake, then run the command again.';
    this.observatory.recordCommand(result, level, cwd);
    return { level, command, exitCode: result.exitCode, cwd, hint, explanation, nextStep, telemetry };
  }
}

export class AlpineIntegration {
  readonly distro = 'Alpine Linux';
  readonly status = 'SIMULATED';
}

export class MobileTerminalController {
  private compact = false;
  setCompactMode(value: boolean): void { this.compact = value; }
  isCompactMode(): boolean { return this.compact; }
}

const EXECUTABLE_COMMANDS = new Set([
  'pwd', 'ls', 'cd', 'tree', 'touch', 'cat', 'cp', 'mv', 'rm', 'mkdir', 'rmdir', 'head', 'tail', 'wc', 'cut', 'grep',
  'find', 'which', 'echo', 'printf', 'true', 'false', 'test', 'history', 'help', 'type', 'export', 'unset', 'env', 'printenv',
  'umask', 'chmod', 'id', 'whoami', 'groups', 'ps', 'top', 'pgrep', 'pkill', 'kill', 'nice', 'time', 'free', 'uname', 'hostname',
  'uptime', 'df', 'du', 'date', 'basename', 'dirname', 'realpath', 'sort', 'uniq', 'tr', 'rev', 'diff', 'cmp', 'strings', 'sed', 'awk',
  'gcc', 'clang', 'tar', 'gzip', 'gunzip', 'zip', 'unzip', 'sha256sum', 'md5sum', 'clear', 'man', 'alias', 'unalias', 'source',
  'read', 'set', 'shift', 'wait', 'exec', 'jobs', 'fg', 'bg', 'disown', 'sudo', 'su',
]);

export class ExecutableCommandCatalog {
  readonly commands = COMMAND_LESSONS.filter(item => EXECUTABLE_COMMANDS.has(item.name)).map(item => item.name);
  has(command: string): boolean { return EXECUTABLE_COMMANDS.has(command); }
  get size(): number { return this.commands.length; }
}

export class P1Runtime {
  readonly engine = new StructuredLinuxEngine();
  readonly observatory: LinuxObservatory;
  readonly tutor: LinuxTutorContext;
  readonly alpine = new AlpineIntegration();
  readonly mobile = new MobileTerminalController();
  readonly catalog = new ExecutableCommandCatalog();
  readonly paths = LEARNING_PATHS;
  private level: LearningLevel;

  constructor(level: LearningLevel = 'beginner', observatory = new LinuxObservatory('SIMULATED')) {
    this.level = level;
    this.observatory = observatory;
    this.tutor = new LinuxTutorContext(observatory);
  }
  setLevel(level: LearningLevel): void { this.level = level; }
  getLevel(): LearningLevel { return this.level; }
  async execute(commandLine: string): Promise<{ result: CommandResult; tutorContext: TutorContext }> {
    const result = await this.engine.executeResult(commandLine);
    return { result, tutorContext: this.tutor.build(this.level, commandLine, result, this.engine.getCwd()) };
  }
}
