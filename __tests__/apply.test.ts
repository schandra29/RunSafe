import { jest } from '@jest/globals';
codex/add-jest-tests-for-applyepic-error-handling

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
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

jest.mock('../src/utils/pasteLog.js', () => ({
  writePasteLog: jest.fn(),
}));

jest.mock('../src/utils/cooldown.js', () => ({
  isInCooldown: jest.fn().mockResolvedValue(false),
}));

jest.mock('../src/utils/telemetry.js', () => ({
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  getCooldownReason: jest.fn().mockResolvedValue(null),
}));

import { promises as fs } from 'fs';
import { parseEpic } from '../src/utils/parseEpic.js';
import * as logger from '../src/utils/logger.js';
import { applyEpic } from '../src/commands/apply.js';
import * as telemetry from '../src/utils/telemetry.js';
import { isInCooldown } from '../src/utils/cooldown.js';

const readFileMock = fs.readFile as jest.Mock;
const writeFileMock = fs.writeFile as jest.Mock;
const parseEpicMock = parseEpic as jest.Mock;
const logErrorMock = logger.logError as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  (isInCooldown as jest.Mock).mockResolvedValue(false);
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
  readFileMock.mockResolvedValueOnce(Buffer.from('a')); // a.txt
  readFileMock.mockResolvedValueOnce(Buffer.from('b')); // b.txt
  parseEpicMock.mockReturnValueOnce(epicObj([edit('a.txt'), edit('b.txt')]));
  writeFileMock.mockResolvedValueOnce(null); // a.txt apply
  writeFileMock.mockRejectedValueOnce(new Error('oops')); // b.txt apply
  writeFileMock.mockResolvedValue(null); // rollbacks

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
  readFileMock.mockRejectedValueOnce(new Error('fail')); // reading epic

  await expect(applyEpic('e.md', {})).resolves.toBeUndefined();

  expect(logErrorMock).toHaveBeenCalledWith(expect.stringContaining('Try running with --dry-run to debug'));
});

=======
import { applyEpic } from '../src/commands/apply';
import { promises as fs } from 'fs';
import { parseEpic } from '../src/utils/parseEpic';
import { logInfo, logSuccessFinal, logDryRunNotice, logError, logWarn, logCooldownWarning } from '../src/utils/logger';
import { isInCooldown } from '../src/utils/cooldown';
import { recordSuccess, recordFailure, getCooldownReason } from '../src/utils/telemetry';
jest.mock('chalk', () => ({__esModule: true, default: {red:(s:any)=>s, green:(s:any)=>s, cyan:(s:any)=>s, yellow:(s:any)=>s, blue:(s:any)=>s, magenta:(s:any)=>s}}));

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn(), mkdir: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logInfo: jest.fn(),
  logSuccessFinal: jest.fn(),
  logDryRunNotice: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
  logCooldownWarning: jest.fn(),
}));
jest.mock('../src/utils/cooldown', () => ({ isInCooldown: jest.fn() }));
jest.mock('../src/utils/parseEpic', () => ({ parseEpic: jest.fn() }));
jest.mock('../src/utils/pasteLog', () => ({ writePasteLog: jest.fn() }));
jest.mock('../src/utils/telemetry', () => ({
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  getCooldownReason: jest.fn(),
}));

const readFileMock = fs.readFile as any;
const writeFileMock = fs.writeFile as any;

const epicContent = `# Epic: Add banner
\n## Summary
This patch adds a header to main.ts
\n## Changes
---
filePath: src/main.ts
pattern: .*
replacement: "// Hello World"`;

const epic = {
  summary: 'Add banner',
  edits: [
    {
      filePath: 'src/main.ts',
      type: 'replace',
      target: ['old'],
      replacement: ['new'],
    },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  ((isInCooldown as any)).mockResolvedValue(false);
  ((parseEpic as any)).mockReturnValue(epic);
  readFileMock.mockResolvedValue('console.log("old");');
  writeFileMock.mockResolvedValue(undefined);
  ((getCooldownReason as any)).mockResolvedValue('Test');
});

describe('applyEpic', () => {
  it('dryRun flag applies no changes, logs dry-run message', async () => {
    readFileMock.mockResolvedValueOnce(epicContent); // epic file
    await applyEpic('epic.md', { dryRun: true });
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(logDryRunNotice).toHaveBeenCalled();
    expect(logSuccessFinal).not.toHaveBeenCalled();
  });

  it('atomic flag with all successful writes should apply changes and log success', async () => {
    readFileMock.mockResolvedValueOnce(epicContent); // epic file
    await applyEpic('epic.md', { atomic: true });
    expect(writeFileMock).toHaveBeenCalledTimes(1);
    const call = writeFileMock.mock.calls[0];
    expect(call[0]).toContain('src/main.ts');
    expect(logSuccessFinal).toHaveBeenCalledWith('Your changes were safely planted.');
    expect(recordSuccess).toHaveBeenCalled();
  });

  it('atomic flag with mid-write failure should rollback or avoid partial writes', async () => {
    const epicMulti = {
      summary: 'Multiple',
      edits: [
        { filePath: 'a.ts', type: 'replace', target: ['old'], replacement: ['new'] },
        { filePath: 'b.ts', type: 'replace', target: ['old'], replacement: ['new'] },
      ],
    };
    ((parseEpic as any)).mockReturnValueOnce(epicMulti);
    readFileMock.mockResolvedValueOnce(epicContent); // epic file
    readFileMock.mockResolvedValueOnce('old');
    readFileMock.mockResolvedValueOnce('old');
    writeFileMock.mockResolvedValueOnce(undefined); // first write
    writeFileMock.mockRejectedValueOnce(new Error('boom')); // second write fails
    await applyEpic('epic.md', { atomic: true });
    expect(writeFileMock.mock.calls.length).toBe(4); // two writes + rollback
    expect(writeFileMock.mock.calls[2][0]).toContain('a.ts');
    expect(logError).toHaveBeenCalledWith('Rolled back changes due to failure');
    expect(recordFailure).toHaveBeenCalled();
  });

  it('When cooldown is active, function should abort and log cooldown warning', async () => {
    ((isInCooldown as any)).mockResolvedValueOnce(true);
    await applyEpic('epic.md', {});
    expect(logCooldownWarning).toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith('Reason: Test');
    expect(parseEpic).not.toHaveBeenCalled();
  });

  it('If diff is true, should print a unified diff', async () => {
    readFileMock.mockResolvedValueOnce(epicContent); // epic file
    await applyEpic('epic.md', { diff: true });
    expect((logInfo as any).mock.calls.some((c: any) => /Diff for/.test(c[0]))).toBe(true);
  });

  it('Correctly calls parseEpic() and handles valid edits', async () => {
    readFileMock.mockResolvedValueOnce(epicContent); // epic file
    await applyEpic('epic.md', { atomic: false });
    expect(parseEpic).toHaveBeenCalledWith(epicContent);
    expect(writeFileMock).toHaveBeenCalled();
    expect(recordSuccess).toHaveBeenCalled();
  });

  it('Gracefully handles an empty or invalid epic file', async () => {
    ((parseEpic as any)).mockReturnValueOnce({ summary: '', edits: [] });
    readFileMock.mockResolvedValueOnce('');
    await applyEpic('empty.md', {});
    expect(writeFileMock).not.toHaveBeenCalled();
    expect(logSuccessFinal).toHaveBeenCalled();
  });
});

