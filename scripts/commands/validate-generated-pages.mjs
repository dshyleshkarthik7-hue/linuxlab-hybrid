import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const EXPECTED = 6161;
const records = JSON.parse(await readFile("public/command-records.json", "utf8"));
if (records.records.length !== EXPECTED) {
  throw new Error(`expected ${EXPECTED} command records, found ${records.records.length}`);
}

const files = new Set(await readdir("public/commands"));
const seenTitles = new Set();
const seenCanonicals = new Set();

for (const command of records.records) {
  const filename = path.basename(command.url);
  if (!files.has(filename)) throw new Error(`missing ${command.url}`);

  const html = await readFile(path.join("public/commands", filename), "utf8");
  for (const marker of ["rel=\"canonical\"", "<h1>", "application/ld+json", 'aria-label="Breadcrumb"', "Practice"]) {
    if (!html.includes(marker)) throw new Error(`invalid ${command.url}: missing ${marker}`);
  }

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  if (!title) throw new Error(`missing title ${command.url}`);
  if (seenTitles.has(title)) throw new Error(`duplicate title ${title}`);
  seenTitles.add(title);

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  if (!canonical) throw new Error(`missing canonical ${command.url}`);
  if (seenCanonicals.has(canonical)) throw new Error(`duplicate canonical ${canonical}`);
  seenCanonicals.add(canonical);
}

const sitemap = await readFile("public/sitemap.xml", "utf8");
const sitemapCommandUrls = new Set(
  [...sitemap.matchAll(/<loc>https:\/\/linuxterminal\.me(\/commands\/[^<]+)<\/loc>/g)]
    .map((match) => match[1])
);

for (const command of records.records) {
  if (!sitemapCommandUrls.has(command.url)) {
    throw new Error(`sitemap missing ${command.url}`);
  }
}
if (sitemapCommandUrls.size !== EXPECTED) {
  throw new Error(`sitemap contains ${sitemapCommandUrls.size} command URLs; expected ${EXPECTED}`);
}

console.log(`validated ${EXPECTED} command pages, unique titles/canonicals, and sitemap coverage`);
