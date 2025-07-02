import * as fs from 'fs';
import { parseEpic } from '../src/utils/parseEpic.js';
import { isInCooldown } from '../src/utils/cooldown.js';

let diffUtil: { printUnifiedDiff: jest.Mock };
let applyEpic: (file: string, opts: any) => Promise<void>;

beforeAll(async () => {
  jest.mock('chalk', () => ({ default: { red: jest.fn(() => ''), green: jest.fn(() => ''), yellow: jest.fn(() => ''), blue: jest.fn(() => ''), cyan: jest.fn(() => ''), magenta: jest.fn(() => '') } }), { virtual: true });
  diffUtil = await import('../src/utils/printUnifiedDiff.js') as any;
  applyEpic = (await import('../src/commands/apply.js')).applyEpic;
});

jest.mock('../src/utils/logger.ts', () => ({
  __esModule: true,
  logInfo: jest.fn(),
  logError: jest.fn(),
  logSuccessFinal: jest.fn(),
  logDryRunNotice: jest.fn(),
  logWarn: jest.fn(),
  logCooldownWarning: jest.fn(),
}));

jest.mock('fs', () => ({ promises: { readFile: jest.fn(), writeFile: jest.fn() } }));
jest.mock('../src/utils/parseEpic.js');
jest.mock('../src/utils/pasteLog.ts', () => ({ __esModule: true, writePasteLog: jest.fn() }));
jest.mock('../src/utils/telemetry.ts', () => ({
  __esModule: true,
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined),
  getCooldownReason: jest.fn().mockResolvedValue(null),
}));
jest.mock('../src/utils/cooldown.js');

const fsPromises = (fs as any).promises;

beforeEach(() => {
  (isInCooldown as jest.Mock).mockResolvedValue(false);
  (fsPromises.readFile as jest.Mock).mockReset();
  (fsPromises.writeFile as jest.Mock).mockReset();
});

test('when diff flag is true, printUnifiedDiff is called with correct args', async () => {
  (parseEpic as jest.Mock).mockReturnValue({
    summary: 's',
    edits: [
      { filePath: 'file.txt', type: 'replace', target: ['old'], replacement: ['new'] },
    ],
  });
  (fsPromises.readFile as jest.Mock).mockResolvedValueOnce('md').mockResolvedValueOnce('old');
  const diffSpy = jest.spyOn(diffUtil, 'printUnifiedDiff').mockImplementation(() => {});

  await applyEpic('e.md', { diff: true });

  expect(diffSpy).toHaveBeenCalledWith('old', 'new', 'file.txt');
  diffSpy.mockRestore();
});

test('when diff flag is false, diff is not generated', async () => {
  (parseEpic as jest.Mock).mockReturnValue({
    summary: 's',
    edits: [
      { filePath: 'file.txt', type: 'replace', target: ['old'], replacement: ['new'] },
    ],
  });
  (fsPromises.readFile as jest.Mock).mockResolvedValueOnce('md').mockResolvedValueOnce('old');
  const diffSpy = jest.spyOn(diffUtil, 'printUnifiedDiff').mockImplementation(() => {});

  await applyEpic('e.md', { diff: false });

  expect(diffSpy).not.toHaveBeenCalled();
  diffSpy.mockRestore();
});
