import { GuestTelemetryBridge } from './observability/GuestTelemetryBridge.ts';

const attach = () => {
  const Runtime = window.V86;
  if (typeof Runtime !== 'function' || (Runtime as any).__linuxTerminalTelemetryWrapped) return;
  const Wrapped = function(this: any, options: any) {
    const vm = Reflect.construct(Runtime, [options], Wrapped);
    const bridge = new GuestTelemetryBridge();
    let requested = false;
    let identityBuffer = '';
    let identityOpen = false;
    const collect = () => {
      try {
        vm.serial0_send("printf '__LT_TELEMETRY__\\n'; head -1 /proc/stat; uname -srm; cat /proc/uptime; cat /proc/loadavg; grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; df -k / | tail -1; printf '__LT_END__\\n'; printf '__LT_IDENTITY__\\n'; cat /etc/os-release 2>/dev/null; printf '__LT_ID_END__\\n'");
      } catch (error) { console.debug('[LinuxTerminal] guest telemetry request failed', error); }
    };
    vm.add_listener('serial0-output-byte', (byte: number) => {
      const char = String.fromCharCode(byte & 255);
      const snapshot = bridge.feed(char);
      if (snapshot) document.dispatchEvent(new CustomEvent('linuxterminal:guest-telemetry', { detail: snapshot }));
      identityBuffer = (identityBuffer + char).slice(-12000);
      if (identityBuffer.includes('__LT_IDENTITY__')) identityOpen = true;
      if (identityOpen && identityBuffer.includes('__LT_ID_END__')) {
        const start = identityBuffer.lastIndexOf('__LT_IDENTITY__') + '__LT_IDENTITY__'.length;
        const end = identityBuffer.lastIndexOf('__LT_ID_END__');
        const release = identityBuffer.slice(start, end);
        identityBuffer = identityBuffer.slice(end + '__LT_ID_END__'.length);
        identityOpen = false;
        const isAlpine = /(?:^|\n)ID=alpine(?:\n|$)/i.test(release) || /(?:^|\n)ID_LIKE=.*\balpine\b/i.test(release);
        document.dispatchEvent(new CustomEvent('linuxterminal:guest-identity', { detail: { isAlpine, release: release.slice(0, 3000), checkedAt: Date.now() } }));
      }
    });
    vm.add_listener('emulator-ready', () => {
      if (requested) return;
      requested = true;
      window.setTimeout(collect, 1500);
      window.setTimeout(collect, 3000);
    });
    return vm;
  } as any;
  Wrapped.prototype = Runtime.prototype;
  Object.setPrototypeOf(Wrapped, Runtime);
  Wrapped.__linuxTerminalTelemetryWrapped = true;
  window.V86 = Wrapped;
};

attach();
window.addEventListener('load', attach, { once: true });
document.addEventListener('linuxterminal:guest-telemetry', event => {
  const detail = (event as CustomEvent).detail;
  const monitor = document.getElementById('v86-monitor');
  if (monitor && detail) monitor.textContent = `REAL guest • ${detail.kernel} ${detail.architecture} • ${detail.cpuPercent.toFixed(1)}% CPU • ${Math.round(detail.memoryBytes / 1024 / 1024)} MiB used`;
});
document.addEventListener('linuxterminal:guest-identity', event => {
  const detail = (event as CustomEvent).detail;
  const status = document.getElementById('v86-status');
  if (status && detail?.isAlpine) status.textContent = `${status.textContent} • Alpine identity verified`;
  (window as any).linuxTerminalGuestIdentity = detail;
});
