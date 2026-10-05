import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const data = JSON.parse(await readFile(path.join(root, "public/command-records.json"), "utf8"));
const intelligence = JSON.parse(await readFile(path.join(root, "public/command-intelligence.json"), "utf8"));
const out = path.join(root, "public/commands");

await mkdir(out, { recursive: true });

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const escapeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");

const relatedLinks = (items = []) => items.map((name) => {
  const target = data.records.find((r) => r.name === name);
  return target ? `<a href="${escapeHtml(target.url)}"><code>${escapeHtml(name)}</code></a>` : "";
}).filter(Boolean).join(" · ");

for (const command of data.records) {
  const lesson = intelligence.records?.[command.name] || command.intelligence || {};
  const summary = command.summary || lesson.tagline || "Linux command reference";
  const syntax = lesson.syntax || command.name;
  const examples = [command.example, ...(lesson.learningPath || []).slice(0, 2)].filter(Boolean);
  const options = lesson.options || [];
  const concepts = lesson.concepts || [];
  const mistakes = lesson.mistakes || [];
  const related = lesson.related || [];
  const distroRows = Object.entries(command.availability || {}).map(([name, availability]) =>
    `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(availability)}</td></tr>`).join("");
  const optionRows = options.map(([flag, description]) =>
    `<tr><th scope="row"><code>${escapeHtml(flag)}</code></th><td>${escapeHtml(description)}</td></tr>`).join("");
  const exampleBlocks = examples.map(example => `<pre><code>${escapeHtml(example)}</code></pre>`).join("");
  const conceptList = concepts.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  const mistakeList = mistakes.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  const practiceUrl = `/beginner/?command=${encodeURIComponent(command.name)}`;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "headline": `${command.name} command — Linux reference`,
    "description": summary,
    "url": `https://linuxterminal.me${command.url}`,
    "author": {"@type":"Organization","name":"LinuxTerminal.me","url":"https://linuxterminal.me/"},
    "isPartOf": {"@type":"WebSite","name":"LinuxTerminal.me","url":"https://linuxterminal.me/"},
    "breadcrumb": {"@type":"BreadcrumbList","itemListElement":[
      {"@type":"ListItem","position":1,"name":"Home","item":"https://linuxterminal.me/"},
      {"@type":"ListItem","position":2,"name":"Linux commands","item":"https://linuxterminal.me/commands/"},
      {"@type":"ListItem","position":3,"name":command.name,"item":`https://linuxterminal.me${command.url}`}
    ]}
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(command.name)} command — Linux reference | LinuxTerminal.me</title>
<meta name="description" content="${escapeHtml(summary)} Learn ${escapeHtml(command.name)} syntax, examples, common options, Linux implementation notes and safe practice.">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="https://linuxterminal.me${escapeHtml(command.url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(command.name)} command — Linux reference | LinuxTerminal.me">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:url" content="https://linuxterminal.me${escapeHtml(command.url)}">
<meta property="og:site_name" content="LinuxTerminal.me">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(command.name)} command — Linux reference | LinuxTerminal.me">
<meta name="twitter:description" content="${escapeHtml(summary)}">
<script type="application/ld+json">${escapeJson(articleSchema)}</script>
<link rel="stylesheet" href="/commands.css">
</head>
<body class="detail-page">
<main id="main-content" class="command-page">
<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="/commands/">Linux commands</a><span aria-hidden="true">›</span><span>${escapeHtml(command.name)}</span></nav>
<header class="command-hero">
<div class="command-intro"><div class="command-mark" aria-hidden="true">&gt;_</div><h1>${escapeHtml(command.name)}</h1><h2>${escapeHtml(summary)}</h2><p>Learn what ${escapeHtml(command.name)} does, how its syntax is structured, what to check on different Linux installations, and where to practice it safely.</p></div>
<article class="info-card"><h3>Definition</h3><p><code>${escapeHtml(command.name)}</code> — ${escapeHtml(summary)}.</p></article>
<article class="info-card"><h3>Syntax</h3><pre>${escapeHtml(syntax)}</pre><a class="green-btn" href="${practiceUrl}">Practice ${escapeHtml(command.name)} ›</a></article>
</header>
<section class="work-grid">
<article class="steps-card"><h2>How ${escapeHtml(command.name)} fits into Linux</h2><ol class="process-list">${(lesson.internals || []).map((step, i) => `<li><b>Step ${i+1}</b><span>${escapeHtml(step)}</span></li>`).join("")}</ol></article>
<article class="flow-card"><div class="flow-head"><h2>Quick command workflow</h2></div><div class="flow-map"><div class="flow-box"><b>Shell</b><small>parse arguments</small></div><span aria-hidden="true">→</span><div class="flow-box"><b>Linux tool</b><small>${escapeHtml(command.name)}</small></div><span aria-hidden="true">→</span><div class="flow-box"><b>Result</b><small>stdout / stderr</small></div><span aria-hidden="true">→</span><div class="flow-box success"><b>Status</b><small>exit code</small></div></div></article>
</section>
<section class="example-grid"><article class="examples-card"><h2>Examples</h2>${exampleBlocks}</article><article class="output-card"><h2>Practice command</h2><pre>$ ${escapeHtml(command.example || command.name)}
$ echo $?
0</pre></article></section>
<section class="lower-grid">
<article class="availability-card"><h2>Common options</h2>${optionRows ? `<table><tbody>${optionRows}</tbody></table>` : "<p class=\"muted\">Check the installed implementation's manual for command-specific options.</p>"}</article>
<article class="concepts-card"><h2>Key concepts</h2><ul class="concept-list">${conceptList}</ul></article>
<article class="availability-card"><h2>Linux availability</h2><table><tbody>${distroRows}</tbody></table></article>
</section>
<section class="card anatomy-card"><h2>Common mistakes and safety</h2><ul>${mistakeList}</ul><p>Linux utilities can differ between GNU, BusyBox, BSD-derived and distribution-specific implementations. Check &lt;code&gt;man ${escapeHtml(command.name)}&lt;/code&gt; or &lt;code&gt;${escapeHtml(command.name)} --help&lt;/code&gt; on the target system before relying on implementation-specific behavior.</p></section>
<section class="card anatomy-card"><h2>Related Linux commands</h2><p>${relatedLinks(related) || "Explore the complete Linux command catalogue for related tools."}</p><p><a class="cta" href="/learn/files-and-directories/">Files and directories</a> <a class="cta" href="/learn/permissions/">Linux permissions</a> <a class="cta" href="/learn/">All Linux tutorials</a></p></section>
<section class="card anatomy-card"><h2>Practice ${escapeHtml(command.name)} online</h2><p>Use the browser learning environment for a disposable practice session. The command reference itself is static and does not require the VM to load.</p><a class="cta" href="${practiceUrl}">Open practice →</a></section>
<footer class="lesson-footer-links"><a class="cta" href="/commands/">← Back to all 6,161 Linux commands</a><a class="cta" href="/beginner/">200-command beginner curriculum →</a></footer>
</main>
</body>
</html>`;
  await writeFile(path.join(out, path.basename(command.url)), html);
}

const staticRoutes = [
  "/", "/beginner/", "/intermediate/", "/expert/", "/real-linux/", "/developer-alpine/",
  "/open-source-iso/", "/commands/", "/learn/", "/learn/linux-basics/",
  "/learn/terminal-navigation/", "/learn/files-and-directories/", "/learn/text-processing/",
  "/learn/permissions/", "/learn/processes/", "/learn/shell-scripting/", "/learn/operating-systems/", "/learn/networking-basics/", "/challenges/",
  "/quiz/", "/curriculum/", "/about/", "/contact/", "/certificate/", "/linux-careers/",
  "/terms/", "/privacy/", "/verify/"
];

const sitemapRoutes = [...new Set([
  ...staticRoutes,
  ...data.records.map((command) => command.url)
])];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapRoutes.map((url) => `<url><loc>https://linuxterminal.me${url}</loc></url>`).join("")}</urlset>
`;
await writeFile(path.join(root, "public/sitemap.xml"), sitemap);
console.log(`[commands] generated ${data.records.length} command pages and ${sitemapRoutes.length} sitemap URLs`);
