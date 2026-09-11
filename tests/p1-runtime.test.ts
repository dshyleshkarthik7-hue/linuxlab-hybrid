import { strict as assert } from 'node:assert';
import { EXECUTABLE_COMMANDS, ExecutableCommandCatalog, LEARNING_PATHS, LinuxTutorContext, AlpineIntegration, MobileTerminalController, P1Runtime } from '../src/product/P1Runtime.ts';
import { LinuxObservatory } from '../src/observability/LinuxObservatory.ts';

assert.deepEqual(LEARNING_PATHS.map(x => x.id), ['beginner', 'intermediate', 'expert']);
const catalog = new ExecutableCommandCatalog();
for (const command of catalog.forLevel('beginner')) assert.ok(EXECUTABLE_COMMANDS.has(command.name));
assert.equal(catalog.isExecutable('pwd'), true);
assert.equal(catalog.isExecutable('nonexistent'), false);

const observatory = new LinuxObservatory('SIMULATED');
const tutor = new LinuxTutorContext(observatory);
const context = tutor.build('beginner', 'pwd', { command: 'pwd', stdout: '/root', stderr: '', exitCode: 0, durationMs: 1 }, '/root');
assert.equal(context.telemetry.source, 'SIMULATED');
assert.match(tutor.prompt(context), /Exit code: 0/);

const alpine = new AlpineIntegration();
assert.equal(alpine.metadata().version, 'v1.0.0');
assert.equal(alpine.isIntegrityVerified(), false);

const mobile = new MobileTerminalController();
assert.equal(mobile.setKeyboardVisible(true).keyboardVisible, true);
assert.equal(mobile.updateViewport(640, 24).safeBottomInset, 24);
assert.equal(mobile.adjustFontScale(-.5).fontScale, .85);

const runtime = new P1Runtime();
assert.equal(runtime.getLevel(), 'beginner');
const executed = await runtime.execute('echo hello');
assert.equal(executed.result.exitCode, 0);
assert.equal(executed.result.stdout, 'hello');
assert.equal(executed.tutorContext.level, 'beginner');
console.log('P1 product runtime checks passed');
