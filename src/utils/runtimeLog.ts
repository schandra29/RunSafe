import { promises as fs } from 'fs';
import path from 'path';
import { getUadoDir } from './getUadoDir.ts';

export type CommandName = 'applyEpic' | 'validateEpic';

export interface RuntimeLogEntry<T = unknown> {
  timestamp: string;
  commandName: CommandName;
  args: T;
  cooldownReason: string | null;
  error: string | null;
  errorCode?: string;
}

const DIR = getUadoDir();
const FILE = path.join(DIR, 'runtime.json');

export async function runtimeLog<T = unknown>(
  commandName: CommandName,
  args: T,
  cooldownReason: string | null,
  error: string | null,
  errorCode?: string
): Promise<RuntimeLogEntry<T>> {
  const entry: RuntimeLogEntry<T> = {
    timestamp: new Date().toISOString(),
    commandName,
    args,
    cooldownReason,
    error,
    errorCode,
  };
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.appendFile(FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    if (process.env.NODE_ENV === 'debug') {
      console.error(err);
    }
    // fail silently in production
  }
  return entry;
}

export async function getRecentRuns(): Promise<RuntimeLogEntry[]> {
  try {
    const data = await fs.readFile(FILE, 'utf8');
    const lines = data.split(/\n+/).filter(l => l.trim().length > 0);
    const entries: RuntimeLogEntry[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        entries.push(obj);
      } catch {
        // skip malformed line
      }
    }
    return entries.slice(-10);
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}
