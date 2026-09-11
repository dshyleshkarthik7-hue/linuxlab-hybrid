import assert from 'node:assert/strict';
import { ShellParser } from '../src/engine/ShellParser.ts';

const parser = new ShellParser();
const render = (node: any): any => node.type === 'command'
  ? node.text
  : [node.operator, render(node.left), render(node.right)];

assert.deepEqual(render(parser.parse('echo a && echo b')), ['&&', 'echo a', 'echo b']);
assert.deepEqual(render(parser.parse('echo a || echo b')), ['||', 'echo a', 'echo b']);
assert.deepEqual(render(parser.parse('printf x | grep x')), ['|', 'printf x', 'grep x']);
assert.deepEqual(render(parser.parse('echo a; echo b')), [';', 'echo a', 'echo b']);
assert.equal(render(parser.parse('echo "a && b | c"')), 'echo "a && b | c"');
assert.equal(render(parser.parse("echo 'a || b'")), "echo 'a || b'");
assert.equal(render(parser.parse('echo a\\|b')), 'echo a\\|b');
assert.throws(() => parser.parse('echo "unterminated'), /Unterminated quote/);
assert.throws(() => parser.parse('&& echo bad'), /Expected command/);

console.log('shell parser tests passed');
