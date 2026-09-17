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

/**
 * Netlify treats every TypeScript file directly under netlify/edge-functions
 * as an Edge Function entry point. Keep the named catalog export above for
 * application imports, while providing the required function default export
 * so Netlify can bundle this file without treating the data module as invalid.
 */
export default async function commandData(): Promise<Response> {
  return new Response('Not Found', { status: 404 });
}
