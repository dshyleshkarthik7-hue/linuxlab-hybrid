import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const authored = await readFile("public/commands/pwd.html", "utf8");
assert.match(authored, /flow-controls|data-flow=|Working Directory \(Animated\)/i, "curated pwd lesson controls should survive regeneration");

const records = JSON.parse(await readFile("public/command-records.json", "utf8"));
const thin = records.records.find((item) => !String(item.summary || "").trim() || !String(item.example || "").trim());
assert.ok(thin, "fixture should include at least one thin command record");
const thinHtml = await readFile(path.join("public/commands", path.basename(thin.url)), "utf8");
assert.match(thinHtml, /<meta name="robots" content="noindex,follow">/, "thin pages should not be indexed");

const sitemap = await readFile("public/sitemap.xml", "utf8");
assert.ok(!sitemap.includes("https://linuxterminal.me" + thin.url), "thin pages should be excluded from the sitemap");

const builder = await readFile("scripts/commands/build-command-pages.mjs", "utf8");
const intelligenceBuilder = await readFile("scripts/commands/build-intelligence.mjs", "utf8");
const databaseBuilder = await readFile("scripts/commands/build-database.mjs", "utf8");
assert.match(databaseBuilder, /Catalog entry; purpose and availability are not verified/);
assert.match(intelligenceBuilder, /"unverified"/, "inventory-only records must not be marked as complete lessons");
assert.match(builder, /commands\.css\?v=20261016/, "generated pages must bust stale stylesheet caches");
assert.doesNotMatch(builder, /Shell builtin:/, "generic pages must not claim arbitrary inventory entries are shell builtins");
assert.doesNotMatch(builder, /\$ echo \$\?/, "generator must not invent generic exit-status output");

for (const command of records.records) {
  // Curated lessons are authored content and may legitimately discuss this
  // syntax. Only generic generated pages are subject to this boilerplate check.
  if (command.page?.status === "complete" || command.intelligence?.status === "complete") continue;
  const filename = path.basename(command.url);
  const html = await readFile("public/commands/" + filename, "utf8");
  assert.ok(!html.includes("$ echo $?"), `fabricated exit-status output found on ${command.url}`);
}
console.log("generated-content quality contract passed");
