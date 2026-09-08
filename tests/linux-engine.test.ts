import { strict as assert } from 'node:assert';
import { InBrowserLinuxEngine } from '../src/engine/LinuxEngine.ts';
import { AssessmentRunner } from '../src/engine/AssessmentRunner.ts';

async function run() {
  const e = new InBrowserLinuxEngine();

  assert.equal(await e.execute('pwd'), '/root');
  assert.ok((await e.execute('ping example.com')).startsWith('[SIMULATED — Engine A'));
  assert.ok((await e.execute('df')).startsWith('[SIMULATED — Engine A'));
  assert.equal(await e.execute('cd /tmp && pwd'), '/tmp');
  assert.equal(await e.execute('cd /root && pwd'), '/root');

  assert.equal(await e.execute('echo hi > f && cat f'), 'hi');
  assert.equal(await e.execute('cat missing && echo should-not-run'), 'cat: missing: No such file or directory');
  assert.equal(await e.execute('cat missing || echo recovered'), 'recovered');
  assert.equal(await e.execute('echo one; echo two'), 'one\ntwo');
  assert.equal((await e.execute('echo alpha | grep alpha')).trim(), 'alpha');
  assert.equal((await e.execute('echo alpha | grep beta')).trim(), '');
  assert.equal((await e.execute('echo z | sort')).trim(), 'z');

  assert.equal(await e.execute('touch a && cp a b && mv b c && cat c'), '');
  assert.equal(await e.execute('cat b'), 'cat: b: No such file or directory');

  const found = await e.execute('find /root -name main.c');
  assert.equal(found.trim(), '/root/main.c');
  assert.ok((await e.execute('find /root -name "*.c"')).includes('/root/main.c'));
  assert.ok((await e.execute('find /root -type f')).includes('/root/main.c'));

  const ls = await e.execute('ls -la');
  assert.ok(ls.includes('main.c'));
  assert.ok((await e.execute('ls -l')).includes('-rw-r--r--'));

  assert.equal(await e.execute('rm c && cat c'), 'cat: c: No such file or directory');
  const touched = await e.execute('touch one two && ls');
  assert.ok(touched.includes('one'));
  assert.ok((await e.execute('ls')).includes('two'));
  assert.equal(await e.execute('mkdir dir && touch dir/file && cp dir/file /root && cat /root/file'), '');
  assert.equal(await e.execute('rm dir'), "rm: cannot remove 'dir': Is a directory");
  assert.equal(await e.execute('test -d dir'), '');
  assert.equal(await e.execute('rm -r dir'), '');
  assert.equal(await e.execute('echo one two | wc -w'), '2');


  // Regression coverage for shell semantics and common learner workflows.
  assert.equal(await e.execute('true && echo ok'), 'ok');
  assert.equal(await e.execute('false && echo no'), '');
  assert.equal(await e.execute('false || echo fallback'), 'fallback');
  assert.equal(await e.execute('echo first; false; echo last'), 'first\nlast');
  assert.equal((await e.execute('echo alpha | grep alpha | wc -l')).trim(), '1');
  assert.equal(await e.execute('echo hi > quoted && cat quoted'), 'hi');
  assert.ok((await e.execute('find /root -name "*.java"')).includes('/root/Main.java'));
  assert.equal(await e.execute('test -d /root'), '');
  assert.equal(await e.execute('test -f /root/main.c'), '');
  assert.equal(await e.execute('test -f /root'), '');
  assert.equal(await e.execute('[ -d /root ]'), '');
  assert.equal(await e.execute('echo "a | b"'), 'a | b');
  assert.equal(await e.execute("echo 'a && b'"), 'a && b');
  assert.equal(await e.execute('echo first > /tmp/a; cat /tmp/a'), 'first');
  assert.equal(await e.execute('mkdir /tmp/nested && touch /tmp/nested/x && find /tmp -type f'), '/tmp/a\n/tmp/nested/x');
  assert.equal(await e.execute('rm /tmp/nested'), "rm: cannot remove '/tmp/nested': Is a directory");
  assert.equal(await e.execute('rm -r /tmp/nested && test -e /tmp/nested'), '');

  // Java educational parser must choose the evaluated branch instead of emitting
  // both sides of a bare-boolean if/else. This protects assessment correctness.
  const javaPrimeProgram = `public class Main {
    public static void main(String[] args) {
      int num = 7;
      boolean isPrime = true;
      for (int i = 2; i <= num / 2; i++) {
        if (num % i == 0) { isPrime = false; break; }
      }
      if (isPrime) {
        System.out.println(num + " is a Prime Number");
      } else {
        System.out.println(num + " is not a Prime Number");
      }
    }
  }`;
  assert.equal(
    e.executeGeneralCode(javaPrimeProgram, 'java', { num: 7 }),
    '7 is a Prime Number\n'
  );
  assert.equal(
    e.executeGeneralCode(javaPrimeProgram, 'java', { num: 8 }),
    '8 is not a Prime Number\n'
  );
  const javaAssessment = new AssessmentRunner(e).runJavaTestSuite(javaPrimeProgram);
  const composite = javaAssessment.checks.find(check => check.label === 'Composite test for 8');
  assert.equal(composite?.passed, true);


  // Nested control flow must not duplicate the selected outer branch output.
  const nestedJava = `public class Main { static void main(String[] args) {
    int num = 8; boolean isPrime = false;
    if (num > 0) { if (isPrime) { System.out.println("inner"); } }
    if (isPrime) { System.out.println(num + " prime"); } else { System.out.println(num + " composite"); }
  } }`;
  assert.equal(e.executeGeneralCode(nestedJava, 'java', { num: 8 }), '8 composite\\n');
  assert.equal(e.executeGeneralCode(nestedJava, 'java', { num: 7 }), '7 composite\\n');

  // CI compatibility: files imported by Node's --experimental-strip-types mode
  // must avoid non-erasable TypeScript syntax such as parameter properties.
  const assessment = new AssessmentRunner(e);
  assert.equal(assessment.runCTestSuite(e.readFile('/root/main.c') || '').total > 0, true);

  // Simulator transparency: illustrative Engine A memory must not be confused
  // with the real Engine B 1 GiB VM allocation.
  assert.ok((await e.execute('free')).includes('illustrative 256 MiB model'));
  assert.ok((await e.execute('top')).includes('illustrative 256 MiB model'));

  console.log('LinuxLab happy-path engine checks passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
