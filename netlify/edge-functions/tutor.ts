const MODEL = Netlify.env.get('HF_MODEL') || 'google/gemma-2-2b-it';
const MAX_OUTPUT_TOKENS = 300;
const MAX_CONTEXT_CHARS = 5000;
const MAX_QUESTION_CHARS = 1200;
const WINDOW = 60_000;
const LIMIT = 12;
const TIMEOUT_MS = 15_000;
const buckets = new Map<string, { started: number; count: number }>();

const headers = (origin: string | null) => ({
  'access-control-allow-origin': origin === 'https://linuxterminal.me' ? origin : 'https://linuxterminal.me',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
});

const json = (body: Record<string, unknown>, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: h });

const fallback = (contextText: string, question: string): string => {
  const lower = `${question}\n${contextText}`.toLowerCase();
  if (lower.includes('command-not-found') || lower.includes('not found')) {
    return 'That command was not found in the current LinuxTerminal environment. Check the spelling with `command -v <command>` and verify that the lesson expects that tool.';
  }
  if (lower.includes('permission denied')) {
    return 'Permission denied means the current user lacks the required permission. Inspect the target with `ls -l` and learn the ownership and mode before changing anything.';
  }
  if (lower.includes('next') || lower.includes('hint')) {
    return 'Start with the command you just ran, inspect its exit status and output, then try one small variation. I can give a more specific hint when the AI service is available.';
  }
  return 'The AI Tutor is temporarily unavailable. Continue by inspecting the command output, exit status, recent command history and current working directory. The LinuxTerminal sandbox remains available.';
};

export default async (request: Request, context: any) => {
  const h = headers(request.headers.get('origin'));
  if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: h });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, h);

  const token = Netlify.env.get('HF_TOKEN');
  if (!token) return json({ error: 'AI Tutor is not configured on this deployment.' }, 503, h);

  const ip = context.ip || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.started >= WINDOW) {
    buckets.set(ip, { started: now, count: 1 });
  } else {
    bucket.count++;
    if (bucket.count > LIMIT) return json({ error: 'Tutor rate limit reached. Please wait a minute.' }, 429, h);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, h);
  }

  const question = String(body.question || '').trim().slice(0, MAX_QUESTION_CHARS);
  const contextText = String(body.context || '').trim().slice(0, MAX_CONTEXT_CHARS);
  if (!question) return json({ error: 'Question is required.' }, 400, h);

  const prompt = [
    'You are LinuxTerminal Tutor, a concise Linux teacher.',
    'Teach safely and accurately. Never execute commands, request secrets, or claim the browser sandbox is the host OS.',
    'Use the learner context to explain the command, error, recent history and next safe practice step.',
    'Prefer short explanations, concrete Linux concepts and one small practice step.',
    '',
    'Learner context:',
    contextText || '(no additional context)',
    '',
    'Question:',
    question,
  ].join('\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Force Hugging Face's own inference provider. There is deliberately no
        // automatic paid-provider fallback: exhausting the free allowance fails closed.
        model: `${MODEL}:hf-inference`,
        messages: [
          { role: 'system', content: 'You are LinuxTerminal Tutor. Answer as a safe, concise Linux instructor.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 402) {
        return json({ answer: fallback(contextText, question), model: 'local-fallback', limited: true }, 200, h);
      }
      console.error('Hugging Face Tutor API failed', response.status);
      return json({ answer: fallback(contextText, question), model: 'local-fallback', limited: true }, 200, h);
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) {
      return json({ answer: fallback(contextText, question), model: 'local-fallback', limited: true }, 200, h);
    }

    return json({ answer: answer.trim().slice(0, 5000), model: MODEL, provider: 'hf-inference' }, 200, h);
  } catch (error) {
    console.error('Hugging Face Tutor request failed', error instanceof Error ? error.message : String(error));
    return json({ answer: fallback(contextText, question), model: 'local-fallback', limited: true }, 200, h);
  } finally {
    clearTimeout(timeout);
  }
};
