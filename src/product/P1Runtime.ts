import { StructuredLinuxEngine } from '../engine/StructuredLinuxEngine.ts';
import type { CommandResult } from '../engine/CommandResult.ts';
import { LinuxObservatory } from '../observability/LinuxObservatory.ts';
import { COMMAND_LESSONS } from '../commands/commandCatalog.ts';

export type LearningLevel = 'beginner' | 'intermediate' | 'expert';
export interface ProductTelemetry { command: string; level: LearningLevel; cwd: string; exitCode: number; stdoutBytes: number; stderrBytes: number; durationMs: number; timestamp: number; }
export interface TutorContext { level: LearningLevel; command: string; exitCode: number; cwd: string; hint: string; explanation: string; nextStep: string; telemetry: ReturnType<ProductObservatory['system']>; }
export interface LearningPath { id: LearningLevel; title: string; description: string; commands: string[]; }
export const LEARNING_PATHS: LearningPath[] = [
  { id: 'beginner', title: 'Beginner', description: 'Shell navigation and everyday commands.', commands: ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo'] },
  { id: 'intermediate', title: 'Intermediate', description: 'Pipelines, redirection, search, and scripting.', commands: ['grep', 'find', 'sort', 'uniq', 'wc', '>', '|', '&&'] },
  { id: 'expert', title: 'Expert', description: 'System concepts, compilation, and advanced shell work.', commands: ['gcc', 'ps', 'top', 'df', 'free', 'chmod', 'env'] },
];

export class ProductObservatory extends LinuxObservatory {
  private readonly commandTelemetry: ProductTelemetry[] = [];
  recordCommand(result: CommandResult, level: LearningLevel, cwd: string): void {
    this.commandTelemetry.push({ command: result.command, level, cwd, exitCode: result.exitCode, stdoutBytes: new TextEncoder().encode(result.stdout).byteLength, stderrBytes: new TextEncoder().encode(result.stderr).byteLength, durationMs: result.durationMs, timestamp: Date.now() });
    if (this.commandTelemetry.length > 500) this.commandTelemetry.shift();
  }
  recentCommands(limit = 50): ProductTelemetry[] { return this.commandTelemetry.slice(-Math.max(0, limit)).map(item => ({ ...item })); }
  override system() { const base = super.system(); return { ...base, commandCount: this.commandTelemetry.length, failedCommandCount: this.commandTelemetry.filter(item => item.exitCode !== 0).length }; }
}

export class LinuxTutorContext {
  private readonly observatory: ProductObservatory;
  constructor(observatory: ProductObservatory) { this.observatory = observatory; }
  build(level: LearningLevel, command: string, result: CommandResult, cwd: string): TutorContext {
    this.observatory.recordCommand(result, level, cwd);
    const telemetry = this.observatory.system();
    const name = command.trim().split(/\s+/)[0] ?? '';
    const lesson = COMMAND_LESSONS.find(item => item.name === name);
    const explanation = lesson?.summary ?? 'This command is outside the indexed curriculum.';
    const hint = result.exitCode === 0 ? `${name || 'Command'} succeeded. ${explanation}.` : `${name || 'Command'} exited with status ${result.exitCode}. ${result.stderr.trim() || 'Inspect the arguments and command output.'}`;
    const nextStep = result.exitCode === 0 ? level === 'beginner' ? 'Try changing one argument and observe the output.' : 'Compose this command with another command using a pipeline or conditional.' : 'Read stderr, correct the smallest mistake, then run the command again.';
    return { level, command, exitCode: result.exitCode, cwd, hint, explanation, nextStep, telemetry };
  }
}

export class AlpineIntegration { readonly distro = 'Alpine Linux'; readonly status = 'SIMULATED'; }
export class MobileTerminalController { private compact = false; setCompactMode(value: boolean): void { this.compact = value; } isCompactMode(): boolean { return this.compact; } }

// Only commands that the structured simulator can execute deterministically belong here.
// Commands delegated to a real Alpine VM are intentionally not advertised by this catalog.
const EXECUTABLE_COMMANDS = new Set(['pwd','ls','cd','mkdir','touch','cat','cp','mv','rm','find','echo','printf','true','false','test','history','help','env','export','head','tail','wc','sort','uniq','grep','which','chmod','whoami','ps','top','htop','free','uname','uptime','df','date','gcc','clang','javac','java','clear','ping','curl','traceroute','ifconfig','ip','nano','vi','vim']);
export class ExecutableCommandCatalog { readonly commands = COMMAND_LESSONS.filter(item => EXECUTABLE_COMMANDS.has(item.name)).map(item => item.name); has(command: string): boolean { return EXECUTABLE_COMMANDS.has(command); } get size(): number { return this.commands.length; } }

export class P1Runtime {
  readonly engine = new StructuredLinuxEngine(); readonly observatory: ProductObservatory; readonly tutor: LinuxTutorContext; readonly alpine = new AlpineIntegration(); readonly mobile = new MobileTerminalController(); readonly catalog = new ExecutableCommandCatalog(); readonly paths = LEARNING_PATHS;
  private level: LearningLevel;
  constructor(level: LearningLevel = 'beginner', observatory = new ProductObservatory('SIMULATED')) { this.level = level; this.observatory = observatory; this.tutor = new LinuxTutorContext(observatory); }
  setLevel(level: LearningLevel): void { this.level = level; } getLevel(): LearningLevel { return this.level; }
  async execute(commandLine: string): Promise<{ result: CommandResult; tutorContext: TutorContext }> { const result = await this.engine.executeResult(commandLine); return { result, tutorContext: this.tutor.build(this.level, commandLine, result, this.engine.getCwd()) }; }
}
