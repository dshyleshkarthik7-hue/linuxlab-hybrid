export type VerificationState = 'passed' | 'failed' | 'unable-to-verify';

export type AssessmentAssertion = {
  exitCode?: number;
  stdoutContains?: string;
  stderrContains?: string;
  fileExists?: string;
  fileContains?: { path: string; text: string };
};

export type AssessmentCheck = {
  label: string;
  state: VerificationState;
  feedback: string;
  evidence?: AssessmentAssertion;
};

export type AssessmentResult = {
  checks: AssessmentCheck[];
  passed: number;
  failed: number;
  unableToVerify: number;
  total: number;
  score: number | null;
};

export function summarizeAssessment(checks: AssessmentCheck[]): AssessmentResult {
  const passed = checks.filter(c => c.state === 'passed').length;
  const failed = checks.filter(c => c.state === 'failed').length;
  const unableToVerify = checks.filter(c => c.state === 'unable-to-verify').length;
  const total = checks.length;
  return {
    checks,
    passed,
    failed,
    unableToVerify,
    total,
    score: total && unableToVerify === 0 ? Math.round((passed / total) * 100) : null,
  };
}
