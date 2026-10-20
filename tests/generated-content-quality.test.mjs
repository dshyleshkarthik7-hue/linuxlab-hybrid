import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const authored = await readFile("public/commands/pwd.html", "utf8");
assert.match(authored, /flow-controls|data-flow=|Working Directory \(Animated\)/i, "curated pwd lesson controls should survive regeneration");

const records = JSON.parse(await readFile("public/command-records.json", "utf8"));
const thin = records.records.find((item) => !(item.page?.status === "complete" && item.page?.source) && (
  !String(item.summary || "").trim() ||
  !String(item.example || "").trim() ||
  /^Catalog entry/i.test(String(item.summary || ""))
));
const sitemap = await readFile("public/sitemap.xml", "utf8");
if (thin) {
  const thinHtml = await readFile(path.join("public/commands", path.basename(thin.url)), "utf8");
  assert.match(thinHtml, /<meta name="robots" content="noindex,follow">/, "thin pages should not be indexed");
  assert.ok(!sitemap.includes("https://linuxterminal.me" + thin.url), "thin pages should be excluded from the sitemap");
} else {
  assert.ok(records.records.length >= 6161, "canonical catalogue size must remain 6,161+");
}

const builder = await readFile("scripts/commands/build-command-pages.mjs", "utf8");
const intelligenceBuilder = await readFile("scripts/commands/build-intelligence.mjs", "utf8");
const databaseBuilder = await readFile("scripts/commands/build-database.mjs", "utf8");
assert.match(databaseBuilder, /r\.summary\s*=\s*[\x27\x22]{2}/, "unverified catalogue summaries must be cleared instead of replaced with generic claims");
assert.match(databaseBuilder, /r\.example\s*=\s*[\x27\x22]{2}/, "unsupported catalogue examples must be cleared instead of fabricated");
assert.match(intelligenceBuilder, /status:\s*"draft"/, "generated lessons must remain drafts until evidence-based verification");
assert.match(intelligenceBuilder, /syntax_verified:false,examples_verified:false,busybox_tested:false,human_reviewed:false,provenance_verified:false/, "verification flags must default to false rather than be self-certified");
assert.match(intelligenceBuilder, /definition:/, "each generated lesson must include a definition");
assert.match(intelligenceBuilder, /examples:/, "draft records must expose an examples field");
assert.doesNotMatch(intelligenceBuilder, /r\.name\s*\+\s*" --help"/, "draft generation must not invent unsupported --help examples");
assert.doesNotMatch(intelligenceBuilder, /\[OPTIONS\] \[ARGUMENTS\]/, "draft generation must not fabricate command syntax");
assert.match(intelligenceBuilder, /syntax:""/, "unverified command syntax must remain empty until researched");
assert.match(intelligenceBuilder, /\.cache\/command-intelligence\.json/, "large generated intelligence must stay outside the public web root");
assert.match(builder, /\.cache\/command-intelligence\.json/, "command pages should consume the build-time intelligence artifact");
assert.doesNotMatch(intelligenceBuilder, /public\/command-intelligence\.json/, "generated intelligence must not be published as a whole-site JSON download");
assert.match(builder, /commands\.css\?v=20261020/, "generated pages must bust stale stylesheet caches");
assert.doesNotMatch(builder, /Shell builtin:/, "generic pages must not claim arbitrary inventory entries are shell builtins");
assert.doesNotMatch(builder, /\$ echo \$\?/, "generator must not invent generic exit-status output");

const incomplete = records.records.filter(
  (command) => command.page?.status !== "complete" && command.intelligence?.status !== "complete"
);
// Sample existing public command pages for fabricated exit-status output (full catalogue pages are produced at prebuild).
const sample = incomplete.slice(0, 50);
for (const command of sample) {
  const filename = path.basename(command.url);
  const pagePath = "public/commands/" + filename;
  try {
    const html = await readFile(pagePath, "utf8");
    assert.ok(!html.includes("$ echo $?"), `fabricated exit-status output found on ${command.url}`);
  } catch (err) {
    if (err && err.code === "ENOENT") continue;
    throw err;
  }
}

console.log("generated-content quality contract passed");
