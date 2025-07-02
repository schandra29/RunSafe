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

test('logSummary lists groups and footer counts', () => {
  const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
  logSummary({
    success: true,
    files: [
      { filePath: 'a.txt', edits: [{ type: 'replace' }] },
      { filePath: 'b.txt', edits: [{ type: 'delete', skipped: true }] },
    ],
    error: 'oops',
  });
  expect(spy).toHaveBeenCalledTimes(1);
  const out = spy.mock.calls[0][0];
  expect(out).toContain('📝 Modified Files');
  expect(out).toContain('- a.txt');
  expect(out).toContain('⚠️ Skipped Edits');
  expect(out).toContain('- b.txt');
  expect(out).toContain('❌ Errors');
  expect(out).toContain('oops');
  expect(out).toContain('✅ 1 applied');
  expect(out).toContain('⚠️ 1 skipped');
  expect(out).toContain('❌ 1 error');
  spy.mockRestore();
});
