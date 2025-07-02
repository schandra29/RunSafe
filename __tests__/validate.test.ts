import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "bun:test";
import { validateEpic } from '../src/commands/validate';
import { promises as fs } from 'fs';
import { isInCooldown } from '../src/utils/cooldown';
import { logInfo, logError, logSuccessFinal, logCooldownWarning } from '../src/utils/logger';
import { multiAgentReview, CouncilVerdict } from '../src/utils/multiAgentReview';
import { validateSchema } from '../src/utils/validateSchema';
import { recordSuccess, recordFailure, getCooldownReason } from '../src/utils/telemetry';
import { ErrorCodes } from '../src/constants/errorCodes.ts';

vi.mock('chalk', () => ({__esModule: true, default: {red:(s:any)=>s, green:(s:any)=>s, cyan:(s:any)=>s, yellow:(s:any)=>s, blue:(s:any)=>s, magenta:(s:any)=>s}}));

vi.mock('fs', () => ({ promises: { readFile: vi.fn(), appendFile: vi.fn(), mkdir: vi.fn() } }));
vi.mock('../src/utils/logger', () => {
  const actual = vi.requireActual('../src/utils/logger.ts');
  return {
    ...actual,
    logInfo: vi.fn(),
    logError: vi.fn(),
    logSuccessFinal: vi.fn(),
    logCooldownWarning: vi.fn(),
    setQuiet: vi.fn(),
  };
});
vi.mock('../src/utils/cooldown', () => ({ isInCooldown: vi.fn() }));
vi.mock('../src/utils/multiAgentReview', () => ({
  multiAgentReview: vi.fn(),
  CouncilVerdict: { APPROVED: 'APPROVED', REJECTED: 'REJECTED' },
}));
vi.mock('../src/utils/validateSchema', () => ({ validateSchema: vi.fn() }));
vi.mock('../src/utils/telemetry', () => ({
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  getCooldownReason: vi.fn(),
  logTelemetry: vi.fn(),
}));

const readFileMock = fs.readFile as any;

beforeEach(() => {
  vi.resetAllMocks();
  ((isInCooldown as any)).mockResolvedValue(false);
  ((getCooldownReason as any)).mockResolvedValue('Test');
  ((validateSchema as any)).mockReturnValue({ valid: true });
  readFileMock.mockResolvedValue('{}');
  // mock process.exit so tests don't exit
  // @ts-ignore
  process.exit = vi.fn();
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
    await validateEpic('epic.json', {});
    expect(logError).toHaveBeenCalledWith(`❌ [${ErrorCodes.INVALID_EPIC}] Epic schema validation failed`);
    expect(logError).toHaveBeenCalledWith('💡 Tip: Check the epic structure against the required schema.');
    expect(recordFailure).toHaveBeenCalledWith({
      message: 'Epic schema validation failed',
      code: ErrorCodes.INVALID_EPIC,
    });
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('Cooldown active: should abort and print cooldown warning', async () => {
    ((isInCooldown as any)).mockResolvedValueOnce(true);
    const real = vi.requireActual('../src/utils/logger.ts');
    (logCooldownWarning as vi.Mock).mockImplementation(real.logCooldownWarning);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateEpic('epic.json', {});
    expect(spy.mock.calls[0][0]).toContain('🧊 Cooldown Active');
    expect(spy.mock.calls[0][0]).toContain('safety cooldown');
    expect(logInfo).toHaveBeenCalledWith('Reason: Test');
    expect(readFileMock).not.toHaveBeenCalled();
    spy.mockRestore();
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
    expect(logError).toHaveBeenCalledWith(`❌ [${ErrorCodes.VALIDATION_REJECTED}] Council rejected this epic.`);
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
    expect(logError).toHaveBeenCalledWith(`❌ [${ErrorCodes.FILE_READ_FAIL}] Epic file not found`);
    expect(logError).toHaveBeenCalledWith('💡 Tip: Check the file path and ensure the epic file exists.');
    expect(process.exit).toHaveBeenCalledWith(1);

    vi.resetAllMocks();
    ((isInCooldown as any)).mockResolvedValue(false);
    readFileMock.mockResolvedValueOnce('not json');
    await validateEpic('bad.json', {});
    expect(logError).toHaveBeenCalledWith(`❌ [${ErrorCodes.INVALID_EPIC}] Invalid JSON format`);
    expect(logError).toHaveBeenCalledWith('💡 Tip: Check the JSON syntax and ensure the file is properly formatted.');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('Summary mode outputs json only', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify(validEpic));
  const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  await validateEpic('epic.json', { summary: true });
  const output = logSpy.mock.calls[0][0];
  expect(output).toContain('✅ 0 applied');
  expect(logSuccessFinal).not.toHaveBeenCalled();
  expect(logInfo).not.toHaveBeenCalled();
  logSpy.mockRestore();
});

  it('Silent mode suppresses logs but shows errors', async () => {
    readFileMock.mockRejectedValueOnce(new Error('nope'));
    await validateEpic('missing.json', { silent: true });
    expect(logError).toHaveBeenCalledWith(`❌ [${ErrorCodes.FILE_READ_FAIL}] Epic file not found`);
    expect(logSuccessFinal).not.toHaveBeenCalled();
    expect(logInfo).not.toHaveBeenCalled();
  });

  it('JSON mode outputs structured success', async () => {
    readFileMock.mockResolvedValueOnce(JSON.stringify(validEpic));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateEpic('epic.json', { json: true });
    const obj = JSON.parse(spy.mock.calls[0][0]);
    expect(obj.command).toBe('validateEpic');
    expect(obj.success).toBe(true);
    spy.mockRestore();
  });

  it('JSON mode shows errors', async () => {
    readFileMock.mockRejectedValueOnce(new Error('nope'));
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateEpic('missing.json', { json: true });
    const obj = JSON.parse(spy.mock.calls[0][0]);
    expect(obj.success).toBe(false);
    expect(obj.errors[0].message).toBe('Epic file not found');
    spy.mockRestore();
  });

  it('JSON mode indicates cooldown', async () => {
    ((isInCooldown as any)).mockResolvedValueOnce(true);
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateEpic('epic.json', { json: true });
    const obj = JSON.parse(spy.mock.calls[0][0]);
    expect(obj.cooldown).toBe(true);
    spy.mockRestore();
  });
});
