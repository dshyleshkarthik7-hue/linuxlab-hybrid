import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const patchedVersion = "3.4.17";
const versionAtLeast = (version, minimum) => {
  const parse = (value) => value.split(".").map((part) => Number(part));
  const a = parse(version), b = parse(minimum);
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(a[i])) return false;
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
};

assert.equal(pkg.overrides?.["monaco-editor"]?.dompurify, patchedVersion,
  "Monaco must use the patched DOMPurify version through npm overrides");
assert.equal(lock.packages?.[""]?.overrides?.["monaco-editor"]?.dompurify, patchedVersion,
  "lockfile override must match package.json");
assert.ok(versionAtLeast(lock.packages?.["node_modules/dompurify"]?.version || "0.0.0", patchedVersion),
  "lockfile must not pin a DOMPurify version affected by GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr, or GHSA-c6gr-qvv4-5v3f");
assert.equal(lock.packages?.["node_modules/monaco-editor"]?.dependencies?.dompurify, patchedVersion,
  "Monaco lock entry must resolve to the patched DOMPurify version");
console.log("DOMPurify security override and lockfile contract passed.");
