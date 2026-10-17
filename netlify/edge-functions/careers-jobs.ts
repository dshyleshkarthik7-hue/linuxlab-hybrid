const CACHE_SECONDS = 24 * 60 * 60;
const REMOTIVE_API = 'https://remotive.com/api/remote-jobs?search=linux&limit=30';

type RemotiveJob = {
  id?: unknown;
  url?: unknown;
  title?: unknown;
  company_name?: unknown;
  category?: unknown;
  job_type?: unknown;
  publication_date?: unknown;
  candidate_required_location?: unknown;
  salary?: unknown;
};
const safeText = (value: unknown, max = 180): string =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';

export default async (request: Request): Promise<Response> => {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'cache-control': `public, max-age=300, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400, stale-if-error=86400`,
  });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('allow', 'GET, HEAD');
    headers.set('cache-control', 'no-store');
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  try {
    const response = await fetch(REMOTIVE_API, {
      headers: { accept: 'application/json', 'user-agent': 'LinuxTerminal-Careers/1.0 (+https://linuxterminal.me/linux-careers/)' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      headers.set('cache-control', 'no-store');
      headers.set('retry-after', '3600');
      return new Response(JSON.stringify({ error: 'Job listings are temporarily unavailable. Please use the external job-board links.' }), { status: 503, headers });
    }
    const payload = await response.json() as { jobs?: unknown };
    if (!Array.isArray(payload.jobs)) throw new Error('Invalid job provider response');
    const jobs = (payload.jobs as RemotiveJob[]).slice(0, 30).flatMap((job) => {
      const url = typeof job.url === 'string' ? job.url : '';
      let parsed: URL;
      try { parsed = new URL(url); } catch { return []; }
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'remotive.com' || !parsed.pathname.startsWith('/remote-jobs/')) return [];
      const id = Number(job.id);
      const title = safeText(job.title, 160);
      const company = safeText(job.company_name, 120);
      if (!Number.isSafeInteger(id) || id <= 0 || !title || !company) return [];
      return [{
        id,
        title,
        company,
        category: safeText(job.category, 100),
        jobType: safeText(job.job_type, 50),
        publishedAt: safeText(job.publication_date, 40),
        location: safeText(job.candidate_required_location, 120),
        salary: safeText(job.salary, 100),
        url: parsed.toString(),
        source: 'Remotive',
      }];
    });
    const body = JSON.stringify({ source: 'Remotive', sourceUrl: 'https://remotive.com/remote-jobs', attribution: 'Remote job listings supplied by Remotive. Listings are delayed and may change; verify details on the source before applying.', fetchedAt: new Date().toISOString(), cacheSeconds: CACHE_SECONDS, jobs });
    return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
  } catch {
    headers.set('cache-control', 'no-store');
    headers.set('retry-after', '3600');
    return new Response(JSON.stringify({ error: 'Job listings are temporarily unavailable. Please use the external job-board links.' }), { status: 503, headers });
  }
};
