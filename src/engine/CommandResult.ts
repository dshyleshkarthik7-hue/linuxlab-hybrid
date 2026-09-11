export interface CommandResult {
  command?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut?: boolean;
  truncated?: boolean;
}
