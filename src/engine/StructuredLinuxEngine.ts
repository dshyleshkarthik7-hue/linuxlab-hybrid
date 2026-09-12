import { InBrowserLinuxEngine } from './LinuxEngine.ts';
import type { CommandResult } from './CommandResult.ts';
import { ShellParser } from './ShellParser.ts';
import { ShellPlanner } from './ShellPlanner.ts';
import type { ShellPlan } from './ShellPlanner.ts';
import { VM_RESOURCE_POLICIES, boundedText } from './VMResourcePolicy.ts';

/** Parser -> planner -> executor facade for the educational simulator. */
export class StructuredLinuxEngine extends InBrowserLinuxEngine {
  private readonly parser = new ShellParser();
  private readonly planner = new ShellPlanner(VM_RESOURCE_POLICIES.linux4.maxPipelineStages);

  // Do not use a subclass field here: InBrowserLinuxEngine's constructor calls
  // writeFile() while subclass fields are still uninitialized. Resolving the
  // immutable policy through a getter makes the override safe during super().
  private get policy() { return VM_RESOURCE_POLICIES.linux4; }

  public override writeFile(path: string, content: string): boolean {
    const current = this.readFile(path);
    const currentBytes = current === null ? 0 : new TextEncoder().encode(current).byteLength;
    const nextBytes = new TextEncoder().encode(content).byteLength;
    const used = this.filesystemBytes();
    if (used - currentBytes + nextBytes > this.policy.maxFilesystemBytes) return false;
    if (nextBytes > this.policy.maxFileBytes) return false;
    return super.writeFile(path, content);
  }

  private filesystemBytes(): number {
    const root = this.root;
    let total = 0;
    const walk = (node: { type: string; content?: string; children?: Map<string, any> }): void => {
      if (node.type === 'file') total += new TextEncoder().encode(node.content ?? '').byteLength;
      if (node.type === 'dir' && node.children) for (const child of node.children.values()) walk(child);
    };
    walk(root);
    return total;
  }

  public async executeResult(source: string): Promise<CommandResult> {
    const started = performance.now();
    const command = source.trim();
    if (!command) return { command, stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    if (command.length > 64_000) return this.fail(command, 'command line exceeds the session input limit', started, 2);
    if (this.isBlockedAdversarialInput(command)) return this.fail(command, 'command rejected by sandbox safety policy', started, 126);
    this.history.push(command);

    try {
      const ast = this.parser.parse(command);
      const plan = this.planner.plan(ast);
      const result = await this.withTimeout(this.executePlan(plan), this.policy.maxCommandMs);
      const stdout = boundedText(result.stdout, this.policy.maxOutputBytes);
      const stderr = boundedText(result.stderr, this.policy.maxOutputBytes);
      return { command, stdout: stdout.value, stderr: stderr.value, exitCode: result.exitCode, durationMs: performance.now() - started, timedOut: false, truncated: stdout.truncated || stderr.truncated };
    } catch (error) {
      const timedOut = error instanceof Error && error.message === 'command timed out';
      return this.fail(command, timedOut ? 'command timed out' : (error instanceof Error ? error.message : String(error)), started, timedOut ? 124 : 2, timedOut);
    }
  }

  public override async execute(source: string): Promise<string> { const result = await this.executeResult(source); return result.stdout || result.stderr.replace(/\n$/, ''); }

  private async executePlan(plan: ShellPlan): Promise<Omit<CommandResult, 'durationMs' | 'command' | 'timedOut' | 'truncated'>> {
    if (plan.kind === 'command') return this.runCommand(plan.command, '');
    if (plan.kind === 'sequence') { const left = await this.executePlan(plan.left); const right = await this.executePlan(plan.right); return this.combine(left, right, right.exitCode); }
    if (plan.kind === 'and' || plan.kind === 'or') { const left = await this.executePlan(plan.left); const shouldRun = plan.kind === 'and' ? left.exitCode === 0 : left.exitCode !== 0; if (!shouldRun) return left; const right = await this.executePlan(plan.right); return this.combine(left, right, right.exitCode); }
    const stages = this.flatten(plan); let stdin = ''; let stderr = ''; let result: Omit<CommandResult, 'durationMs' | 'command' | 'timedOut' | 'truncated'> = { stdout: '', stderr: '', exitCode: 0 };
    for (const stage of stages) { result = await this.runCommand(stage.command, stdin); stderr += result.stderr; if (result.exitCode !== 0) break; stdin = result.stdout; }
    return { stdout: result.stdout, stderr, exitCode: result.exitCode };
  }

  private flatten(plan: ShellPlan): Array<Extract<ShellPlan, { kind: 'command' }>> { if (plan.kind === 'command') return [plan]; if (plan.kind !== 'pipeline') throw new Error('invalid pipeline plan'); return [...this.flatten(plan.left), ...this.flatten(plan.right)]; }

  private async runCommand(source: string, stdin: string): Promise<Omit<CommandResult, 'durationMs' | 'command' | 'timedOut' | 'truncated'>> {
    const parsed = this.extractRedirections(source); if (!parsed.command) throw new Error('Expected command'); let input = stdin;
    if (parsed.stdinFile) { const file = this.readFile(parsed.stdinFile); if (file === null) return { stdout: '', stderr: `bash: ${parsed.stdinFile}: No such file or directory\n`, exitCode: 1 }; input = file; }
    const output = await this.invokeLegacyCommand(parsed.command, input); let stdout = output.exitCode === 0 ? output.output : ''; let stderr = output.exitCode === 0 ? '' : output.output;
    if (parsed.stdoutFile) { const previous = parsed.appendStdout ? (this.readFile(parsed.stdoutFile) ?? '') : ''; if (previous.length + stdout.length > this.policy.maxFileBytes) return { stdout: '', stderr: 'bash: file size limit exceeded\n', exitCode: 1 }; if (!this.writeFile(parsed.stdoutFile, previous + stdout)) return { stdout: '', stderr: `bash: ${parsed.stdoutFile}: cannot create file\n`, exitCode: 1 }; stdout = ''; }
    if (parsed.stderrFile) { const previous = parsed.appendStderr ? (this.readFile(parsed.stderrFile) ?? '') : ''; if (previous.length + stderr.length > this.policy.maxFileBytes) return { stdout, stderr: 'bash: file size limit exceeded\n', exitCode: 1 }; if (!this.writeFile(parsed.stderrFile, previous + stderr)) return { stdout, stderr: `bash: ${parsed.stderrFile}: cannot create file\n`, exitCode: 1 }; stderr = ''; }
    return { stdout, stderr, exitCode: output.exitCode };
  }

  private async invokeLegacyCommand(command: string, stdin: string): Promise<{ output: string; exitCode: number }> {
    const trimmed = command.trim(); const tokens = (trimmed.match(/(?:[^\s"'\\]|\\.|"(?:\\.|[^"])*"|'(?:\\.|[^'])*')+/g) || []).map(token => token.replace(/^(['"])([\s\S]*)\1$/, '$2')); const name = tokens[0] ?? ''; const args = tokens.slice(1);
    if (name === 'printf') { const format = args.join(' '); return { output: format.replace(/\\n/g, '\n').replace(/\\t/g, '\t'), exitCode: 0 }; }
    if (name === 'wc') { const mode = args.find(arg => arg.startsWith('-')) ?? '-l'; if (args.some(arg => !arg.startsWith('-'))) { const path = args.find(arg => !arg.startsWith('-'))!; const file = this.readFile(path); if (file === null) return { output: `wc: ${path}: No such file or directory\n`, exitCode: 1 }; stdin = file; } if (mode.includes('c')) return { output: `${new TextEncoder().encode(stdin).byteLength}\n`, exitCode: 0 }; if (mode.includes('w')) return { output: `${stdin.trim() ? stdin.trim().split(/\s+/).length : 0}\n`, exitCode: 0 }; if (mode.includes('m')) return { output: `${stdin.length}\n`, exitCode: 0 }; return { output: `${stdin ? stdin.split(/\r?\n/).length - (stdin.endsWith('\n') ? 1 : 0) : 0}\n`, exitCode: 0 }; }
    const legacy = this as unknown as { executeCommand: (line: string, input?: string) => Promise<string>; exitCode: number }; const output = await legacy.executeCommand(command, stdin); let exitCode = Number.isInteger(legacy.exitCode) ? legacy.exitCode : 0; if (exitCode === 0 && this.isFailureDiagnostic(output)) exitCode = 1; return { output, exitCode };
  }

  private isFailureDiagnostic(output: string): boolean { return /^(?:bash: |(?:cat|grep|head|tail|wc|sort|uniq|ls|cd|mkdir|touch|rm|cp|mv|find|chmod|stat|gcc|clang|javac|java|export|which): )/i.test(output) && /(?:No such file or directory|missing (?:operand|file operand|destination|search pattern|argument)|cannot (?:access|create|remove|stat|touch|move|read)|invalid (?:mode|option)|usage:|file not found|File exists|Is a directory|Not a directory|not specified|omitting directory)/i.test(output); }
  private combine(left: Omit<CommandResult, 'durationMs' | 'command' | 'timedOut' | 'truncated'>, right: Omit<CommandResult, 'durationMs' | 'command' | 'timedOut' | 'truncated'>, exitCode: number) { return { stdout: [left.stdout, right.stdout].filter(Boolean).join('\n'), stderr: [left.stderr, right.stderr].filter(Boolean).join('\n'), exitCode }; }
  private fail(command: string, message: string, started: number, exitCode: number, timedOut = false): CommandResult { return { command, stdout: '', stderr: `bash: ${message}\n`, exitCode, durationMs: performance.now() - started, timedOut }; }
  private isBlockedAdversarialInput(command: string): boolean { return /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/u.test(command) || /(?:^|[;&|])\s*while\s+(?:true|:|1)\s*;?/u.test(command) || /\bfork\s*\(/u.test(command) || /\b(?:exec|system|popen)\s*\(/u.test(command); }
  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error('command timed out')), ms); })]); } finally { if (timer) clearTimeout(timer); } }
  private extractRedirections(input: string): RedirectionSpec { let command = ''; let stdoutFile: string | undefined; let stderrFile: string | undefined; let stdinFile: string | undefined; let appendStdout = false; let appendStderr = false; let quote: '"' | "'" | null = null; let escaped = false; const tokens: string[] = []; let current = ''; const flush = () => { if (current.trim()) tokens.push(current.trim()); current = ''; }; for (let i = 0; i < input.length; i++) { const ch = input[i]; if (escaped) { current += ch; escaped = false; continue; } if (ch === '\\') { current += ch; escaped = true; continue; } if (quote) { current += ch; if (ch === quote) quote = null; continue; } if (ch === '"' || ch === "'") { current += ch; quote = ch; continue; } if (/\s/.test(ch)) { flush(); continue; } let op: string | null = null; if (input.startsWith('2>>', i)) op = '2>>'; else if (input.startsWith('2>', i)) op = '2>'; else if (input.startsWith('>>', i)) op = '>>'; else if (input.startsWith('>', i)) op = '>'; else if (input.startsWith('<', i)) op = '<'; if (!op) { current += ch; continue; } flush(); i += op.length; while (/\s/.test(input[i] || '')) i++; let target = ''; let targetQuote: '"' | "'" | null = null; for (; i < input.length; i++) { const t = input[i]; if (targetQuote) { if (t === targetQuote) targetQuote = null; else target += t; continue; } if (t === '"' || t === "'") { targetQuote = t; continue; } if (/\s/.test(t)) break; target += t; } i--; if (!target) throw new Error(`missing file operand for ${op}`); if (op === '<') stdinFile = target; else if (op === '>') stdoutFile = target; else if (op === '>>') { stdoutFile = target; appendStdout = true; } else if (op === '2>') stderrFile = target; else { stderrFile = target; appendStderr = true; } } flush(); command = tokens.join(' '); return { command, stdoutFile, stderrFile, stdinFile, appendStdout, appendStderr }; }
}

type RedirectionSpec = { command: string; stdoutFile?: string; stderrFile?: string; stdinFile?: string; appendStdout: boolean; appendStderr: boolean };
