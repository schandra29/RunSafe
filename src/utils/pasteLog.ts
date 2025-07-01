import { promises as fs } from 'fs';
import path from 'path';
import { logWarn, logError, logSuccess } from './logger.js';

export interface PasteLogEntry {
  timestamp: string;
  file: string;
  summary: string;
  bytesChanged: number;
  atomic: boolean;
}

const LOG_DIR = path.join(process.cwd(), '.runsafe');
const LOG_FILE = path.join(LOG_DIR, 'paste.log.json');

export async function readPasteLog(): Promise<PasteLogEntry[]> {
  try {
    const data = await fs.readFile(LOG_FILE, 'utf8');
    const log = JSON.parse(data);
    if (Array.isArray(log)) {
      return log as PasteLogEntry[];
    }
    return [];
  } catch {
    return [];
  }
}

export async function writePasteLog(entry: PasteLogEntry): Promise<void> {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    let log: PasteLogEntry[] = [];
    try {
      const data = await fs.readFile(LOG_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        log = parsed as PasteLogEntry[];
      } else {
        logWarn('Malformed paste.log.json, recreating');
      }
    } catch {
      // no existing log
    }
    log.push(entry);
    await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
    logSuccess('Logged apply to paste.log.json');
  } catch (err) {
    logError((err as Error).message);
  }
}
