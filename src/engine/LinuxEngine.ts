export interface VirtualNode {
  name: string;
  type: 'file' | 'dir';
  content?: string;
  permissions?: string;
  children?: Map<string, VirtualNode>;
  parent?: VirtualNode;
}

export class InBrowserLinuxEngine {
  public root: VirtualNode;
  public cwdPath: string[] = ['root'];
  public env: Map<string, string>;
  public history: string[] = [];
  private onEditorOpen?: (filename: string, content: string) => void;

  constructor() {
    this.root = {
      name: '/',
      type: 'dir',
      children: new Map(),
    };

    this.env = new Map([
      ['USER', 'root'],
      ['HOME', '/root'],
      ['SHELL', '/bin/bash'],
      ['PATH', '/bin:/usr/bin'],
      ['TERM', 'xterm-256color'],
    ]);

    this.initializeFileSystem();
  }

  public setEditorHook(fn: (filename: string, content: string) => void): void {
    this.onEditorOpen = fn;
  }

  private initializeFileSystem(): void {
    const defaultDirs = ['root', 'bin', 'etc', 'home', 'var', 'tmp', 'usr', 'dev'];
    for (const dir of defaultDirs) {
      this.root.children!.set(dir, {
        name: dir,
        type: 'dir',
        permissions: 'drwxr-xr-x',
        children: new Map(),
        parent: this.root,
      });
    }

    this.writeFile(
      '/root/main.c',
      `#include <stdio.h>\n\nint main() {\n    int num = 5;\n    printf("Multiplication Table of %d:\\n", num);\n    for (int i = 1; i <= 10; i++) {\n        printf("%d x %d = %d\\n", num, i, num * i);\n    }\n    return 0;\n}\n`
    );

    this.writeFile(
      '/root/Main.java',
      `public class Main {\n    public static void main(String[] args) {\n        int num = 7;\n        boolean isPrime = true;\n        for (int i = 2; i <= num / 2; i++) {\n            if (num % i == 0) {\n                isPrime = false;\n                break;\n            }\n        }\n        if (isPrime) {\n            System.out.println(num + " is a Prime Number");\n        } else {\n            System.out.println(num + " is not a Prime Number");\n        }\n    }\n}\n`
    );

    this.writeFile('/etc/hostname', 'linuxlab-node\n');
    this.writeFile(
      '/etc/os-release',
      'NAME="LinuxLab POSIX Engine"\nVERSION="2.0-Transpiler"\nID=linuxlab\nPRETTY_NAME="LinuxLab Hypervisor v2.0"\n'
    );
  }

  public getPrompt(): string {
    const user = this.env.get('USER') || 'root';
    const path = this.cwdPath.length === 1 && this.cwdPath[0] === 'root' ? '~' : '/' + this.cwdPath.join('/');
    return `\x1b[1;32m${user}@linuxlab\x1b[0m:\x1b[1;34m${path}\x1b[0m# `;
  }

  public getCwd(): string {
    return '/' + this.cwdPath.join('/');
  }

  public resolvePath(target: string): { node: VirtualNode | null; parent: VirtualNode | null; name: string } {
    const isAbs = target.startsWith('/');
    const tokens = target.split('/').filter(Boolean);
    const parts = isAbs ? tokens : [...this.cwdPath, ...tokens];

    const clean: string[] = [];
    for (const p of parts) {
      if (p === '.') continue;
      if (p === '..') clean.pop();
      else clean.push(p);
    }

    if (clean.length === 0) return { node: this.root, parent: null, name: '/' };

    let curr: VirtualNode = this.root;
    let parent: VirtualNode | null = null;

    for (let i = 0; i < clean.length; i++) {
      const part = clean[i];
      if (curr.type !== 'dir' || !curr.children) {
        return { node: null, parent: null, name: part };
      }
      parent = curr;
      const next = curr.children.get(part);
      if (!next) {
        if (i === clean.length - 1) return { node: null, parent: curr, name: part };
        return { node: null, parent: null, name: part };
      }
      curr = next;
    }

    return { node: curr, parent, name: clean[clean.length - 1] };
  }

  public writeFile(pathStr: string, content: string): boolean {
    const { node, parent, name } = this.resolvePath(pathStr);
    if (node && node.type === 'dir') return false;
    if (node && node.type === 'file') {
      node.content = content;
      return true;
    }
    if (parent && parent.children) {
      parent.children.set(name, {
        name,
        type: 'file',
        permissions: '-rw-r--r--',
        content,
        parent,
      });
      return true;
    }
    return false;
  }

  public readFile(pathStr: string): string | null {
    const { node } = this.resolvePath(pathStr);
    if (node && node.type === 'file') return node.content ?? '';
    return null;
  }

  public async execute(raw: string): Promise<string> {
    const line = raw.trim();
    if (!line) return '';
    this.history.push(line);

    if (line.includes('&&')) {
      const subCmds = line.split('&&').map((s) => s.trim());
      let combinedOut = '';
      for (const cmd of subCmds) {
        const out = await this.execute(cmd);
        if (out) combinedOut += (combinedOut ? '\n' : '') + out;
      }
      return combinedOut;
    }

    if (line.includes('|')) {
      const stages = line.split('|').map((s) => s.trim());
      let pipeOut = '';
      for (const st of stages) {
        pipeOut = await this.executeSingle(st, pipeOut);
      }
      return pipeOut;
    }

    if (line.includes('>')) {
      const append = line.includes('>>');
      const [cmdPart, targetFile] = line.split(append ? '>>' : '>').map((s) => s.trim());
      const res = await this.executeSingle(cmdPart);
      const prev = append ? this.readFile(targetFile) || '' : '';
      this.writeFile(targetFile, prev + (prev && !prev.endsWith('\n') ? '\n' : '') + res);
      return '';
    }

    return this.executeSingle(line);
  }

  private async executeSingle(cmdLine: string, stdin = ''): Promise<string> {
    const tokens = cmdLine.split(/\s+/).filter(Boolean);
    const cmd = tokens[0];
    const args = tokens.slice(1);

    switch (cmd) {
      case 'clear':
        return '\x1b[2J\x1b[H';
      case 'pwd':
        return this.getCwd();
      case 'whoami':
        return this.env.get('USER') || 'root';
      case 'date':
        return new Date().toUTCString();
      case 'echo':
        return args.join(' ').replace(/^["']|["']$/g, '');

      case 'uname':
        return args.includes('-a')
          ? 'Linux linuxlab 6.6.0-wasm-hypervisor #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux'
          : 'Linux';

      case 'ping': {
        const host = args[0] || '8.8.8.8';
        return `PING ${host} (${host}) 56(84) bytes of data.\n64 bytes from ${host}: icmp_seq=1 ttl=118 time=12.4 ms\n64 bytes from ${host}: icmp_seq=2 ttl=118 time=11.8 ms\n64 bytes from ${host}: icmp_seq=3 ttl=118 time=12.1 ms\n--- ${host} ping statistics ---\n3 packets transmitted, 3 received, 0% packet loss, time 2003ms`;
      }

      case 'curl': {
        const target = args[0] || 'https://api.linuxlab.internal';
        return `\x1b[32mHTTP/1.1 200 OK\x1b[0m\nContent-Type: application/json\n\n{"status":"connected","engine":"Engine A (Simulator)","target":"${target}"}`;
      }

      case 'traceroute': {
        const host = args[0] || 'google.com';
        return `traceroute to ${host} (142.250.190.46), 30 hops max, 60 byte packets\n 1  _gateway (192.168.1.1)  0.312 ms  0.289 ms  0.267 ms\n 2  10.0.0.1 (10.0.0.1)  4.120 ms  4.090 ms  4.050 ms\n 3  ${host} (142.250.190.46)  11.450 ms  11.410 ms  11.380 ms`;
      }

      case 'ifconfig':
      case 'ip':
        return `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500\n        inet 192.168.122.45  netmask 255.255.255.0  broadcast 192.168.122.255\n        inet6 fe80::5054:ff:fe12:3456  prefixlen 64  scopeid 0x20<link>\n        ether 52:54:00:12:34:56  txqueuelen 1000  (Ethernet)\n\nlo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536\n        inet 127.0.0.1  netmask 255.0.0.0\n        loop  txqueuelen 1000  (Local Loopback)`;

      case 'htop':
      case 'top':
        return '\x1b[1;36mTasks: 3 total, 1 running, 2 sleeping\n%Cpu(s):  1.2 us,  0.4 sy,  0.0 ni, 98.4 id\nMiB Mem :   256.0 total,   198.4 free,    32.6 used\n\n  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND\n    1 root      20   0    4120   1240   1100 S   0.0   0.5   0:01.02 init\n   45 root      20   0    6580   2410   1980 S   0.0   0.9   0:00.15 bash\x1b[0m';

      case 'ps':
        return '  PID TTY          TIME CMD\n    1 ?        00:00:01 init\n   45 pts/0    00:00:00 bash\n  102 pts/0    00:00:00 ps';

      case 'free':
        return '               total        used        free      shared  buff/cache   available\nMem:          256000       58240      197760           0       12000      185760\nSwap:              0           0           0';

      case 'df':
        return 'Filesystem     1K-blocks      Used Available Use% Mounted on\n/dev/root        8256000   1420000   6416000  18% /\ntmpfs             128000         0    128000   0% /dev/shm';

      case 'ls': {
        const target = args.find((a) => !a.startsWith('-')) || '.';
        const { node } = this.resolvePath(target);
        if (!node) return `ls: cannot access '${target}': No such file or directory`;
        if (node.type === 'file') return node.name;
        if (!node.children || node.children.size === 0) return '';
        const list: string[] = [];
        node.children.forEach((child) => {
          list.push(child.type === 'dir' ? `\x1b[1;34m${child.name}\x1b[0m` : child.name);
        });
        return list.join('  ');
      }

      case 'cd': {
        const dest = args[0] || '/root';
        if (dest === '~') {
          this.cwdPath = ['root'];
          return '';
        }
        const { node } = this.resolvePath(dest);
        if (!node) return `bash: cd: ${dest}: No such file or directory`;
        if (node.type !== 'dir') return `bash: cd: ${dest}: Not a directory`;

        const isAbs = dest.startsWith('/');
        const parts = isAbs ? dest.split('/').filter(Boolean) : [...this.cwdPath, ...dest.split('/').filter(Boolean)];
        const clean: string[] = [];
        for (const p of parts) {
          if (p === '..') clean.pop();
          else if (p !== '.') clean.push(p);
        }
        this.cwdPath = clean;
        return '';
      }

      case 'mkdir': {
        if (!args[0]) return 'mkdir: missing operand';
        const { node, parent, name } = this.resolvePath(args[0]);
        if (node) return `mkdir: cannot create directory '${args[0]}': File exists`;
        if (parent && parent.children) {
          parent.children.set(name, { name, type: 'dir', children: new Map(), parent });
          return '';
        }
        return `mkdir: cannot create directory '${args[0]}': No such file or directory`;
      }

      case 'touch': {
        if (!args[0]) return 'touch: missing file operand';
        this.writeFile(args[0], '');
        return '';
      }

      case 'rm': {
        if (!args[0]) return 'rm: missing operand';
        const target = args.find((a) => !a.startsWith('-')) || args[0];
        const { node, parent, name } = this.resolvePath(target);
        if (!node || !parent || !parent.children) return `rm: cannot remove '${target}': No such file or directory`;
        parent.children.delete(name);
        return '';
      }

      case 'cat': {
        if (!args[0]) return 'cat: missing operand';
        const data = this.readFile(args[0]);
        if (data === null) return `cat: ${args[0]}: No such file or directory`;
        return data;
      }

      case 'grep': {
        if (!args[0]) return 'grep: missing search pattern';
        const pat = args[0];
        const file = args[1];
        const data = file ? this.readFile(file) : stdin;
        if (data === null) return `grep: ${file}: No such file or directory`;
        return data.split('\n').filter((l) => l.includes(pat)).join('\n');
      }

      case 'nano':
      case 'vi':
      case 'vim': {
        const file = args[0] || 'main.c';
        let current = this.readFile(file);
        if (current === null) {
          this.writeFile(file, '');
          current = '';
        }
        if (this.onEditorOpen) {
          this.onEditorOpen(file, current);
        }
        return `\x1b[33m[Opened '${file}' in Code Editor]\x1b[0m`;
      }

      case 'which': {
        const target = args[0];
        if (!target) return 'which: missing argument';
        const known = new Set(['bash', 'sh', 'ls', 'cd', 'mkdir', 'touch', 'rm', 'cat', 'grep', 'head', 'tail', 'gcc', 'clang', 'javac', 'java', 'nano', 'vi', 'vim', 'ps', 'top', 'htop', 'free', 'df', 'ping', 'curl', 'ip', 'ifconfig', 'chmod', 'pwd', 'whoami']);
        return known.has(target) ? `/usr/bin/${target}` : '';
      }

      case 'help':
        return 'LinuxLab simulator commands: ls cd pwd mkdir touch rm cat grep head tail wc sort uniq echo printf export env history which gcc clang javac java chmod stat ps top free df ping curl ip ifconfig. C runtime: int/float/char/string, arrays, functions, if/else, for/while, break/continue, printf/puts/scanf/getchar, common string/math helpers. Use ./a.out INPUT... for simulated stdin; use Engine B + real GCC for full C/Linux.';

      case 'history':
        return this.history.map((entry, index) => `${String(index + 1).padStart(4, ' ')}  ${entry}`).join('\n');

      case 'env':
        return Array.from(this.env.entries()).map(([k, v]) => `${k}=${v}`).join('\n');

      case 'export': {
        const assignment = args.join(' ');
        const match = assignment.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) return 'export: usage: export NAME=value';
        this.env.set(match[1], match[2].replace(/^['"]|['"]$/g, ''));
        return '';
      }

      case 'head':
      case 'tail': {
        const file = args.find((a) => !a.startsWith('-'));
        const data = file ? this.readFile(file) : stdin;
        if (data === null) return `${cmd}: ${file}: No such file or directory`;
        const lines = data.split('\n');
        const countArg = args.find((a) => /^-\d+$/.test(a));
        const count = countArg ? Math.max(1, Number(countArg.slice(1))) : 10;
        return (cmd === 'head' ? lines.slice(0, count) : lines.slice(-count)).join('\n');
      }

      case 'wc': {
        const file = args.find((a) => !a.startsWith('-'));
        const data = file ? this.readFile(file) : stdin;
        if (data === null) return `wc: ${file}: No such file or directory`;
        const lines = data ? data.split('\n').length : 0;
        const words = data.trim() ? data.trim().split(/\s+/).length : 0;
        return `${lines} ${words} ${data.length} ${file}`;
      }

      case 'chmod': {
        if (args.length < 2) return 'chmod: usage: chmod MODE FILE';
        const { node } = this.resolvePath(args[1]);
        if (!node) return `chmod: cannot access '${args[1]}': No such file or directory`;
        const mode = args[0];
        if (/^[0-7]{3,4}$/.test(mode)) {
          const digits = mode.slice(-3);
          const perms = (n: string) => {
            const x = Number(n);
            return `${x & 4 ? 'r' : '-'}${x & 2 ? 'w' : '-'}${x & 1 ? 'x' : '-'}`;
          };
          node.permissions = `${node.type === 'dir' ? 'd' : '-'}${perms(digits[0])}${perms(digits[1])}${perms(digits[2])}`;
          return '';
        }
        return `chmod: invalid mode: '${mode}'`;
      }

      case 'stat': {
        const target = args[0];
        if (!target) return 'stat: missing operand';
        const { node } = this.resolvePath(target);
        if (!node) return `stat: cannot stat '${target}': No such file or directory`;
        return `File: ${target}\nType: ${node.type}\nPermissions: ${node.permissions || '----------'}\nSize: ${(node.content || '').length}`;
      }

      case 'gcc':
      case 'clang': {
        if (args.includes('--version') || args.includes('-v')) {
          return cmd === 'gcc'
            ? 'LinuxLab Educational C Runtime (source transpilation)\nNOTE: this simulator does not contain the native GCC compiler. Use Engine B Alpine + apk add gcc for real GCC.'
            : 'LinuxLab Educational C Runtime (clang-compatible command alias)';
        }
        if (!args[0]) return `${cmd}: fatal error: no input files\ncompilation terminated.`;
        const src = this.readFile(args[0]);
        if (src === null) return `${cmd}: error: ${args[0]}: No such file or directory`;
        let bin = 'a.out';
        const outIdx = args.indexOf('-o');
        if (outIdx !== -1 && args[outIdx + 1]) bin = args[outIdx + 1];
        this.writeFile(bin, `__TRANSPILED_C__:${args[0]}`);
        return `LinuxLab simulator: transpiled ${args[0]} -> ${bin}`;
      }

      case './a.out':
      case './table':
      case './' + cmd.replace(/^\.\//, ''): {
        const binName = cmd.replace(/^\.\//, '');
        const bin = this.readFile(binName);
        if (!bin) return `bash: ${cmd}: No such file or directory`;

        if (bin.startsWith('__TRANSPILED_C__:')) {
          const srcFile = bin.slice('__TRANSPILED_C__:'.length);
          const src = this.readFile(srcFile) || '';
          // Arguments after ./program are supplied to the educational stdin queue.
          // This makes common scanf/getchar programs testable without pretending the
          // simulator has a real interactive process/TTY implementation.
          const input = args.length ? args : [];
          return this.executeGeneralCode(src, 'c', undefined, input);
        }
        return `bash: ${cmd}: cannot execute binary file`;
      }

      case 'javac': {
        if (!args[0]) return 'javac: no source files specified';
        const src = this.readFile(args[0]);
        if (src === null) return `javac: file not found: ${args[0]}`;

        const classMatch = src.match(/public\s+class\s+([A-Za-z0-9_]+)/) || src.match(/class\s+([A-Za-z0-9_]+)/);
        const className = classMatch ? classMatch[1] : args[0].replace('.java', '');

        this.writeFile(`${className}.class`, `__TRANSPILED_JAVA__:${args[0]}`);
        return '';
      }

      case 'java': {
        if (!args[0]) return 'Usage: java [options] <mainclass> [args...]';
        const className = args[0].replace('.class', '');
        const classHeader = this.readFile(`${className}.class`);

        let srcCode = '';
        if (classHeader && classHeader.startsWith('__TRANSPILED_JAVA__:')) {
          const srcFile = classHeader.split(':')[1];
          srcCode = this.readFile(srcFile) || '';
        } else {
          const fallback = this.readFile(args[0].endsWith('.java') ? args[0] : `${args[0]}.java`);
          if (fallback) srcCode = fallback;
        }

        if (!srcCode) return `Error: Could not find or load main class ${args[0]}`;
        return this.executeGeneralCode(srcCode, 'java');
      }

      default:
        return `bash: ${cmd}: command not found`;
    }
  }

  public executeGeneralCode(code: string, language: 'c' | 'java', injectedVars?: Record<string, number>, input: string[] = []): string {
    if (code.length > 200_000) return '\x1b[31m[Execution Refused]:\x1b[0m Source exceeds the 200 KB educational runtime limit.';

    if (language === 'c') {
      try {
        const interpreter = new EducationalCInterpreter(code, input, injectedVars);
        const result = interpreter.run();
        return result || 'Program exited with code 0.';
      } catch (err: any) {
        return `\x1b[31m[C Runtime Error]:\x1b[0m ${err?.message || String(err)}`;
      }
    }

    // Java remains a lightweight educational transpiler. Real Java should be run in Engine B.
    return this.executeJavaEducational(code);
  }

  private executeJavaEducational(code: string): string {
    const outputBuffer: string[] = [];
    const push = (v: unknown) => {
      const text = String(v);
      if (outputBuffer.join('').length + text.length > 100_000) throw new Error('Output limit exceeded (100 KB).');
      outputBuffer.push(text);
    };
    try {
      let runnable = code.replace(/#include\s*<[^>]+>/g, '').replace(/import\s+[^;]+;/g, '').replace(/package\s+[^;]+;/g, '');
      runnable = runnable.replace(/(?:public\s+)?class\s+\w+\s*\{/, '').replace(/\bpublic\s+static\s+void\s+main\s*\([^)]*\)\s*\{/, 'function main() {');
      const last = runnable.lastIndexOf('}');
      if (last >= 0) runnable = runnable.slice(0, last) + runnable.slice(last + 1);
      runnable = runnable.replace(/System\.out\.println\s*\(([^;]*?)\)\s*;/g, (_m, e) => `__out.push(String(${e}) + "\\n");`);
      runnable = runnable.replace(/System\.out\.print\s*\(([^;]*?)\)\s*;/g, (_m, e) => `__out.push(String(${e}));`);
      runnable = runnable.replace(/\b(?:int|long|short|float|double|boolean|char|String)\s+([A-Za-z_]\w*)/g, 'let $1');
      runnable = runnable.replace(/return\s+0\s*;/g, 'return;');
      const runner = new Function('__out', `${runnable}\nif (typeof main === 'function') main();`);
      runner({ push });
      return outputBuffer.join('');
    } catch (err: any) {
      return `\x1b[31m[Java Educational Runtime]:\x1b[0m ${err?.message || String(err)}`;
    }
  }
}

/**
 * A deliberately small, deterministic C interpreter for the browser simulator.
 * It is not GCC: it implements a useful C subset without pretending to generate
 * native ELF binaries. Engine B remains the path for real GCC/Linux execution.
 *
 * Supported: int/long/short/float/double/char, strings, arrays, functions,
 * if/else, while, for, break/continue/return, arithmetic/comparison/logical
 * operators, ++/--, assignment operators, printf/puts/putchar/getchar/scanf,
 * comments, #include/#define (common constants), argv-like input and casts.
 */
class EducationalCInterpreter {
  private tokens: string[] = [];
  private pos = 0;
  private output = '';
  private vars = new Map<string, any>();
  private arrays = new Map<string, any[]>();
  private functions = new Map<string, { params: string[]; body: string[] }>();
  private input: string[];
  private inputPos = 0;
  private steps = 0;
  private readonly maxSteps = 250_000;
  private readonly maxOutput = 100_000;

  constructor(private source: string, input: string[] = [], injectedVars: Record<string, number> = {}) {
    this.input = [...input];
    for (const [k, v] of Object.entries(injectedVars)) this.vars.set(k, v);
    this.tokenize();
  }

  public run(): string {
    this.extractFunctions();
    const main = this.functions.get('main');
    if (main) {
      this.callFunction('main', []);
    } else {
      // Accept small C snippets without an explicit main as an educational convenience.
      this.pos = 0;
      this.executeUntil(this.tokens.length);
    }
    return this.output;
  }

  private tick(): void {
    this.steps++;
    if (this.steps > this.maxSteps) throw new Error('Execution limit reached (250,000 steps). The program may contain an infinite or extremely long loop.');
    if (this.output.length > this.maxOutput) throw new Error('Output limit exceeded (100 KB).');
  }

  private tokenize(): void {
    let s = this.source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/^\s*#include[^\n]*$/gm, '')
      .replace(/^\s*#define\s+([A-Za-z_]\w*)\s+([^\n]+)$/gm, 'const $1 = $2;');
    const re = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:\d+\.\d+|\d+)|(?:==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\*=|\/=|%=|<<|>>|->)|(?:[A-Za-z_]\w*)|[^\s])/g;
    this.tokens = s.match(re) || [];
  }

  private extractFunctions(): void {
    let i = 0;
    while (i < this.tokens.length) {
      const start = i;
      // Skip return type / qualifiers until name(params) {
      let nameIdx = -1;
      for (let j = i; j < Math.min(i + 8, this.tokens.length); j++) {
        if (/^[A-Za-z_]\w*$/.test(this.tokens[j]) && this.tokens[j + 1] === '(') { nameIdx = j; break; }
        if (this.tokens[j] === ';') break;
      }
      if (nameIdx < 0) { i++; continue; }
      let p = nameIdx + 2, depth = 1;
      const params: string[] = [];
      let current = '';
      while (p < this.tokens.length && depth) {
        const t = this.tokens[p++];
        if (t === '(') depth++;
        else if (t === ')') depth--;
        else if (depth === 1 && t === ',') { const n = current.match(/[A-Za-z_]\w*$/); if (n) params.push(n[0]); current = ''; }
        else if (depth === 1) current += ` ${t}`;
      }
      const n = current.match(/[A-Za-z_]\w*$/); if (n) params.push(n[0]);
      if (this.tokens[p] !== '{') { i = start + 1; continue; }
      const bodyStart = p + 1;
      let b = bodyStart, brace = 1;
      while (b < this.tokens.length && brace) { if (this.tokens[b] === '{') brace++; else if (this.tokens[b] === '}') brace--; b++; }
      if (brace !== 0) throw new Error(`Unmatched '{' in function ${this.tokens[nameIdx]}.`);
      this.functions.set(this.tokens[nameIdx], { params, body: this.tokens.slice(bodyStart, b - 1) });
      i = b;
    }
  }

  private callFunction(name: string, args: any[]): any {
    this.tick();
    const fn = this.functions.get(name);
    if (!fn) throw new Error(`function '${name}' is not defined`);
    const oldVars = this.vars;
    const oldArrays = this.arrays;
    const oldPos = this.pos;
    this.vars = new Map(oldVars);
    this.arrays = new Map(oldArrays);
    fn.params.forEach((p, i) => this.vars.set(p, args[i] ?? 0));
    this.pos = 0;
    const result = this.executeUntil(fn.body.length, fn.body);
    this.vars = oldVars;
    this.arrays = oldArrays;
    this.pos = oldPos;
    return result?.value;
  }

  private executeUntil(end: number, stream: string[] = this.tokens): { type: string; value?: any } | undefined {
    while (this.pos < end) {
      this.tick();
      const t = stream[this.pos];
      if (t === ';') { this.pos++; continue; }
      if (t === '}') { this.pos++; return; }
      if (t === 'return') {
        this.pos++;
        const value = stream[this.pos] === ';' ? 0 : this.expression(stream, end);
        if (stream[this.pos] === ';') this.pos++;
        return { type: 'return', value };
      }
      if (t === 'break' || t === 'continue') { this.pos++; if (stream[this.pos] === ';') this.pos++; return { type: t }; }
      if (t === 'if') { const r = this.execIf(stream, end); if (r) return r; continue; }
      if (t === 'while') { const r = this.execWhile(stream, end); if (r) return r; continue; }
      if (t === 'for') { const r = this.execFor(stream, end); if (r) return r; continue; }
      if (this.isDeclaration(stream[this.pos])) { this.declaration(stream, end); continue; }
      this.expression(stream, end);
      if (stream[this.pos] === ';') this.pos++;
    }
    return;
  }

  private isDeclaration(t: string): boolean {
    return ['int','long','short','float','double','char','void','const','unsigned','signed','bool','boolean','string'].includes(t);
  }

  private declaration(s: string[], end: number): void {
    let isConst = false;
    if (s[this.pos] === 'const') { isConst = true; this.pos++; }
    while (['unsigned','signed','long','short'].includes(s[this.pos])) this.pos++;
    const type = s[this.pos++];
    if (type === 'void') { this.pos++; return; }
    while (this.pos < end) {
      const name = s[this.pos++];
      if (!name || !/^[A-Za-z_]\w*$/.test(name)) throw new Error(`expected variable name, got '${name}'`);
      let value: any = type === 'char' ? '\0' : 0;
      if (s[this.pos] === '[') {
        this.pos++; const size = Number(this.expression(s, end)); if (s[this.pos] === ']') this.pos++;
        const arr = new Array(Math.max(0, size)).fill(type === 'char' ? '\0' : 0);
        if (s[this.pos] === '=') {
          this.pos++; if (s[this.pos] === '{') { this.pos++; let i = 0; while (s[this.pos] !== '}' && this.pos < end) { arr[i++] = this.expression(s, end); if (s[this.pos] === ',') this.pos++; else break; } if (s[this.pos] === '}') this.pos++; }
        }
        this.arrays.set(name, arr);
      } else {
        if (s[this.pos] === '=') { this.pos++; value = this.expression(s, end); }
        this.vars.set(name, value);
      }
      if (s[this.pos] !== ',') break;
      this.pos++;
    }
    if (s[this.pos] === ';') this.pos++;
    void isConst;
  }

  private execIf(s: string[], end: number): { type: string; value?: any } | undefined {
    this.pos++; this.expect(s, '('); const cond = this.expression(s, end); this.expect(s, ')');
    const thenBody = this.readStatement(s, end);
    let elseBody: string[] | null = null;
    if (s[this.pos] === 'else') { this.pos++; elseBody = this.readStatement(s, end); }
    if (this.truthy(cond)) return this.runBlock(thenBody);
    if (elseBody) return this.runBlock(elseBody);
  }

  private execWhile(s: string[], end: number): { type: string; value?: any } | undefined {
    const keyword = this.pos++; this.expect(s, '('); const condStart = this.pos; this.expression(s, end); const condEnd = this.pos; this.expect(s, ')');
    const body = this.readStatement(s, end);
    let guard = 0;
    while (true) {
      const c = this.evalSlice(s, condStart, condEnd); if (!this.truthy(c)) break;
      if (++guard > 100_000) throw new Error('while loop exceeded 100,000 iterations.');
      const r = this.runBlock(body); if (r?.type === 'return') return r; if (r?.type === 'break') break;
    }
    void keyword;
  }

  private execFor(s: string[], end: number): { type: string; value?: any } | undefined {
    this.pos++; this.expect(s, '(');
    const initStart = this.pos; let depth = 0; while (this.pos < end) { if (s[this.pos] === '(') depth++; if (s[this.pos] === ')') { if (!depth) break; depth--; } if (s[this.pos] === ';' && !depth) break; this.pos++; } const initEnd = this.pos; this.expect(s, ';');
    const condStart = this.pos; while (this.pos < end && s[this.pos] !== ';') this.pos++; const condEnd = this.pos; this.expect(s, ';');
    const incStart = this.pos; while (this.pos < end && s[this.pos] !== ')') this.pos++; const incEnd = this.pos; this.expect(s, ')');
    const body = this.readStatement(s, end);
    this.execSlice(s, initStart, initEnd);
    let guard = 0;
    while (condStart === condEnd || this.truthy(this.evalSlice(s, condStart, condEnd))) {
      if (++guard > 100_000) throw new Error('for loop exceeded 100,000 iterations.');
      const r = this.runBlock(body); if (r?.type === 'return') return r; if (r?.type === 'break') break;
      if (r?.type !== 'continue' || r?.type === 'continue') this.execSlice(s, incStart, incEnd);
    }
  }

  private readStatement(s: string[], end: number): string[] {
    if (s[this.pos] === '{') {
      this.pos++; const start = this.pos; let d = 1; while (this.pos < end && d) { if (s[this.pos] === '{') d++; else if (s[this.pos] === '}') d--; this.pos++; }
      if (d) throw new Error('unmatched block'); return s.slice(start, this.pos - 1);
    }
    const start = this.pos; while (this.pos < end && s[this.pos++] !== ';') {} return s.slice(start, this.pos);
  }

  private runBlock(block: string[]): { type: string; value?: any } | undefined { const old = this.pos; this.pos = 0; const r = this.executeUntil(block.length, block); this.pos = old; return r; }
  private execSlice(s: string[], a: number, b: number): any { const old = this.pos; this.pos = a; const v = this.isDeclaration(s[this.pos]) ? (this.declaration(s, b), 0) : this.expression(s, b); this.pos = old; return v; }
  private evalSlice(s: string[], a: number, b: number): any { const old = this.pos; this.pos = a; const v = this.expression(s, b); this.pos = old; return v; }

  private expression(s: string[], end: number): any { return this.assignment(s, end); }
  private assignment(s: string[], end: number): any {
    const save = this.pos;
    if (/^[A-Za-z_]\w*$/.test(s[this.pos] || '') && s[this.pos + 1] === '[') {
      const name = s[this.pos++]; this.pos++; const idx = Number(this.expression(s, end)); this.expect(s, ']');
      if (['=','+=','-=','*=','/=','%='].includes(s[this.pos])) {
        const op = s[this.pos++]; const rhs = this.assignment(s, end); const arr = this.arrays.get(name) || [];
        const old = arr[idx] ?? 0; arr[idx] = op === '=' ? rhs : this.apply(op[0], old, rhs); this.arrays.set(name, arr); return arr[idx];
      }
      this.pos = save;
    }
    if (/^[A-Za-z_]\w*$/.test(s[this.pos] || '') && ['=','+=','-=','*=','/=','%='].includes(s[this.pos + 1])) {
      const name = s[this.pos++]; const op = s[this.pos++]; const rhs = this.assignment(s, end); const old = this.vars.get(name) ?? 0;
      const value = op === '=' ? rhs : this.apply(op[0], old, rhs); this.vars.set(name, value); return value;
    }
    this.pos = save;
    return this.logicalOr(s, end);
  }
  private logicalOr(s: string[], end: number): any { let v = this.logicalAnd(s, end); while (s[this.pos] === '||') { this.pos++; v = this.truthy(v) || this.truthy(this.logicalAnd(s, end)) ? 1 : 0; } return v; }
  private logicalAnd(s: string[], end: number): any { let v = this.equality(s, end); while (s[this.pos] === '&&') { this.pos++; v = this.truthy(v) && this.truthy(this.equality(s, end)) ? 1 : 0; } return v; }
  private equality(s: string[], end: number): any { let v = this.compare(s, end); while (['==','!='].includes(s[this.pos])) { const op=s[this.pos++]; const r=this.compare(s,end); v=op==='==' ? (v===r?1:0):(v!==r?1:0); } return v; }
  private compare(s: string[], end: number): any { let v=this.term(s,end); while (['<','>','<=','>='].includes(s[this.pos])) { const op=s[this.pos++]; const r=this.term(s,end); v=op==='<'?(v<r?1:0):op==='>'?(v>r?1:0):op==='<='?(v<=r?1:0):(v>=r?1:0); } return v; }
  private term(s: string[], end: number): any { let v=this.factor(s,end); while (['+','-'].includes(s[this.pos])) { const op=s[this.pos++]; v=this.apply(op,v,this.factor(s,end)); } return v; }
  private factor(s: string[], end: number): any { let v=this.unary(s,end); while (['*','/','%'].includes(s[this.pos])) { const op=s[this.pos++]; v=this.apply(op,v,this.unary(s,end)); } return v; }

  private unary(s: string[], end: number): any {
    const t=s[this.pos];
    if (t==='&') { this.pos++; const name=s[this.pos++]; return { __ref: name }; }
    if (t==='!') { this.pos++; return this.truthy(this.unary(s,end))?0:1; }
    if (t==='-') { this.pos++; return -Number(this.unary(s,end)); }
    if (t==='+') { this.pos++; return Number(this.unary(s,end)); }
    if (t==='++' || t==='--') { this.pos++; const name=s[this.pos++]; const v=(this.vars.get(name)??0)+(t==='++'?1:-1); this.vars.set(name,v); return v; }
    const v=this.primary(s,end);
    if (s[this.pos]==='++' || s[this.pos]==='--') { const op=s[this.pos++]; const n=(typeof v==='number'?v:0); const nv=n+(op==='++'?1:-1); if (typeof s[this.pos-2]==='string') this.vars.set(s[this.pos-2],nv); return n; }
    return v;
  }

  private primary(s: string[], end: number): any {
    const t=s[this.pos++];
    if (t === undefined) return 0;
    if (t === '(') { const v=this.expression(s,end); this.expect(s,')'); return v; }
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    if (/^'(?:\\.|[^'])'$/.test(t)) return this.unquote(t).charAt(0);
    if (/^"(?:\\.|[^"])*"$/.test(t)) return this.unquote(t);
    if (t === 'true') return 1; if (t === 'false') return 0; if (t === 'NULL') return 0;
    if (/^[A-Za-z_]\w*$/.test(t)) {
      if (s[this.pos] === '(') {
        this.pos++; const args:any[]=[]; while (s[this.pos]!==')' && this.pos<end) { args.push(this.expression(s,end)); if(s[this.pos]===',') this.pos++; else break; } this.expect(s,')'); return this.builtinOrFunction(t,args);
      }
      if (s[this.pos] === '[') { this.pos++; const idx=Number(this.expression(s,end)); this.expect(s,']'); const arr=this.arrays.get(t); return arr?.[idx] ?? 0; }
      return this.vars.get(t) ?? 0;
    }
    return 0;
  }

  private builtinOrFunction(name:string,args:any[]):any {
    if(name==='printf') { const fmt=String(args.shift()??''); this.output += this.formatPrintf(fmt,args); return args.length; }
    if(name==='puts') { this.output += String(args[0]??'')+'\n'; return 0; }
    if(name==='putchar') { this.output += String(args[0]??'').charAt(0); return args[0]??0; }
    if(name==='getchar') { return this.nextInput().charCodeAt(0) || -1; }
    if(name==='scanf') { const fmt=String(args.shift()??''); return this.scanf(fmt, args); }
    if(name==='strlen') return String(args[0]??'').length;
    if(name==='abs') return Math.abs(Number(args[0]??0));
    if(name==='atoi') return Number.parseInt(String(args[0]??'0'),10)||0;
    if(name==='toupper') return String(args[0]??'').toUpperCase().charCodeAt(0);
    if(name==='tolower') return String(args[0]??'').toLowerCase().charCodeAt(0);
    return this.functions.has(name) ? this.callFunction(name,args) : 0;
  }

  private scanf(fmt:string, refs:any[]=[]):number {
    const specs=[...fmt.matchAll(/%[dfsc]/g)].map(m=>m[0]); let count=0;
    for(const spec of specs){
      const raw=this.nextInput();
      const value=spec==='%d'?Number.parseInt(raw,10)||0:spec==='%f'?Number.parseFloat(raw)||0:raw;
      const ref=refs[count];
      if(ref && ref.__ref) this.vars.set(ref.__ref, value);
      count++;
    }
    return count;
  }
  private nextInput():string { if(this.inputPos>=this.input.length) return '0'; return String(this.input[this.inputPos++]); }
  private formatPrintf(fmt:string,args:any[]):string { let i=0; return fmt.replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/%[-+0-9.]*[dfsxc%]/gi,(m)=>m==='%%'?'%':this.formatSpec(m,args[i++])); }
  private formatSpec(spec:string,v:any):string { if(spec.endsWith('f')) return Number(v??0).toFixed(spec.includes('.')?Number(spec.split('.')[1])||6:6); if(spec.endsWith('x')) return Number(v??0).toString(16); if(spec.endsWith('c')) return typeof v === 'string' ? v.charAt(0) : String.fromCharCode(Number(v??0)); return String(v??0); }
  private apply(op:string,a:any,b:any):any { if(op==='+') return typeof a==='string'||typeof b==='string'?String(a)+String(b):Number(a)+Number(b); if(op==='-') return Number(a)-Number(b); if(op==='*') return Number(a)*Number(b); if(op==='/') return Number(b)===0?0:Number(a)/Number(b); if(op==='%') return Number(a)%Number(b); return b; }
  private truthy(v:any):boolean { return typeof v==='string'?v.length>0:Number(v)!==0; }
  private expect(s:string[],t:string):void { if(s[this.pos]!==t) throw new Error(`expected '${t}', got '${s[this.pos]??'<end>'}'`); this.pos++; }
  private unquote(t:string):string { return t.slice(1,-1).replace(/\\n/g,'\n').replace(/\\t/g,'\t').replace(/\\r/g,'\r').replace(/\\"/g,'"').replace(/\\'/g,"'").replace(/\\\\/g,'\\'); }
}
