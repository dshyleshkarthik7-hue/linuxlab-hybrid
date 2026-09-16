import { strict as assert } from 'node:assert';
import { AssessmentRunner } from '../src/engine/AssessmentRunner.ts';

const engine = {
  executeGeneralCode(code: string, language: string, vars: Record<string, number>) {
    if (language === 'c') {
      const n = vars.num;
      return `Table num=${n}\n${Array.from({ length: 10 }, (_, i) => `${n} x ${i + 1} = ${n * (i + 1)}`).join('\n')}`;
    }
    const n = vars.num;
    const prime = n > 1 && Array.from({ length: Math.max(0, n - 2) }, (_, i) => i + 2).every(d => n % d !== 0);
    return `${n} is ${prime ? '' : 'not '}a Prime Number`;
  },
} as any;

const runner = new AssessmentRunner(engine);

const c = runner.runCTestSuite('int main(){ for(int i=1;i<=10;i++) printf("%d x %d = %d", num, i, num*i); }');
assert.equal(c.educationalOnly, true);
assert.equal(c.executionVerified, false);
assert.equal(c.verificationMode, 'simulator-runtime');
assert.equal(c.total, 9);
assert.equal(c.score, 100);

const java = runner.runJavaTestSuite('class Main { public static void main(String[] args){ System.out.println(num + " is a Prime Number"); } }');
assert.equal(java.total, 8);
assert.equal(java.score, 100);

const unsupportedC = runner.runCTestSuite('int main(){ system("echo hi"); printf("x"); for(;;){} }');
assert.ok(unsupportedC.unableToVerify > 0);

const unsupportedJava = runner.runJavaTestSuite('class Main { public static void main(String[] args){ Runtime.getRuntime().exec("x"); System.out.println(num); } }');
assert.ok(unsupportedJava.unableToVerify > 0);

const missing = runner.runCTestSuite('printf("x");');
assert.ok(missing.unableToVerify > 0);

console.log('AssessmentRunner coverage checks passed');
