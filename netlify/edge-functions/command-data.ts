import { COMMAND_LESSONS } from '../../src/commands/commandCatalog.ts';

export type CommandIndexItem = {
  name: string;
  description: string;
  example: string;
};

/**
 * Sitemap command index derived from the canonical learner catalog.
 * Keep command metadata in src/commands/commandCatalog.ts only.
 */
export const COMMAND_INDEX: readonly CommandIndexItem[] = COMMAND_LESSONS.map((command) => ({
  name: command.name,
  description: command.summary,
  example: command.example,
}));
