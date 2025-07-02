import { jest } from '@jest/globals';
import { logSummary } from '../src/utils/logger.js';

jest.mock('chalk', () => ({
  __esModule: true,
  default: {
    yellow: (s: any) => s,
    red: (s: any) => s,
    green: (s: any) => s,
    gray: (s: any) => s,
    cyan: (s: any) => s,
  },
}));

test('logSummary groups by file and counts outcomes', () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  logSummary({
    success: true,
    files: [
      { filePath: 'a.txt', edits: [{ type: 'replace' }, { type: 'insert-before', skipped: true }] },
      { filePath: 'b.txt', edits: [{ type: 'delete' }] },
    ],
  });
  expect(spy).toHaveBeenCalledTimes(1);
  const out = spy.mock.calls[0][0];
  expect(out).toContain('📄 a.txt');
  expect(out).toContain('✅ replace');
  expect(out).toContain('⚪ insert-before');
  expect(out).toContain('Summary: 2 files updated, 1 edits skipped, 0 errors');
  spy.mockRestore();
});
