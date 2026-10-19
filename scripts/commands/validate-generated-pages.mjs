import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const EXPECTED = 6161;
const records = JSON.parse(await readFile("public/command-records.json", "utf8"));
const intelligence = JSON.parse(await readFile(".cache/command-intelligence.json", "utf8"));
if (records.records.length !== EXPECTED) {
  throw new Error(`expected ${EXPECTED} command records, found ${records.records.length}`);
}

const files = new Set(await readdir("public/commands"));
const seenTitles = new Set();
const seenCanonicals = new Set();
const indexableUrls = new Set();

for (const command of records.records) {
  const filename = path.basename(command.url);
  if (!files.has(filename)) throw new Error(`missing ${command.url}`);

  const html = await readFile(path.join("public/commands", filename), "utf8");
  if (!html.includes('rel="canonical"')) throw new Error(`invalid ${command.url}: missing canonical link`);
  if (!/<h1(?:\s|>)/i.test(html)) throw new Error(`invalid ${command.url}: missing h1 heading`);
  if (command.page?.status !== "complete") {
    for (const marker of ['aria-label="Breadcrumb"', "Practice"]) {
      if (!html.includes(marker)) throw new Error(`invalid ${command.url}: missing ${marker}`);
    }
  }

  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  if (!title) throw new Error(`missing title ${command.url}`);
  if (seenTitles.has(title)) throw new Error(`duplicate title ${title}`);
  seenTitles.add(title);

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/i)?.[1];
  if (!canonical) throw new Error(`missing canonical ${command.url}`);
  if (seenCanonicals.has(canonical)) throw new Error(`duplicate canonical ${canonical}`);
  seenCanonicals.add(canonical);

  // Parse the robots meta element independently of attribute order, quote style,
  // and insignificant whitespace so valid HTML formatting does not fail the gate.
  const robotsTag = html.match(/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/i)?.[0] || "";
  const robots = (robotsTag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const shouldIndex = command.page?.status === "complete" && typeof command.page?.source === "string";
  if (shouldIndex && !robots.startsWith("index,")) throw new Error(`indexable command lacks index directive: ${command.url}`);
  if (!shouldIndex && !robots.startsWith("noindex")) throw new Error(`thin command must be noindex: ${command.url}`);
  if (shouldIndex) indexableUrls.add(command.url);
  if (!html.includes("application/ld+json") && command.page?.status !== "complete") {
    throw new Error(`generated page lacks structured data: ${command.url}`);
  }
}

const sitemap = await readFile("public/sitemap.xml", "utf8");
const sitemapCommandUrls = new Set(
  [...sitemap.matchAll(/<loc>https:\/\/linuxterminal\.me(\/commands\/[^<]+)<\/loc>/g)]
    .map((match) => match[1])
);
for (const url of indexableUrls) {
  if (!sitemapCommandUrls.has(url)) throw new Error(`sitemap missing indexable command ${url}`);
}
for (const url of sitemapCommandUrls) {
  if (!indexableUrls.has(url)) throw new Error(`sitemap includes non-indexable command ${url}`);
}

console.log(`validated ${EXPECTED} command records, unique titles/canonicals, indexability, and sitemap contract`);
