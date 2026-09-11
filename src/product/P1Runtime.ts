import { StructuredLinuxEngine } from '../engine/StructuredLinuxEngine.ts';
import type { CommandResult } from '../engine/CommandResult.ts';

export type LearningLevel = 'beginner' | 'intermediate' | 'expert';
export interface TutorContext { level: LearningLevel; command: string; exitCode: number; cwd: string; hint: string; }

export interface LearningPath { id: LearningLevel; title: string; description: string; commands: string[]; }
export const LEARNING_PATHS: LearningPath[] = [
  { id: 'beginner', title: 'Beginner', description: 'Shell navigation and everyday commands.', commands: ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo'] },
  { id: 'intermediate', title: 'Intermediate', description: 'Pipelines, redirection, search, and scripting.', commands: ['grep', 'find', 'sort', 'uniq', 'wc', '>', '|', '&&'] },
  { id: 'expert', title: 'Expert', description: 'System concepts, compilation, and advanced shell work.', commands: ['gcc', 'ps', 'top', 'df', 'free', 'chmod', 'env'] },
];

export class LinuxObservatory {
  constructor(readonly mode: 'SIMULATED' | 'ALPINE' = 'SIMULATED') {}
  record(_result: CommandResult): void {}
}

export class LinuxTutorContext {
  constructor(private readonly observatory: LinuxObservatory) {}
  build(level: LearningLevel, command: string, result: CommandResult, cwd: string): TutorContext {
    this.observatory.record(result);
    const hint = result.exitCode === 0 ? `Command completed successfully in ${cwd}.` : `Command exited with status ${result.exitCode}; inspect stderr and try the command again.`;
    return { level, command, exitCode: result.exitCode, cwd, hint };
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

export class ExecutableCommandCatalog {
  readonly commands = ['pwd', 'ls', 'cd', 'mkdir', 'touch', 'cat', 'echo', 'grep', 'find', 'sort', 'uniq', 'wc', 'gcc', 'ps', 'top', 'df', 'free', 'chmod', 'env'];
  has(command: string): boolean { return this.commands.includes(command); }
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
