import { promises as fs } from 'fs';
import path from 'path';

export type CommandName = 'applyEpic' | 'validateEpic';

export interface RuntimeLogEntry {
  timestamp: string;
  commandName: CommandName;
  args: any;
  cooldownReason: string | null;
  error: string | null;
}

const DIR = path.join(process.cwd(), '.uado');
const FILE = path.join(DIR, 'runtime.json');

export async function runtimeLog(
  commandName: CommandName,
  args: any,
  cooldownReason: string | null,
  error: string | null
): Promise<void> {
  const entry: RuntimeLogEntry = {
    timestamp: new Date().toISOString(),
    commandName,
    args,
    cooldownReason,
    error,
  };
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.appendFile(FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // fail silently
  }
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
