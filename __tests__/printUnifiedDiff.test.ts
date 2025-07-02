import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "bun:test";
import { setupTestFile } from "./testSetup.ts";
setupTestFile(import.meta.url);
let printUnifiedDiff: (before: string, after: string, filePath: string) => void;

beforeAll(async () => {
  ({ printUnifiedDiff } = await import('../src/utils/printUnifiedDiff.ts'));
});

let logSpy: vi.SpyInstance;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
});

it('outputs a valid unified diff when strings differ', () => {
  printUnifiedDiff('a\nline2', 'a\nline3', 'file.txt');
  expect(logSpy).toHaveBeenCalledTimes(1);
  expect(logSpy.mock.calls[0][0]).toMatchSnapshot();
});

it('handles removal-only diffs', () => {
  printUnifiedDiff('a\nb\nc', 'a\nc', 'file.txt');
  expect(logSpy.mock.calls[0][0]).toMatchSnapshot();
});

it('handles addition-only diffs', () => {
  printUnifiedDiff('a\nc', 'a\nb\nc', 'file.txt');
  expect(logSpy.mock.calls[0][0]).toMatchSnapshot();
});

it('handles changes and reorderings', () => {
  printUnifiedDiff('a\nb\nc', 'c\na\nb', 'file.txt');
  expect(logSpy.mock.calls[0][0]).toMatchSnapshot();
});

it('does not output anything when content is unchanged', () => {
  printUnifiedDiff('same', 'same', 'file.txt');
  expect(logSpy).not.toHaveBeenCalled();
});

it('uses correct file path in diff header', () => {
  printUnifiedDiff('1', '2', 'my/path.txt');
  const output = logSpy.mock.calls[0][0] as string;
  expect(output.startsWith('- before/my/path.txt')).toBe(true);
});

it('handles large diff gracefully', () => {
  const before = Array.from({ length: 120 }, (_, i) => `line${i}`).join('\n');
  const after = before + '\nextra';
  printUnifiedDiff(before, after, 'big.txt');
  const output = logSpy.mock.calls[0][0] as string;
  expect(output.includes('...diff truncated...')).toBe(true);
});
