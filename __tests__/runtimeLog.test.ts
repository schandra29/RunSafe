import { jest } from '@jest/globals';
import path from 'path';
import { promises as fs } from 'fs';
import { runtimeLog } from '../src/utils/runtimeLog.js';

jest.mock('fs', () => ({
  promises: {
    appendFile: jest.fn(),
    mkdir: jest.fn(),
  },
}));

const appendFileMock = fs.appendFile as unknown as jest.Mock;
const mkdirMock = fs.mkdir as unknown as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
});

test('logs structured entry', async () => {
  await runtimeLog('applyEpic', { foo: 'bar' }, null, null);
  const dir = path.join(process.cwd(), '.uado');
  const file = path.join(dir, 'runtime.jsonl');
  expect(mkdirMock).toHaveBeenCalledWith(dir, { recursive: true });
  expect(appendFileMock).toHaveBeenCalledWith(file, expect.any(String), 'utf8');
  const entry = JSON.parse(appendFileMock.mock.calls[0][1].trim());
  expect(entry.commandName).toBe('applyEpic');
  expect(entry.args).toEqual({ foo: 'bar' });
  expect(entry.cooldownReason).toBeNull();
  expect(entry.error).toBeNull();
  expect(typeof entry.timestamp).toBe('string');
});

test('includes cooldown and error', async () => {
  await runtimeLog('validateEpic', { id: 1 }, 'cool', 'boom');
  const entry = JSON.parse(appendFileMock.mock.calls[0][1].trim());
  expect(entry.cooldownReason).toBe('cool');
  expect(entry.error).toBe('boom');
  expect(entry.commandName).toBe('validateEpic');
});
