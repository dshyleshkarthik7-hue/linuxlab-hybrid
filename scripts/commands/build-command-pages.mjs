import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const data = JSON.parse(await readFile(path.join(root, "public/command-records.json"), "utf8"));
const out = path.join(root, "public/commands");

await mkdir(out, { recursive: true });

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

for (const command of data.records) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(command.name + " command — Linux tutorial | LinuxTerminal.me")}</title>
<meta name="description" content="${escapeHtml(command.summary || "Linux command reference")}">
<link rel="canonical" href="https://linuxterminal.me${command.url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(command.name)} command — Linux tutorial | LinuxTerminal.me">
<meta property="og:description" content="${escapeHtml(command.summary || "Linux command reference")}">
<meta property="og:url" content="https://linuxterminal.me${command.url}">
<meta property="og:site_name" content="LinuxTerminal.me">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(command.name)} command — Linux tutorial | LinuxTerminal.me">
<meta name="twitter:description" content="${escapeHtml(command.summary || "Linux command reference")}">
<script type="application/ld+json">${JSON.stringify({"@context":"https://schema.org","@type":"TechArticle","headline":command.name+" command — Linux tutorial","description":command.summary || "Linux command reference","url":"https://linuxterminal.me"+command.url,"author":{"@type":"Organization","name":"LinuxTerminal.me","url":"https://linuxterminal.me/"},"isPartOf":{"@type":"WebSite","name":"LinuxTerminal.me","url":"https://linuxterminal.me/"}})}</script>
<link rel="stylesheet" href="/commands.css">
</head>
<body class="detail-page">
<main id="main-content" class="command-page">
<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="/commands/">Linux commands</a><span aria-hidden="true">›</span><span>${escapeHtml(command.name)}</span></nav>
<h1>${escapeHtml(command.name)} command</h1>
<p>${escapeHtml(command.summary)}</p>
<section><h2>What is ${escapeHtml(command.name)}?</h2><p>${escapeHtml(command.summary)} Use this page to understand the command, compare its availability and try it in LinuxTerminal’s browser practice environment.</p></section>
<section>
<h2>Internal execution process</h2>
<ol>
<li>Shell parses arguments.</li>
<li>Linux resolves the implementation.</li>
<li>The implementation performs its operation.</li>
<li>Output and exit status are returned.</li>
</ol>
</section>
<section>
<h2>Distro matrix</h2>
<table><tbody>
${Object.entries(command.availability || {})
  .map(([name, availability]) => `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(availability)}</td></tr>`)
  .join("")}
</tbody></table>
</section>
<section>
<h2>Simulator / VM</h2>
<p>Simulator: ${escapeHtml(command.execution?.simulator || "unverified")}; VM: ${escapeHtml(command.execution?.vm || "unverified")}</p>
</section>
<a href="/simulator/?try=${encodeURIComponent(command.name)}">Try this command</a>
<script src="/command-pages.js" defer></script>
</main>
</body>
</html>
`;
  await writeFile(path.join(out, path.basename(command.url)), html);
}

const staticRoutes = [
  "/",
  "/beginner/",
  "/intermediate/",
  "/expert/",
  "/real-linux/",
  "/developer-alpine/",
  "/open-source-iso/",
  "/commands/",
  "/learn/",
  "/learn/linux-basics/",
  "/learn/terminal-navigation/",
  "/learn/files-and-directories/",
  "/learn/text-processing/",
  "/learn/permissions/",
  "/learn/processes/",
  "/learn/shell-scripting/",
  "/challenges/",
  "/quiz/",
  "/curriculum/",
  "/about/",
  "/contact/",
  "/certificate/",
  "/linux-careers/",
];

const sitemapRoutes = [
  ...new Set([
    ...staticRoutes,
    ...data.records
      .filter((command) => command.page?.status === "complete")
      .map((command) => command.url),
  ]),
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapRoutes
  .map((url) => `<url><loc>https://linuxterminal.me${url}</loc></url>`)
  .join("")}</urlset>
`;

await writeFile(path.join(root, "public/sitemap.xml"), sitemap);
