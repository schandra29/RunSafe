import { logInfo } from '../utils/logger.js';
import { readPasteLog, PasteLogEntry } from '../utils/pasteLog.js';

interface HistoryOptions {
  all?: boolean;
}

function formatDate(iso: string): string {
  return iso.replace('T', ' ').split('.')[0];
}

export async function showHistory(opts: HistoryOptions): Promise<void> {
  const log = await readPasteLog();
  if (log.length === 0) {
    logInfo('No history found.');
    return;
  }

  const entries = opts.all ? log : log.slice(-10);
  logInfo('# | Timestamp           | File             | Summary');
  logInfo('--|---------------------|------------------|-----------------------------');
  const startIndex = log.length - entries.length;
  entries.forEach((entry, i) => {
    const idx = startIndex + i + 1;
    const line = `${idx} | ${formatDate(entry.timestamp).padEnd(19)} | ${entry.file.padEnd(16)} | ${entry.summary}`;
    logInfo(line);
  });
}
