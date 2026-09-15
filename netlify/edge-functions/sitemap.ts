import { COMMAND_INDEX } from './command-data.ts';
const staticPages=['/','/beginner/','/learn/','/commands/','/challenges/','/quiz/','/certificate/','/verify/','/curriculum/','/about/','/contact/','/real-linux/'];
export default()=>{const urls=[...staticPages,...COMMAND_INDEX.map(item=>`/commands/${encodeURIComponent(item.name)}/`)];const body=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url=>`<url><loc>https://linuxterminal.me${url}</loc></url>`).join('')}</urlset>`;return new Response(body,{headers:{'content-type':'application/xml; charset=UTF-8','cache-control':'public,max-age=3600'}})};
export const config={path:'/sitemap.xml'};
