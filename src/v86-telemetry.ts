import { GuestTelemetryBridge } from './observability/GuestTelemetryBridge.ts';

declare global { interface Window { V86?: any; } }

const attach = () => {
  const Runtime = window.V86;
  if (typeof Runtime !== 'function' || (Runtime as any).__linuxTerminalTelemetryWrapped) return;
  const Wrapped = function(this: any, options: any) {
    const vm = Reflect.construct(Runtime, [options], Wrapped);
    const bridge = new GuestTelemetryBridge();
    let requested = false;
    const collect = () => {
      try {
        vm.serial0_send("printf '__LT_TELEMETRY__\\n'; head -1 /proc/stat; uname -srm; cat /proc/uptime; cat /proc/loadavg; grep -E '^(MemTotal|MemAvailable):' /proc/meminfo; df -k / | tail -1; printf '__LT_END__\\n'");
      } catch (error) { console.debug('[LinuxTerminal] guest telemetry request failed', error); }
    };
    vm.add_listener('serial0-output-byte', (byte: number) => {
      const snapshot = bridge.feed(String.fromCharCode(byte & 255));
      if (!snapshot) return;
      document.dispatchEvent(new CustomEvent('linuxterminal:guest-telemetry', { detail: snapshot }));
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
