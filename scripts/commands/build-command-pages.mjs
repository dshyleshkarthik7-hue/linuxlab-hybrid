import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isCommandIndexable, commandCanonicalUrl, commandRobotsContent } from "./indexability.mjs";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const data = JSON.parse(await readFile(path.join(root, "public/command-records.json"), "utf8"));
const intelligence = JSON.parse(await readFile(path.join(root, ".cache/command-intelligence.json"), "utf8"));
const out = path.join(root, "public/commands");

await mkdir(out, { recursive: true });

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const escapeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const isIndexable = isCommandIndexable;

const relatedLinks = (items = []) => items.map((name) => {
  const target = data.records.find((r) => r.name === name);
  return target && isIndexable(target, intelligence.records?.[target.name]) ? `<a href="${escapeHtml(target.url)}"><code>${escapeHtml(name)}</code></a>` : "";
}).filter(Boolean).join(" · ");

for (const command of data.records) {
  const lesson = intelligence.records?.[command.name] || command.intelligence || {};
  const hasAuthoredLesson = command.page?.status === "complete" || command.intelligence?.status === "complete" || intelligence.records?.[command.name]?.status === "complete";
  const hasVerifiedReference = Boolean(hasAuthoredLesson && String(lesson.definition || lesson.explanation || "").trim() && String(lesson.syntax || "").trim() && Array.isArray(lesson.examples) && lesson.examples.length > 0 && Array.isArray(lesson.internals) && lesson.internals.length > 0);
  const rawSummary = hasVerifiedReference ? (lesson.definition || lesson.explanation || lesson.tagline || command.summary) : (command.summary || "Catalogue entry only. A command-specific explanation has not yet been reviewed and published.");
  // Keep descriptions useful and within the 320-character metadata contract.
  const summary = String(rawSummary).replace(/\s+/g, " ").trim().slice(0, 190);
  const syntax = hasVerifiedReference ? lesson.syntax : "Not published — verify the local command before use.";
  const examples = hasVerifiedReference ? lesson.examples.filter((example) => typeof example === "string" && example.trim()) : [];
  const indexable = isIndexable(command, intelligence.records?.[command.name]);
  const outputPath = path.join(out, path.basename(command.url));

  // Preserve curated command lessons: prebuild must not replace hand-authored UI with boilerplate.
  if (command.page?.status === "complete" && command.page?.source) {
    try {
      // Preserve authored lesson content, but keep its robots directive aligned
      // with the current indexability contract in the command database.
      const existing = await readFile(outputPath, "utf8");
      const robotsMeta = `<meta name="robots" content="${commandRobotsContent(command, intelligence.records?.[command.name])}">`;
      const cssVersioned = existing.replace(/commands\.css(?:\?v=\d+)?/g, "commands.css?v=20261020");
      const existingRobotsTag = existing.match(/<meta\b[^>]*>/gi)?.find((tag) => /\bname\s*=\s*["']robots["']/i.test(tag));
      let normalized = cssVersioned;
      const canonicalUrl = commandCanonicalUrl(command);
      const canonicalTag = `<link rel="canonical" href="${escapeHtml(canonicalUrl)}">`;
      const oldCanonical = normalized.match(/<link\b[^>]*rel=["']canonical["'][^>]*>/i)?.[0];
      if (oldCanonical) normalized = normalized.replace(oldCanonical, canonicalTag);
      else normalized = normalized.replace("</head>", canonicalTag + "\n</head>");
      const ogUrlTag = `<meta property="og:url" content="${escapeHtml(canonicalUrl)}">`;
      const oldOgUrl = normalized.match(/<meta\b(?=[^>]*\bproperty\s*=\s*["']og:url["'])[^>]*>/i)?.[0];
      if (oldOgUrl) normalized = normalized.replace(oldOgUrl, ogUrlTag);
      else normalized = normalized.replace("</head>", ogUrlTag + "\n</head>");
      if (existingRobotsTag) {
        normalized = normalized.replace(existingRobotsTag, robotsMeta);
      } else {
        normalized = normalized.replace("</head>", `${robotsMeta}\n</head>`);
      }
      if (normalized !== existing) await writeFile(outputPath, normalized);
      continue;
    } catch { /* regenerate missing curated output */ }
  }
  const options = hasVerifiedReference ? (lesson.options || []) : [];
  const concepts = hasVerifiedReference ? (lesson.concepts || []) : [];
  const mistakes = hasVerifiedReference ? (lesson.mistakes || []) : [];
  const related = hasVerifiedReference ? (lesson.related || []) : [];
  const internals = hasVerifiedReference ? (lesson.internals || []) : [];
  const distroRows = Object.entries(command.availability || {}).filter(([, availability]) => availability && availability !== "unverified").map(([name, availability]) =>
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
    "url": commandCanonicalUrl(command),
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
<meta name="robots" content="${indexable ? "index,follow,max-image-preview:large" : "noindex,follow"}">
<link rel="canonical" href="${escapeHtml(commandCanonicalUrl(command))}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(command.name)} command — Linux reference | LinuxTerminal.me">
<meta property="og:description" content="${escapeHtml(summary)}">
<meta property="og:url" content="${escapeHtml(commandCanonicalUrl(command))}">
<meta property="og:site_name" content="LinuxTerminal.me">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(command.name)} command — Linux reference | LinuxTerminal.me">
<meta name="twitter:description" content="${escapeHtml(summary)}">
<script type="application/ld+json">${escapeJson(articleSchema)}</script>
<link rel="stylesheet" href="/commands.css?v=20261020">
</head>
<body class="detail-page">
<main id="main-content" class="command-page">
<nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">›</span><a href="/commands/">Linux commands</a><span aria-hidden="true">›</span><span>${escapeHtml(command.name)}</span></nav>
<header class="command-hero">
<div class="command-intro"><p class="reference-status">${hasVerifiedReference ? "Curated and reviewed reference" : "Catalogue entry · awaiting editorial review"}</p><div class="command-mark" aria-hidden="true">&gt;_</div><h1>${escapeHtml(command.name)}</h1><h2>${escapeHtml(summary)}</h2><p>${hasVerifiedReference ? escapeHtml(lesson.explanation || lesson.definition || summary) : "We do not invent command explanations, syntax, flags, or output. This entry is listed for discovery; a reviewed, command-specific reference is not published yet."}</p></div>
<article class="info-card"><h3>${hasVerifiedReference ? "What it does" : "Editorial status"}</h3><p>${hasVerifiedReference ? escapeHtml(lesson.definition || lesson.explanation || summary) : "This page is not a completed learning reference. The catalogue name alone is not evidence that a command exists on your system."}</p></article>
<article class="info-card"><h3>${hasVerifiedReference ? "Syntax" : "Syntax not yet reviewed"}</h3><pre>${escapeHtml(syntax)}</pre>${hasVerifiedReference ? `<a class="green-btn" href="${practiceUrl}">Practice ${escapeHtml(command.name)} ›</a>` : `<a class="green-btn" href="/beginner/">Start with the curated beginner curriculum ›</a>`}</article>
</header>
<section class="work-grid">
<article class="steps-card"><h2>${hasVerifiedReference ? `How ${escapeHtml(command.name)} works` : "Why this page is incomplete"}</h2>${hasVerifiedReference ? `<ol class="process-list">${internals.map((step, i) => `<li><b>Step ${i+1}</b><span>${escapeHtml(step)}</span></li>`).join("")}</ol>` : `<p>This entry needs an editor-written explanation of its purpose, argument parsing, operating-system interactions, output, exit status, implementation differences, and safe examples before it can be labelled a reference.</p>`}</article>
<article class="flow-card"><div class="flow-head"><h2>Quick command workflow</h2></div><div class="flow-map"><div class="flow-box"><b>Shell</b><small>parse arguments</small></div><span aria-hidden="true">→</span><div class="flow-box"><b>Linux tool</b><small>${escapeHtml(command.name)}</small></div><span aria-hidden="true">→</span><div class="flow-box"><b>Result</b><small>stdout / stderr</small></div><span aria-hidden="true">→</span><div class="flow-box success"><b>Status</b><small>exit code</small></div></div></article>
</section>
<section class="example-grid"><article class="examples-card"><h2>${hasVerifiedReference ? "Reviewed examples" : "Examples not yet reviewed"}</h2>${exampleBlocks || `<p class="muted">No command-specific examples are published. We deliberately do not generate fictional examples or expected output.</p>`}</article><article class="output-card"><h2>Example input</h2>${command.example ? `<pre><code>${escapeHtml(command.example)}</code></pre><p class="muted">Output depends on the current directory, files, permissions and installed implementation; it is not fabricated here.</p>` : `<p class="muted">No verified example output is available yet.</p>`}</article></section>
<section class="lower-grid">
<article class="availability-card"><h2>Common options</h2>${optionRows ? `<table><tbody>${optionRows}</tbody></table>` : "<p class=\"muted\">Check the installed implementation's manual for command-specific options.</p>"}</article>
<article class="concepts-card"><h2>Key concepts</h2><ul class="concept-list">${conceptList}</ul></article>
<article class="availability-card"><h2>Linux availability</h2>${distroRows ? `<table><tbody>${distroRows}</tbody></table>` : `<p class="muted">Distribution availability has not been verified for this command yet.</p>`}</article>
</section>
<section class="card anatomy-card"><h2>Common mistakes and safety</h2><ul>${mistakeList}</ul><p>Linux utilities can differ between GNU, BusyBox, BSD-derived and distribution-specific implementations. Check <code>man ${escapeHtml(command.name)}</code> or <code>${escapeHtml(command.name)} --help</code> on the target system before relying on implementation-specific behavior.</p></section>
<section class="card anatomy-card"><h2>Related Linux commands</h2><p>${relatedLinks(related) || "Explore the complete Linux command catalogue for related tools."}</p><p><a class="cta" href="/learn/files-and-directories/">Files and directories</a> <a class="cta" href="/learn/permissions/">Linux permissions</a> <a class="cta" href="/learn/">All Linux tutorials</a></p></section>
<section class="card anatomy-card"><h2>Practice ${escapeHtml(command.name)} online</h2><p>Use the browser learning environment for a disposable practice session. The command reference itself is static and does not require the VM to load.</p>${hasVerifiedReference ? `<a class="cta" href="${practiceUrl}">Open practice →</a>` : `<a class="cta" href="/beginner/">Open curated beginner practice →</a>`}</section>
<footer class="lesson-footer-links"><a class="cta" href="/commands/">← Back to all 6,161 Linux commands</a><a class="cta" href="/beginner/">200-command beginner curriculum →</a></footer>
</main>
</body>
</html>`;
  await writeFile(outputPath, html);
}

console.log(`[commands] processed ${data.records.length} command records (curated pages preserved)`);
