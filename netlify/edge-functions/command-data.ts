import { COMMAND_LESSONS } from '../../src/commands/commandCatalog.ts';

/**
 * Edge-function-facing command index derived from the canonical learner catalog.
 * Keep this adapter free of duplicated command metadata so the sitemap and tests
 * always consume the same 200-command source of truth.
 */
export const COMMAND_INDEX = COMMAND_LESSONS.map(({ name, summary, example }) => ({
  name,
  description: summary,
  example,
}));
