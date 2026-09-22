import './linux-engine.test.ts';
import './command-catalog.test.ts';
import './command-result.test.ts';
import './vnext-correctness.test.ts';
import './adversarial-resource.test.ts';
import './session-manager-concurrency.test.ts';
import './catalog-executable.test.ts';
import './observatory-tutor.test.ts';
import './iso-integrity.test.ts';
import './p1-runtime.test.ts';
import './vm-resource-policy.test.ts';
import './guest-telemetry.test.ts';
import './assessment-runner-coverage.test.ts';
import { summarizeAssessment } from '../src/engine/AssessmentTypes.ts';

import './security-static.test.mjs';
import './content-contract.test.mjs';
import './p2-p3-contract.test.mjs';

const assessmentSummary = summarizeAssessment([
  { label: 'passed', state: 'passed', feedback: 'ok' },
  { label: 'failed', state: 'failed', feedback: 'nope' },
]);
if (assessmentSummary.score !== 50 || assessmentSummary.total !== 2) throw new Error('Assessment summary coverage check failed');
