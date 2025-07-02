import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "bun:test";
import { setupTestFile } from "./testSetup.ts";
setupTestFile(import.meta.url);
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { parseEpic } from '../src/utils/parseEpic.ts';
import * as logger from '../src/utils/logger.ts';
import { applyEpic } from '../src/commands/apply.ts';
import * as telemetry from '../src/utils/telemetry.ts';
import { isInCooldown } from '../src/utils/cooldown.ts';
import { ErrorCodes } from '../src/constants/errorCodes.ts';

vi.mock('chalk', () => ({
  __esModule: true,
  default: { red: (s: any) => s, green: (s: any) => s, cyan: (s: any) => s, yellow: (s: any) => s, blue: (s: any) => s, magenta: (s: any) => s },
}));

// Mocks
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    appendFile: vi.fn(),
  },
}));

vi.mock('../src/utils/parseEpic.ts', () => ({
  parseEpic: vi.fn(),
}));

vi.mock('../src/utils/logger.ts', () => {
  const actual = vi.requireActual('../src/utils/logger.ts');
  return {
    ...actual,
    logInfo: vi.fn(),
    logError: vi.fn(),
    logSuccessFinal: vi.fn(),
    logDryRunNotice: vi.fn(),
    logWarn: vi.fn(),
    logCooldownWarning: vi.fn(),
    setQuiet: vi.fn(),
  };
});

vi.mock('../src/utils/telemetry.ts', () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  getCooldownReason: vi.fn().mockResolvedValue(null),
  logTelemetry: vi.fn(),
}));

vi.mock('../src/utils/cooldown.ts', () => ({
  isInCooldown: vi.fn().mockResolvedValue(false),
}));

vi.mock('../src/utils/pasteLog.ts', () => ({
  writePasteLog: vi.fn(),
}));

// Setup
const readFileMock = fsPromises.readFile as vi.Mock;
const writeFileMock = fsPromises.writeFile as vi.Mock;
const parseEpicMock = parseEpic as vi.Mock;
const logErrorMock = logger.logError as vi.Mock;

beforeEach(() => {
  vi.resetAllMocks();
  (isInCooldown as vi.Mock).mockResolvedValue(false);
  readFileMock.mockReset();
  writeFileMock.mockReset();
  parseEpicMock.mockReset();
  // mock process.exit so tests don't exit
  // @ts-ignore
  process.exit = vi.fn();
});

function epicObj(edits: any[] = []) {
  return { summary: 'sum', edits };
}

function edit(file: string) {
  return { filePath: file, type: 'replace', target: ['a'], replacement: ['b'] };
}

/** Test 1 */
it('gracefully handles invalid epic', async () => {
  readFileMock.mockResolvedValue('bad');
  parseEpicMock.mockReturnValueOnce(null);

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalled();
  expect(logErrorMock.mock.calls[0][0]).toMatch(/^❌/);
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'Invalid epic',
    code: ErrorCodes.INVALID_EPIC,
  });
  expect(writeFileMock).not.toHaveBeenCalled();
  expect(process.exit).toHaveBeenCalledWith(1);
});

/** Test 2 */
it('logs error if readFile throws', async () => {
  readFileMock.mockRejectedValueOnce(new Error('read fail'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('[E002]'));
  expect(logErrorMock.mock.calls[0][0]).toMatch(/^❌/);
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'read fail',
    code: ErrorCodes.FILE_READ_FAIL,
  });
  expect(process.exit).toHaveBeenCalledWith(1);
});

/** New Test */
it('does not exit on dry-run failures', async () => {
  readFileMock.mockRejectedValueOnce(new Error('fail'));
  await expect(applyEpic('e.md', { dryRun: true })).resolves.toBeUndefined();
  expect(process.exit).not.toHaveBeenCalled();
});

/** Test 3 */
it('exits cleanly if write fails non-atomic', async () => {
  readFileMock.mockResolvedValueOnce('md'); // epic file
  readFileMock.mockResolvedValueOnce(Buffer.from('a')); // a.txt
  readFileMock.mockResolvedValueOnce(Buffer.from('b')); // b.txt
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt'), edit('b.txt')]));
  writeFileMock.mockResolvedValueOnce(null);
  writeFileMock.mockRejectedValueOnce(new Error('boom'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('[E003]'));
  expect(logErrorMock.mock.calls[0][0]).toMatch(/^❌/);
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'boom',
    code: ErrorCodes.WRITE_FAIL,
  });
});

/** Test 4 */
it('atomic rollback on write failure', async () => {
  readFileMock.mockResolvedValueOnce('md');
  readFileMock.mockResolvedValueOnce(Buffer.from('a'));
  readFileMock.mockResolvedValueOnce(Buffer.from('b'));
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt'), edit('b.txt')]));
  writeFileMock.mockResolvedValueOnce(null);
  writeFileMock.mockRejectedValueOnce(new Error('oops'));
  writeFileMock.mockResolvedValue(null); // rollback writes

  await expect(applyEpic('e.md', { atomic: true })).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('[E003]'));
  expect(logErrorMock).toHaveBeenCalledWith('❌ Rolled back changes due to failure');
  expect(logErrorMock.mock.calls[0][0]).toMatch(/^❌/);
  expect(writeFileMock).toHaveBeenCalledTimes(4);
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'oops',
    code: ErrorCodes.WRITE_FAIL,
  });
});

/** Test 5 */
it('throws friendly error on unsupported edit', async () => {
  readFileMock.mockResolvedValueOnce('md');
  readFileMock.mockResolvedValueOnce(Buffer.from('a'));
  parseEpicMock.mockReturnValueOnce(epicObj([{ filePath: 'x', type: 'weird', target: [], replacement: [] }]));

  await expect(applyEpic('e.md', {})).rejects.toThrow();
});

/** Test 6 */
it('logs stack trace only in debug', async () => {
  const err = new Error('fail');
  parseEpicMock.mockImplementationOnce(() => { throw err; });
  readFileMock.mockResolvedValueOnce('md');

  process.env.NODE_ENV = 'production';
  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();
  expect(logErrorMock).toHaveBeenCalledWith(`❌ [${ErrorCodes.INVALID_EPIC}] ${err.message}`);

  vi.resetAllMocks();
  parseEpicMock.mockImplementationOnce(() => { throw err; });
  readFileMock.mockResolvedValueOnce('md');

  process.env.NODE_ENV = 'debug';
  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();
  expect(logErrorMock).toHaveBeenCalledWith(`❌ [${ErrorCodes.INVALID_EPIC}] ${err.stack}`);
});

/** Test 7 */
it('fallback logging if logger fails', async () => {
  readFileMock.mockResolvedValue('md');
  parseEpicMock.mockImplementation(() => { throw new Error('bad'); });
  (logger.logError as vi.Mock).mockImplementationOnce(() => { throw new Error('logger'); });
  const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(consoleSpy).toHaveBeenCalled();
  consoleSpy.mockRestore();
});

/** Test 8 */
it('suggests dry-run on failure', async () => {
  readFileMock.mockRejectedValueOnce(new Error('fail'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('Try running with --dry-run to debug'));
});

/** Test 9 */
it('summary mode outputs json only', async () => {
  readFileMock.mockResolvedValueOnce('md');
  parseEpicMock.mockReturnValueOnce(epicObj([]));
  const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await expect(applyEpic('e.md', { summary: true })).resolves.toBeUndefined();
  const output = consoleSpy.mock.calls[0][0];
  expect(output).toContain('✅ 0 applied');
  expect(logger.logSuccessFinal).not.toHaveBeenCalled();
  expect(logger.logInfo).not.toHaveBeenCalled();
  consoleSpy.mockRestore();
});

/** Test 10 */
it('silent mode suppresses logs but shows errors', async () => {
  readFileMock.mockRejectedValueOnce(new Error('oops'));
  await expect(applyEpic('e.md', { silent: true })).resolves.toBeUndefined();
  expect(logger.logError).toHaveBeenCalled();
  expect(logger.logSuccessFinal).not.toHaveBeenCalled();
  expect(logger.logInfo).not.toHaveBeenCalled();
});

/** Test 11 */
it('json mode outputs structured data on success', async () => {
  readFileMock.mockResolvedValueOnce('md');
  readFileMock.mockResolvedValueOnce(Buffer.from('a'));
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt')]));
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await applyEpic('e.md', { json: true });
  const obj = JSON.parse(spy.mock.calls[0][0]);
  expect(obj.command).toBe('applyEpic');
  expect(obj.success).toBe(true);
  expect(obj.edits[0].status).toBe('applied');
  spy.mockRestore();
});

/** Test 12 */
it('json mode outputs errors on failure', async () => {
  readFileMock.mockRejectedValueOnce(new Error('fail'));
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await applyEpic('e.md', { json: true });
  const obj = JSON.parse(spy.mock.calls[0][0]);
  expect(obj.success).toBe(false);
  expect(obj.errors[0].message).toBe('fail');
  spy.mockRestore();
});

/** Test 13 */
it('json mode indicates cooldown', async () => {
  (isInCooldown as vi.Mock).mockResolvedValueOnce(true);
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await applyEpic('e.md', { json: true });
  const obj = JSON.parse(spy.mock.calls[0][0]);
  expect(obj.cooldown).toBe(true);
  spy.mockRestore();
});

/** New Test */
it('shows cooldown warning message', async () => {
  (isInCooldown as vi.Mock).mockResolvedValueOnce(true);
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  (logger.logCooldownWarning as vi.Mock).mockImplementation(() => {
    console.log('🧊 Cooldown Active\nYou\u2019ve hit a safety cooldown. Wait a few seconds and try again.');
  });
  await applyEpic('e.md', {});
  expect(spy).toHaveBeenCalledWith(
    '🧊 Cooldown Active\nYou\u2019ve hit a safety cooldown. Wait a few seconds and try again.'
  );
  spy.mockRestore();
});

/** Test 14 */
it('json mode marks skipped edits in dry-run', async () => {
  readFileMock.mockResolvedValueOnce('md');
  readFileMock.mockResolvedValueOnce(Buffer.from('a'));
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt')]));
  const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await applyEpic('e.md', { json: true, dryRun: true });
  const obj = JSON.parse(spy.mock.calls[0][0]);
  expect(obj.edits[0].status).toBe('skipped');
  spy.mockRestore();
});
