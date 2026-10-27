import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { isCommandIndexable, commandCanonicalUrl, commandRobotsContent } from "./indexability.mjs";

const EXPECTED = 6161;
const records = JSON.parse(await readFile("public/command-records.json", "utf8"));
const intelligence = JSON.parse(await readFile(".cache/command-intelligence.json", "utf8"));
if (records.records.length !== EXPECTED) {
  throw new Error(`expected ${EXPECTED} command records, found ${records.records.length}`);
}

const files = new Set(await readdir("public/commands"));
const commandPaths = new Set(records.records.flatMap((command) => {
  const pathname = new URL(command.url, "https://linuxterminal.me").pathname;
  // The site supports both generated .html URLs and clean trailing-slash aliases.
  const cleanAlias = pathname.endsWith(".html") ? pathname.slice(0, -5) + "/" : pathname.endsWith("/") ? pathname.slice(0, -1) + ".html" : pathname;
  return [pathname, cleanAlias];
}));
const isComplete = (command) => command.page?.status === "complete" || command.intelligence?.status === "complete";
const isPlanned = (command) => !isComplete(command) && (command.page?.status === "planned" || command.intelligence?.status === "planned");
const coverage = {
  totalCatalogEntries: records.records.length,
  complete: records.records.filter(isComplete).length,
  planned: records.records.filter(isPlanned).length,
  withoutCompleteOrPlannedLesson: records.records.filter((command) => !isComplete(command) && !isPlanned(command)).length,
};

const seenTitles = new Set();
const seenCanonicals = new Set();
const indexableUrls = new Set();

for (const command of records.records) {
  const filename = path.basename(command.url);
  if (!files.has(filename)) throw new Error(`missing ${command.url}`);

  const html = await readFile(path.join("public/commands", filename), "utf8");
  // Validate command-to-command links against the canonical generated catalog.
  // Ignore external URLs and the command index, but fail on broken internal lesson links.
  for (const match of html.matchAll(/\bhref\s*=\s*["'](\/commands\/[^"'#]*)["']/gi)) {
    const linkedPath = new URL(match[1], "https://linuxterminal.me").pathname;
    if (linkedPath !== "/commands/" && !commandPaths.has(linkedPath)) {
      throw new Error(`broken internal command link in ${command.url}: ${match[1]}`);
    }
  }
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

  const canonical = html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1];
  if (!canonical) throw new Error(`missing canonical ${command.url}`);
  if (seenCanonicals.has(canonical)) throw new Error(`duplicate canonical ${canonical}`);
  seenCanonicals.add(canonical);

  // Parse the robots meta element independently of attribute order, quote style,
  // and insignificant whitespace so valid HTML formatting does not fail the gate.
  const robotsTag = html.match(/<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/i)?.[0] || "";
  const robots = (robotsTag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] || "")
    .toLowerCase()
    .replace(/\s+/g, "");
  const shouldIndex = isCommandIndexable(command, intelligence.records?.[command.name]);
  const expectedCanonical = commandCanonicalUrl(command);
  if (canonical !== expectedCanonical) throw new Error("canonical mismatch for " + command.url + ": expected " + expectedCanonical + ", found " + canonical);
  const expectedRobots = commandRobotsContent(command, intelligence.records?.[command.name]).replace(/\s+/g, "");
  if (robots !== expectedRobots) throw new Error("robots/indexability mismatch for " + command.url + ": expected " + expectedRobots + ", found " + robots);
  const ogUrl = html.match(/<meta\b(?=[^>]*\bproperty\s*=\s*["']og:url["'])[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*>/i)?.[1];
  if (ogUrl !== expectedCanonical) throw new Error("og:url mismatch for " + command.url + ": expected " + expectedCanonical + ", found " + ogUrl);
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

console.log(
  `validated ${EXPECTED} command records, unique titles/canonicals, internal command links, indexability, and sitemap contract; coverage: ` +
  JSON.stringify(coverage)
);
