import { InBrowserLinuxEngine } from './LinuxEngine.ts';
import { CommandResult } from './CommandResult.ts';
import { ShellParser, ShellNode, ShellCommandNode } from './ShellParser.ts';

/** Correctness-first shell facade for the simulator. */
export class StructuredLinuxEngine extends InBrowserLinuxEngine {
  private readonly parser = new ShellParser();

  public async executeResult(source: string): Promise<CommandResult> {
    const started = performance.now();
    const text = source.trim();
    if (!text) return { stdout: '', stderr: '', exitCode: 0, durationMs: 0 };
    this.history.push(text);
    try {
      const result = await this.evaluate(this.parser.parse(text));
      return { ...result, durationMs: performance.now() - started };
    } catch (error) {
      return { stdout: '', stderr: `bash: ${error instanceof Error ? error.message : String(error)}\n`, exitCode: 2, durationMs: performance.now() - started };
    }
  }

  public override async execute(source: string): Promise<string> {
    const result = await this.executeResult(source);
    return result.stdout || result.stderr.replace(/\n$/, '');
  }

  private async evaluate(node: ShellNode): Promise<Omit<CommandResult, 'durationMs'>> {
    if (node.type === 'command') return this.runCommandNode(node, '');
    if (node.operator === ';') {
      const left = await this.evaluate(node.left);
      const right = await this.evaluate(node.right);
      return this.combine(left, right, right.exitCode);
    }
    if (node.operator === '&&' || node.operator === '||') {
      const left = await this.evaluate(node.left);
      const shouldRun = node.operator === '&&' ? left.exitCode === 0 : left.exitCode !== 0;
      if (!shouldRun) return left;
      const right = await this.evaluate(node.right);
      return this.combine(left, right, right.exitCode);
    }
    if (node.operator === '|') {
      const stages = this.flattenPipeline(node);
      let stdin = '';
      let stderr = '';
      let result: Omit<CommandResult, 'durationMs'> = { stdout: '', stderr: '', exitCode: 0 };
      for (const stage of stages) {
        result = await this.runCommandNode(stage, stdin);
        stdin = result.stdout;
        stderr += result.stderr;
      }
      return { stdout: result.stdout, stderr, exitCode: result.exitCode };
    }
    return { stdout: '', stderr: 'bash: unsupported operator\n', exitCode: 2 };
  }

  private combine(left: Omit<CommandResult, 'durationMs'>, right: Omit<CommandResult, 'durationMs'>, exitCode: number) {
    return {
      stdout: [left.stdout, right.stdout].filter(Boolean).join('\n'),
      stderr: [left.stderr, right.stderr].filter(Boolean).join('\n'),
      exitCode,
    };
  }

  private flattenPipeline(node: ShellNode): ShellCommandNode[] {
    if (node.type === 'command') return [node];
    if (node.operator !== '|') throw new Error('Invalid pipeline');
    return [...this.flattenPipeline(node.left), ...this.flattenPipeline(node.right)];
  }

  private async runCommandNode(node: ShellCommandNode, stdin: string): Promise<Omit<CommandResult, 'durationMs'>> {
    const parsed = this.extractRedirections(node.text);
    if (!parsed.command) throw new Error('Expected command');

    let input = stdin;
    if (parsed.stdinFile) {
      const file = this.readFile(parsed.stdinFile);
      if (file === null) return { stdout: '', stderr: `bash: ${parsed.stdinFile}: No such file or directory\n`, exitCode: 1 };
      input = file;
    }

    const result = await this.invokeLegacyCommand(parsed.command, input);
    return this.applyOutputRedirections(
      result.exitCode === 0 ? result.output : '',
      result.exitCode === 0 ? '' : result.output,
      result.exitCode,
      parsed,
    );
  }

  private async invokeLegacyCommand(command: string, stdin: string): Promise<{ output: string; exitCode: number }> {
    const legacy = this as unknown as { executeCommand: (line: string, input?: string) => Promise<string>; exitCode: number };
    const output = await legacy.executeCommand(command, stdin);
    return { output, exitCode: Number.isInteger(legacy.exitCode) ? legacy.exitCode : 0 };
  }

  private applyOutputRedirections(stdout: string, stderr: string, exitCode: number, redir: RedirectionSpec) {
    if (redir.stdoutFile) {
      const previous = redir.appendStdout ? (this.readFile(redir.stdoutFile) ?? '') : '';
      if (!this.writeFile(redir.stdoutFile, previous + stdout)) return { stdout: '', stderr: `bash: ${redir.stdoutFile}: No such file or directory\n`, exitCode: 1 };
      stdout = '';
    }
    if (redir.stderrFile) {
      const previous = redir.appendStderr ? (this.readFile(redir.stderrFile) ?? '') : '';
      if (!this.writeFile(redir.stderrFile, previous + stderr)) return { stdout, stderr: `bash: ${redir.stderrFile}: No such file or directory\n`, exitCode: 1 };
      stderr = '';
    }
    return { stdout, stderr, exitCode };
  }

  private extractRedirections(input: string): RedirectionSpec {
    let command = '';
    let stdoutFile: string | undefined;
    let stderrFile: string | undefined;
    let stdinFile: string | undefined;
    let appendStdout = false;
    let appendStderr = false;
    let quote: '"' | "'" | null = null;
    let escaped = false;
    const tokens: string[] = [];
    let current = '';
    const flush = () => { if (current.trim()) tokens.push(current.trim()); current = ''; };

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (escaped) { current += ch; escaped = false; continue; }
      if (ch === '\\') { current += ch; escaped = true; continue; }
      if (quote) { current += ch; if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
      if (/\s/.test(ch)) { flush(); continue; }
      let op: string | null = null;
      if (input.startsWith('2>>', i)) op = '2>>';
      else if (input.startsWith('2>', i)) op = '2>';
      else if (input.startsWith('>>', i)) op = '>>';
      else if (input.startsWith('>', i)) op = '>';
      else if (input.startsWith('<', i)) op = '<';
      if (op) {
        flush();
        i += op.length;
        while (/\s/.test(input[i] || '')) i++;
        let target = '';
        let targetQuote: '"' | "'" | null = null;
        for (; i < input.length; i++) {
          const t = input[i];
          if (targetQuote) { if (t === targetQuote) targetQuote = null; else target += t; continue; }
          if (t === '"' || t === "'") { targetQuote = t; continue; }
          if (/\s/.test(t)) break;
          target += t;
        }
        i--;
        if (!target) throw new Error(`missing file operand for ${op}`);
        if (op === '<') stdinFile = target;
        else if (op === '>') stdoutFile = target;
        else if (op === '>>') { stdoutFile = target; appendStdout = true; }
        else if (op === '2>') stderrFile = target;
        else { stderrFile = target; appendStderr = true; }
        continue;
      }
      current += ch;
    }
    flush();
    command = tokens.join(' ');
    return { command, stdoutFile, stderrFile, stdinFile, appendStdout, appendStderr };
  }
}

type RedirectionSpec = {
  command: string;
  stdoutFile?: string;
  stderrFile?: string;
  stdinFile?: string;
  appendStdout: boolean;
  appendStderr: boolean;
};
