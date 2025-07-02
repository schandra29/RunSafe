import { diffLinesUnified } from 'jest-diff';

const MAX_LINES = 50;

export function printUnifiedDiff(before: string, after: string, filePath: string): void {
  if (before === after) return;

  const diff = diffLinesUnified(
    before.split(/\r?\n/),
    after.split(/\r?\n/),
    {
      aAnnotation: `before/${filePath}`,
      bAnnotation: `after/${filePath}`,
    }
  );

  if (!diff) return;
  const lines = diff.split('\n');
  let output = diff;
  if (lines.length > MAX_LINES) {
    output = lines.slice(0, MAX_LINES).join('\n') + '\n...diff truncated...';
  }
  console.log(output);
}
