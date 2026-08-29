export async function onRequestGet(context: any) {
  const targetUrl =
    'https://github.com/dshyleshkarthik7-hue/linuxlab-hybrid/releases/download/v1.0.0/alpine.iso';

  // Fetch the release binary and follow GitHub S3 redirects
  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Cloudflare-Pages-Proxy',
    },
    redirect: 'follow',
  });

  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
