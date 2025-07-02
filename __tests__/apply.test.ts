import { jest } from '@jest/globals';
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
