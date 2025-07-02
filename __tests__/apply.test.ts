import { jest } from '@jest/globals';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import { parseEpic } from '../src/utils/parseEpic.js';
import * as logger from '../src/utils/logger.js';
import { applyEpic } from '../src/commands/apply.js';
import * as telemetry from '../src/utils/telemetry.js';
import { isInCooldown } from '../src/utils/cooldown.js';

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

jest.mock('../src/utils/logger.js', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logSuccessFinal: jest.fn(),
  logDryRunNotice: jest.fn(),
  logWarn: jest.fn(),
  logCooldownWarning: jest.fn(),
}));

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
  expect(telemetry.recordFailure).toHaveBeenCalled();
  expect(writeFileMock).not.toHaveBeenCalled();
});

/** Test 2 */
test('logs error if readFile throws', async () => {
  readFileMock.mockRejectedValueOnce(new Error('read fail'));

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('read fail'));
  expect(telemetry.recordFailure).toHaveBeenCalled();
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

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('boom'));
  expect(telemetry.recordFailure).toHaveBeenCalled();
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

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('oops'));
  expect(logErrorMock).toHaveBeenCalledWith('Rolled back changes due to failure');
  expect(writeFileMock).toHaveBeenCalledTimes(4);
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
  expect(logErrorMock).toHaveBeenCalledWith(err.message);

  jest.resetAllMocks();
  parseEpicMock.mockImplementationOnce(() => { throw err; });
  readFileMock.mockResolvedValueOnce('md');

  process.env.NODE_ENV = 'debug';
  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();
  expect(logErrorMock).toHaveBeenCalledWith(err.stack);
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
