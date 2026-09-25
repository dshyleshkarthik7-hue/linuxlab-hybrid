import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const script = readFileSync(new URL('../iso-builder/build-linuxlab-gcc.sh', import.meta.url), 'utf8');
assert.match(script, /cat >\/init <<'EOF'/, 'custom initramfs must contain the kernel /init entrypoint');
assert.match(script, /exec \/sbin\/init/, 'initramfs /init must hand off to /sbin/init');
assert.match(script, /ttyS0::respawn:\/sbin\/getty/, 'serial console must have a respawning getty');
assert.match(script, /tty0::respawn:\/sbin\/getty/, 'VGA console must have a respawning getty');
assert.match(script, /linuxlab-autologin/, 'browser VM must not block on an interactive login prompt');
assert.match(script, /__LINUXLAB_READY__/, 'guest readiness must expose a deterministic marker');
assert.match(script, /test -x \/init/, 'build must verify the initramfs entrypoint before creating the ISO');
console.log('ISO builder contract passed');

const powershell = readFileSync(new URL('../iso-builder/build-alpine-gcc.ps1', import.meta.url), 'utf8');
assert.doesNotMatch(powershell, /^```(?:powershell)?/m, 'PowerShell builder must be executable source, not Markdown fenced text');
assert.doesNotMatch(powershell, /```$/m, 'PowerShell builder must not contain a trailing Markdown fence');
assert.match(powershell, /LINUXLAB_ISO_OUTPUT/, 'PowerShell builder must honor the launcher output override');
assert.match(powershell, /LINUXLAB_ISO_WORK/, 'PowerShell builder must honor the launcher work override');
