import type { ShellNode, ShellCommandNode } from './ShellParser.ts';

export type ShellPlan =
  | { kind: 'command'; command: string }
  | { kind: 'sequence' | 'and' | 'or' | 'pipeline'; left: ShellPlan; right: ShellPlan };

export class ShellPlanner {
  private readonly maxPipelineStages: number;
  private readonly maxDepth: number;

  constructor(maxPipelineStages = 16, maxDepth = 64) {
    this.maxPipelineStages = maxPipelineStages;
    this.maxDepth = maxDepth;
  }

  plan(node: ShellNode): ShellPlan {
    return this.visit(node, 0);
  }

  private visit(node: ShellNode, depth: number): ShellPlan {
    if (depth > this.maxDepth) throw new Error('command nesting exceeds the session limit');
    if (node.type === 'command') {
      const command = this.normalize(node);
      if (!command) throw new Error('Expected command');
      return { kind: 'command', command };
    }

    const left = this.visit(node.left, depth + 1);
    const right = this.visit(node.right, depth + 1);
    if (node.operator === '|') {
      const stages = this.pipelineLength(node);
      if (stages > this.maxPipelineStages) throw new Error(`pipeline exceeds ${this.maxPipelineStages} stages`);
      return { kind: 'pipeline', left, right };
    }
    if (node.operator === '&&') return { kind: 'and', left, right };
    if (node.operator === '||') return { kind: 'or', left, right };
    return { kind: 'sequence', left, right };
  }

  private pipelineLength(node: ShellNode): number {
    if (node.type === 'command') return 1;
    if (node.operator !== '|') return 1;
    return this.pipelineLength(node.left) + this.pipelineLength(node.right);
  }

  private normalize(node: ShellCommandNode): string {
    return node.text.trim();
  }
}
