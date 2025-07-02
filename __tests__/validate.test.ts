import { jest } from '@jest/globals';
import { validateEpic } from '../src/commands/validate';
import { promises as fs } from 'fs';
import { isInCooldown } from '../src/utils/cooldown';
import { logInfo, logError, logSuccessFinal, logCooldownWarning } from '../src/utils/logger';
import { multiAgentReview, CouncilVerdict } from '../src/utils/multiAgentReview';
import { validateSchema } from '../src/utils/validateSchema';
import { recordSuccess, recordFailure, getCooldownReason } from '../src/utils/telemetry';

jest.mock('chalk', () => ({__esModule: true, default: {red:(s:any)=>s, green:(s:any)=>s, cyan:(s:any)=>s, yellow:(s:any)=>s, blue:(s:any)=>s, magenta:(s:any)=>s}}));

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), appendFile: jest.fn(), mkdir: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logSuccessFinal: jest.fn(),
  logCooldownWarning: jest.fn(),
}));
jest.mock('../src/utils/cooldown', () => ({ isInCooldown: jest.fn() }));
jest.mock('../src/utils/multiAgentReview', () => ({
  multiAgentReview: jest.fn(),
  CouncilVerdict: { APPROVED: 'APPROVED', REJECTED: 'REJECTED' },
}));
jest.mock('../src/utils/validateSchema', () => ({ validateSchema: jest.fn() }));
jest.mock('../src/utils/telemetry', () => ({
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  getCooldownReason: jest.fn(),
  logTelemetry: jest.fn(),
}));

const readFileMock = fs.readFile as any;

beforeEach(() => {
  jest.resetAllMocks();
  ((isInCooldown as any)).mockResolvedValue(false);
  ((getCooldownReason as any)).mockResolvedValue('Test');
  ((validateSchema as any)).mockReturnValue({ valid: true });
  readFileMock.mockResolvedValue('{}');
});

describe('validateEpic', () => {
  const validEpic = { summary: 'Hello', edits: [] };

  it('Valid epic passes validation and logs success', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify(validEpic));
    await validateEpic('epic.json', {});
    expect(logSuccessFinal).toHaveBeenCalled();
    expect(recordSuccess).toHaveBeenCalled();
  });

  it('Invalid epic structure logs schema failure and exits with non-zero', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify({}));
    ((validateSchema as any)).mockReturnValueOnce({ valid: false, errors: ['bad'] });
    process.exitCode = 0;
    await validateEpic('epic.json', {});
    expect(logError).toHaveBeenCalledWith('Epic schema validation failed');
    expect(recordFailure).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it('Cooldown active: should abort and print cooldown warning', async () => {
    ((isInCooldown as any)).mockResolvedValueOnce(true);
    await validateEpic('epic.json', {});
    expect(logCooldownWarning).toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('Reason: Test');
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it('With --council: should call multiAgentReview() and log council decision', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify(validEpic));
    ((multiAgentReview as any)).mockResolvedValue(CouncilVerdict.APPROVED);
    await validateEpic('epic.json', { council: true });
    expect(multiAgentReview).toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith('Council approved this epic.');
  });

  it('If multiAgentReview() returns REJECTED: show rejection message', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify(validEpic));
    ((multiAgentReview as any)).mockResolvedValue(CouncilVerdict.REJECTED);
    process.exitCode = 0;
    await validateEpic('epic.json', { council: true });
    expect(logError).toHaveBeenCalledWith('Council rejected this epic.');
    expect(process.exitCode).toBe(1);
  });

  it('If multiAgentReview() returns APPROVED: log approval and proceed', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify(validEpic));
    ((multiAgentReview as any)).mockResolvedValue(CouncilVerdict.APPROVED);
    await validateEpic('epic.json', { council: true });
    expect(logInfo).toHaveBeenCalledWith('Council approved this epic.');
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it('Gracefully handles missing file or invalid JSON', async () => {
    readFileMock.mockRejectedValueOnce(new Error('nope'));
    await validateEpic('missing.json', {});
    expect(logError).toHaveBeenCalledWith('Epic file not found');

    jest.resetAllMocks();
    ((isInCooldown as any)).mockResolvedValue(false);
    readFileMock.mockResolvedValueOnce('not json');
    await validateEpic('bad.json', {});
    expect(logError).toHaveBeenCalledWith('Invalid JSON format');
  });
});
