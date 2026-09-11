import { StructuredLinuxEngine } from '../engine/StructuredLinuxEngine.ts';
import type { CommandResult } from '../engine/CommandResult.ts';
import { LinuxObservatory } from './Observatory.ts';
import { LinuxTutorContext, type TutorContext } from './AITutorContext.ts';
import { AlpineIntegration } from './AlpineIntegration.ts';
import { MobileTerminalController } from './MobileTerminal.ts';
import { ExecutableCommandCatalog } from './ExecutableCommandCatalog.ts';
import { LEARNING_PATHS, type LearningLevel } from './LearningPaths.ts';

export class P1Runtime {
  readonly engine = new StructuredLinuxEngine();
  readonly observatory: LinuxObservatory;
  readonly tutor: LinuxTutorContext;
  readonly alpine: AlpineIntegration;
  readonly mobile = new MobileTerminalController();
  readonly catalog = new ExecutableCommandCatalog();
  readonly paths = LEARNING_PATHS;
  private level: LearningLevel;

  constructor(level: LearningLevel = 'beginner', observatory = new LinuxObservatory('SIMULATED')) {
    this.level = level;
    this.observatory = observatory;
    this.tutor = new LinuxTutorContext(observatory);
    this.alpine = new AlpineIntegration();
  }

  setLevel(level: LearningLevel): void { this.level = level; }
  getLevel(): LearningLevel { return this.level; }

  async execute(commandLine: string): Promise<{ result: CommandResult; tutorContext: TutorContext }> {
    const result = await this.engine.executeResult(commandLine);
    return {
      result,
      tutorContext: this.tutor.build(this.level, commandLine, result, this.engine.getCwd()),
    };
  }
}
