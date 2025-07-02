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
const FILE = path.join(DIR, 'runtime.jsonl');

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
