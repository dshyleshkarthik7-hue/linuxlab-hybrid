export type ShellOperator = '&&' | '||' | ';' | '|';

export interface ShellCommandNode { type: 'command'; text: string; }
export interface ShellBinaryNode { type: 'binary'; operator: ShellOperator; left: ShellNode; right: ShellNode; }
export type ShellNode = ShellCommandNode | ShellBinaryNode;

export const SHELL_COMPATIBILITY = {
  '&&': 'supported', '||': 'supported', ';': 'supported', '|': 'supported',
  quoting: 'partial', escaping: 'partial',
  redirects: 'supported', inputRedirects: 'unsupported', appendRedirects: 'supported',
  subshells: 'unsupported', commandSubstitution: 'unsupported',
  backgroundJobs: 'unsupported', heredocs: 'unsupported', shellExpansion: 'implementation-dependent',
} as const;

export class ShellParser {
  private source = '';
  private index = 0;

  parse(source: string): ShellNode {
    this.source = source.trim();
    this.index = 0;
    if (!this.source) return { type: 'command', text: '' };
    const node = this.parseSequence();
    this.skipWhitespace();
    if (this.index < this.source.length) throw new Error(`Unexpected shell token at ${this.index}`);
    return node;
  }

  private parseSequence(): ShellNode {
    let left: ShellNode = this.parseConditional();
    while (true) {
      this.skipWhitespace();
      const operator = this.readOperator(';');
      if (!operator) return left;
      const right = this.parseConditional();
      left = { type: 'binary', operator, left, right };
    }
  }

  private parseConditional(): ShellNode {
    let left: ShellNode = this.parsePipeline();
    while (true) {
      this.skipWhitespace();
      const operator = this.readOperator('&&') || this.readOperator('||');
      if (!operator) return left;
      const right = this.parsePipeline();
      left = { type: 'binary', operator, left, right };
    }
  }

  private parsePipeline(): ShellNode {
    let left: ShellNode = this.parseCommand();
    while (true) {
      this.skipWhitespace();
      if (!this.source.startsWith('|', this.index) || this.source.startsWith('||', this.index)) return left;
      this.index++;
      const right = this.parseCommand();
      left = { type: 'binary', operator: '|', left, right };
    }
  }

  private parseCommand(): ShellCommandNode {
    this.skipWhitespace();
    const start = this.index;
    let quote: '"' | "'" | null = null;
    let escaped = false;
    while (this.index < this.source.length) {
      const ch = this.source[this.index];
      if (escaped) { escaped = false; this.index++; continue; }
      if (ch === '\\') { escaped = true; this.index++; continue; }
      if (quote) { if (ch === quote) quote = null; this.index++; continue; }
      if (ch === '"' || ch === "'") { quote = ch; this.index++; continue; }
      if (ch === '`' || ch === '(' || ch === ')') throw new Error('Unsupported shell feature: substitution or subshells are not implemented');
      if (ch === '<') throw new Error('Unsupported shell feature: input redirects are not implemented');
      if (ch === '&') {
        if (this.source.startsWith('&&', this.index)) break;
        throw new Error('Unsupported shell feature: background jobs are not implemented');
      }
      if (ch === ';' || ch === '|') break;
      this.index++;
    }
    if (escaped) throw new Error('Trailing escape');
    if (quote) throw new Error('Unterminated quote');
    const text = this.source.slice(start, this.index).trim();
    if (!text) throw new Error('Expected command');
    if (text.includes('$(') || text.includes('${') || text.includes('<<')) throw new Error('Unsupported shell feature: command substitution and heredocs are not implemented');
    return { type: 'command', text };
  }

  private readOperator(operator: ShellOperator): ShellOperator | null {
    if (!this.source.startsWith(operator, this.index)) return null;
    this.index += operator.length;
    return operator;
  }

  private skipWhitespace(): void { while (/\s/.test(this.source[this.index] || '')) this.index++; }
}
