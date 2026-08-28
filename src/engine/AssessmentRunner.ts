import { InBrowserLinuxEngine } from './LinuxEngine';

export interface TestCase {
  id: number;
  description: string;
  injectedVar: { name: string; value: number };
  expectedSubstring: string;
}

export interface AssessmentResult {
  passed: number;
  total: number;
  logs: string[];
  score: number;
}

export class AssessmentRunner {
  private engine: InBrowserLinuxEngine;

  constructor(engine: InBrowserLinuxEngine) {
    this.engine = engine;
  }

  public runCTestSuite(sourceCode: string): AssessmentResult {
    const testCases: TestCase[] = [
      { id: 1, description: 'Table num=5 (Step 1)', injectedVar: { name: 'num', value: 5 }, expectedSubstring: '5 x 1 = 5' },
      { id: 2, description: 'Table num=5 (Step 10)', injectedVar: { name: 'num', value: 5 }, expectedSubstring: '5 x 10 = 50' },
      { id: 3, description: 'Table num=9 (Step 5)', injectedVar: { name: 'num', value: 9 }, expectedSubstring: '9 x 5 = 45' },
      { id: 4, description: 'Table num=12 (Step 10)', injectedVar: { name: 'num', value: 12 }, expectedSubstring: '12 x 10 = 120' },
      { id: 5, description: 'Edge case num=0', injectedVar: { name: 'num', value: 0 }, expectedSubstring: '0 x 10 = 0' },
      { id: 6, description: 'Negative input num=-3', injectedVar: { name: 'num', value: -3 }, expectedSubstring: '-3 x 10 = -30' },
    ];

    return this.evaluateSuite(sourceCode, 'c', testCases, [
      { label: 'C main function', ok: /\bmain\s*\(/.test(sourceCode) },
      { label: 'C output statement', ok: /printf\s*\(/.test(sourceCode) },
      { label: 'Iteration construct', ok: /\b(for|while)\s*\(/.test(sourceCode) },
    ]);
  }

  public runJavaTestSuite(sourceCode: string): AssessmentResult {
    const testCases: TestCase[] = [
      { id: 1, description: 'Prime test for 7', injectedVar: { name: 'num', value: 7 }, expectedSubstring: '7 is a Prime Number' },
      { id: 2, description: 'Composite test for 8', injectedVar: { name: 'num', value: 8 }, expectedSubstring: '8 is not a Prime Number' },
      { id: 3, description: 'Prime test for 13', injectedVar: { name: 'num', value: 13 }, expectedSubstring: '13 is a Prime Number' },
      { id: 4, description: 'Small prime 2', injectedVar: { name: 'num', value: 2 }, expectedSubstring: '2 is a Prime Number' },
      { id: 5, description: 'Small non-prime 1', injectedVar: { name: 'num', value: 1 }, expectedSubstring: '1 is not a Prime Number' },
    ];

    return this.evaluateSuite(sourceCode, 'java', testCases, [
      { label: 'Java class declaration', ok: /\bclass\s+\w+/.test(sourceCode) },
      { label: 'Java main method', ok: /static\s+void\s+main\s*\(/.test(sourceCode) },
      { label: 'Java console output', ok: /System\.out\.(print|println)\s*\(/.test(sourceCode) },
    ]);
  }

  private evaluateSuite(
    code: string,
    lang: 'c' | 'java',
    suite: TestCase[],
    structuralChecks: Array<{ label: string; ok: boolean }>,
  ): AssessmentResult {
    let passed = 0;
    const logs: string[] = [];
    const startTime = performance.now();

    for (const check of structuralChecks) {
      if (check.ok) {
        logs.push(`<div style="color:#4ade80;margin:3px 0;">✓ [Structure] ${check.label}</div>`);
      } else {
        logs.push(`<div style="color:#fb7185;margin:3px 0;">✗ [Structure] ${check.label}</div>`);
      }
    }

    for (const tc of suite) {
      const output = this.engine.executeGeneralCode(code, lang, { [tc.injectedVar.name]: tc.injectedVar.value });
      const isSuccess = output.includes(tc.expectedSubstring);

      if (isSuccess) {
        passed++;
        logs.push(`<div class="test-pass" style="color:#4ade80;margin:3px 0;">✓ [Passed] ${tc.description}</div>`);
      } else {
        logs.push(`<div class="test-fail" style="color:#fb7185;margin:3px 0;">✗ [Failed] ${tc.description}</div>`);
      }
    }

    const structuralPassed = structuralChecks.filter((check) => check.ok).length;
    const total = suite.length + structuralChecks.length;
    const totalPassed = passed + structuralPassed;
    const score = Math.round((totalPassed / total) * 100);
    const elapsed = (performance.now() - startTime).toFixed(2);

    logs.unshift(`<div style="margin-bottom:8px;color:#38bdf8;">Assessment completed in <strong>${elapsed} ms</strong> — <strong>${score}%</strong> (${totalPassed}/${total})</div>`);
    return { passed: totalPassed, total, logs, score };
  }
}
