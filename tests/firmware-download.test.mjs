import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("scripts/fetch-v86-firmware.mjs", "utf8");
assert.match(source, /releases\/download\/v86-firmware-1\/seabios\.bin/);
assert.match(source, /releases\/download\/v86-firmware-1\/vgabios\.bin/);
assert.match(source, /raw\.githubusercontent\.com\/copy\/v86\/679ecd2e\/bios\/seabios\.bin/);
assert.match(source, /raw\.githubusercontent\.com\/copy\/v86\/679ecd2e\/bios\/vgabios\.bin/);
assert.match(source, /redirect:\s*'follow'/);
assert.match(source, /73e3f359102e3a9982c35fce98eb7cd08f18303ac7f1ba6ebfbe6cdc1c244d98/);
assert.match(source, /a4bc0d80cc3ca028c73dafa8fee396b8d054ce87ebd8abfbd31b06b437607880/);
assert.match(source, /size:\s*131072/);
assert.match(source, /size:\s*36352/);
assert.match(source, /createHash\('sha256'\)/);
assert.match(source, /buffer\.length !== asset\.size/);
console.log("pinned v86 firmware download contract passed");
