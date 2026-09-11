export type ShellOperator = '&&' | '||' | ';' | '|';

export interface ShellCommandNode {
  type: 'command';
  text: string;
}

export interface ShellBinaryNode {
  type: 'binary';
  operator: ShellOperator;
  left: ShellNode;
  right: ShellNode;
}

export type ShellNode = ShellCommandNode | ShellBinaryNode;

/** Small, quote-aware shell grammar used by the simulator. It deliberately
 * models only the operators supported by Engine A instead of pretending to be
 * a complete POSIX shell. Operators inside single/double quotes or after an
 * escape are treated as ordinary text. */
export class ShellParser {
  private source = '';
  private index = 0;

  parse(source: string): ShellNode {
    this.source = source.trim();
    this.index = 0;
    if (!this.source) return { type: 'command', text: '' };
    const node = this.parseSequence();
    this.skipWhitespace();
    if (this.index < this.source.length) {
      throw new Error(`Unexpected shell token at ${this.index}`);
    }
    return node;
  }

  private parseSequence(): ShellNode {
    let left = this.parsePipeline();
    while (true) {
      this.skipWhitespace();
      const operator = this.readOperator(';');
      if (!operator) return left;
      const right = this.parsePipeline();
      left = { type: 'binary', operator, left, right };
    }
  }

  private parsePipeline(): ShellNode {
    let left = this.parseConditional();
    while (true) {
      this.skipWhitespace();
      const operator = this.readOperator('|');
      if (!operator) return left;
      const right = this.parseConditional();
      left = { type: 'binary', operator, left, right };
    }
  }

  private parseConditional(): ShellNode {
    let left = this.parseCommand();
    while (true) {
      this.skipWhitespace();
      const operator = this.readOperator('&&') || this.readOperator('||');
      if (!operator) return left;
      const right = this.parseCommand();
      left = { type: 'binary', operator, left, right };
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
      if (quote) {
        if (ch === quote) quote = null;
        this.index++;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; this.index++; continue; }
      if (ch === ';' || ch === '|') break;
      if (ch === '&' && this.source.startsWith('&&', this.index)) break;
      this.index++;
    }
    if (quote) throw new Error('Unterminated quote');
    const text = this.source.slice(start, this.index).trim();
    if (!text) throw new Error('Expected command');
    return { type: 'command', text };
  }

  private readOperator(operator: ShellOperator): ShellOperator | null {
    if (!this.source.startsWith(operator, this.index)) return null;
    this.index += operator.length;
    return operator;
  }

  private skipWhitespace(): void {
    while (/\s/.test(this.source[this.index] || '')) this.index++;
  }
}
