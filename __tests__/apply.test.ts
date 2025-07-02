import { jest } from '@jest/globals';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { parseEpic } from '../src/utils/parseEpic.js';
import * as logger from '../src/utils/logger.js';
import { applyEpic } from '../src/commands/apply.js';
import * as telemetry from '../src/utils/telemetry.js';
import { isInCooldown } from '../src/utils/cooldown.js';
import { ErrorCodes } from '../src/constants/errorCodes.js';

jest.mock('chalk', () => ({
  __esModule: true,
  default: { red: (s: any) => s, green: (s: any) => s, cyan: (s: any) => s, yellow: (s: any) => s, blue: (s: any) => s, magenta: (s: any) => s },
}));

// Mocks
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    appendFile: jest.fn(),
  },
}));

jest.mock('../src/utils/parseEpic.js', () => ({
  parseEpic: jest.fn(),
}));

jest.mock('../src/utils/logger.js', () => {
  const actual = jest.requireActual('../src/utils/logger.js');
  return {
    ...actual,
    logInfo: jest.fn(),
    logError: jest.fn(),
    logSuccessFinal: jest.fn(),
    logDryRunNotice: jest.fn(),
    logWarn: jest.fn(),
    logCooldownWarning: jest.fn(),
    setQuiet: jest.fn(),
  };
});

jest.mock('../src/utils/telemetry.js', () => ({
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  getCooldownReason: jest.fn().mockResolvedValue(null),
  logTelemetry: jest.fn(),
}));

jest.mock('../src/utils/cooldown.js', () => ({
  isInCooldown: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/utils/pasteLog.js', () => ({
  writePasteLog: jest.fn(),
}));

// Setup
const readFileMock = fsPromises.readFile as jest.Mock;
const writeFileMock = fsPromises.writeFile as jest.Mock;
const parseEpicMock = parseEpic as jest.Mock;
const logErrorMock = logger.logError as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  (isInCooldown as jest.Mock).mockResolvedValue(false);
  readFileMock.mockReset();
  writeFileMock.mockReset();
  parseEpicMock.mockReset();
});

function epicObj(edits: any[] = []) {
  return { summary: 'sum', edits };
}

function edit(file: string) {
  return { filePath: file, type: 'replace', target: ['a'], replacement: ['b'] };
}

/** Test 1 */
test('gracefully handles invalid epic', async () => {
  readFileMock.mockResolvedValue('bad');
  parseEpicMock.mockReturnValueOnce(null);

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalled();
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'Invalid epic',
    code: ErrorCodes.INVALID_EPIC,
  });
  expect(writeFileMock).not.toHaveBeenCalled();
});

/** Test 2 */
test('logs error if readFile throws', async () => {
  readFileMock.mockRejectedValueOnce(new Error('read fail'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('[E002]'));
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'read fail',
    code: ErrorCodes.FILE_READ_FAIL,
  });
});

/** Test 3 */
test('exits cleanly if write fails non-atomic', async () => {
  readFileMock.mockResolvedValueOnce('md'); // epic file
  readFileMock.mockResolvedValueOnce(Buffer.from('a')); // a.txt
  readFileMock.mockResolvedValueOnce(Buffer.from('b')); // b.txt
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt'), edit('b.txt')]));
  writeFileMock.mockResolvedValueOnce(null);
  writeFileMock.mockRejectedValueOnce(new Error('boom'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('[E003]'));
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'boom',
    code: ErrorCodes.WRITE_FAIL,
  });
});

/** Test 4 */
test('atomic rollback on write failure', async () => {
  readFileMock.mockResolvedValueOnce('md');
  readFileMock.mockResolvedValueOnce(Buffer.from('a'));
  readFileMock.mockResolvedValueOnce(Buffer.from('b'));
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt'), edit('b.txt')]));
  writeFileMock.mockResolvedValueOnce(null);
  writeFileMock.mockRejectedValueOnce(new Error('oops'));
  writeFileMock.mockResolvedValue(null); // rollback writes

  await expect(applyEpic('e.md', { atomic: true })).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('[E003]'));
  expect(logErrorMock).toHaveBeenCalledWith('Rolled back changes due to failure');
  expect(writeFileMock).toHaveBeenCalledTimes(4);
  expect(telemetry.recordFailure).toHaveBeenCalledWith({
    message: 'oops',
    code: ErrorCodes.WRITE_FAIL,
  });
});

/** Test 5 */
test('throws friendly error on unsupported edit', async () => {
  readFileMock.mockResolvedValueOnce('md');
  readFileMock.mockResolvedValueOnce(Buffer.from('a'));
  parseEpicMock.mockReturnValueOnce(epicObj([{ filePath: 'x', type: 'weird', target: [], replacement: [] }]));

  await expect(applyEpic('e.md', {})).rejects.toThrow();
});

/** Test 6 */
test('logs stack trace only in debug', async () => {
  const err = new Error('fail');
  parseEpicMock.mockImplementationOnce(() => { throw err; });
  readFileMock.mockResolvedValueOnce('md');

  process.env.NODE_ENV = 'production';
  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();
  expect(logErrorMock).toHaveBeenCalledWith(`[${ErrorCodes.INVALID_EPIC}] ${err.message}`);

  jest.resetAllMocks();
  parseEpicMock.mockImplementationOnce(() => { throw err; });
  readFileMock.mockResolvedValueOnce('md');

  process.env.NODE_ENV = 'debug';
  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();
  expect(logErrorMock).toHaveBeenCalledWith(`[${ErrorCodes.INVALID_EPIC}] ${err.stack}`);
});

/** Test 7 */
test('fallback logging if logger fails', async () => {
  readFileMock.mockResolvedValue('md');
  parseEpicMock.mockImplementation(() => { throw new Error('bad'); });
  (logger.logError as jest.Mock).mockImplementationOnce(() => { throw new Error('logger'); });
  const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(consoleSpy).toHaveBeenCalled();
  consoleSpy.mockRestore();
});

/** Test 8 */
test('suggests dry-run on failure', async () => {
  readFileMock.mockRejectedValueOnce(new Error('fail'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('Try running with --dry-run to debug'));
});

/** Test 9 */
test('summary mode outputs json only', async () => {
  readFileMock.mockResolvedValueOnce('md');
  parseEpicMock.mockReturnValueOnce(epicObj([]));
  const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  await expect(applyEpic('e.md', { summary: true })).resolves.toBeUndefined();
  const output = consoleSpy.mock.calls[0][0];
  expect(output).toContain('Summary:');
  expect(logger.logSuccessFinal).not.toHaveBeenCalled();
  expect(logger.logInfo).not.toHaveBeenCalled();
  consoleSpy.mockRestore();
});

/** Test 10 */
test('silent mode suppresses logs but shows errors', async () => {
  readFileMock.mockRejectedValueOnce(new Error('oops'));
  await expect(applyEpic('e.md', { silent: true })).resolves.toBeUndefined();
  expect(logger.logError).toHaveBeenCalled();
  expect(logger.logSuccessFinal).not.toHaveBeenCalled();
  expect(logger.logInfo).not.toHaveBeenCalled();
});
