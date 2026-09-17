import { COMMAND_LESSONS } from '../../src/commands/commandCatalog.ts';

const staticPages = [
  '/',
  '/beginner/',
  '/learn/',
  '/commands/',
  '/challenges/',
  '/quiz/',
  '/certificate/',
  '/verify/',
  '/curriculum/',
  '/about/',
  '/contact/',
  '/real-linux/',
];

export default () => {
  const urls = [
    ...staticPages,
    ...COMMAND_LESSONS.map((item) => `/commands/${encodeURIComponent(item.name)}/`),
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>https://linuxterminal.me${url}</loc></url>`),
    '</urlset>',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=UTF-8',
      'cache-control': 'public,max-age=3600',
    },
  });
};

export const config = { path: '/sitemap.xml' };
