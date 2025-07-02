import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "bun:test";
import path from 'path';
import { promises as fs } from 'fs';
import { logTelemetry } from '../src/utils/telemetry.ts';
import { getUadoDir } from '../src/utils/getUadoDir.ts';

vi.mock('chalk', () => ({
  __esModule: true,
  default: {
    red: (s: any) => s,
    green: (s: any) => s,
    cyan: (s: any) => s,
    yellow: (s: any) => s,
    blue: (s: any) => s,
    magenta: (s: any) => s,
  },
}));

vi.mock('fs', () => ({
  promises: {
    appendFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

const mkdirMock = fs.mkdir as unknown as vi.Mock;
const appendFileMock = fs.appendFile as unknown as vi.Mock;

beforeEach(() => {
  vi.resetAllMocks();
});

it('logs a valid entry with command and timestamp', async () => {
  const entry = { command: 'apply', timestamp: 123, flags: ['--dry-run'] };
  await expect(logTelemetry(entry)).resolves.toBeUndefined();

  const dir = getUadoDir();
  const file = path.join(dir, 'telemetry.jsonl');
  expect(mkdirMock).toHaveBeenCalledWith(dir, { recursive: true });
  expect(appendFileMock).toHaveBeenCalledWith(file, JSON.stringify(entry) + '\n', 'utf8');
});

it('creates .uado directory and file if missing', async () => {
  const entry = { command: 'validate', timestamp: 456 };
  await logTelemetry(entry);

  const dir = getUadoDir();
  const file = path.join(dir, 'telemetry.jsonl');
  expect(mkdirMock).toHaveBeenCalledWith(dir, { recursive: true });
  expect(appendFileMock).toHaveBeenCalledWith(file, JSON.stringify(entry) + '\n', 'utf8');
});

it('appends multiple entries', async () => {
  const e1 = { command: 'one', timestamp: 1 };
  const e2 = { command: 'two', timestamp: 2 };
  await logTelemetry(e1);
  await logTelemetry(e2);

  const dir = getUadoDir();
  const file = path.join(dir, 'telemetry.jsonl');
  expect(appendFileMock).toHaveBeenCalledTimes(2);
  expect(appendFileMock).toHaveBeenNthCalledWith(1, file, JSON.stringify(e1) + '\n', 'utf8');
  expect(appendFileMock).toHaveBeenNthCalledWith(2, file, JSON.stringify(e2) + '\n', 'utf8');
});

it('silently handles appendFile failure', async () => {
  appendFileMock.mockRejectedValueOnce(new Error('fail'));
  const entry = { command: 'oops', timestamp: 3 };
  await expect(logTelemetry(entry)).resolves.toBeUndefined();

  expect(mkdirMock).toHaveBeenCalled();
  expect(appendFileMock).toHaveBeenCalled();
});
