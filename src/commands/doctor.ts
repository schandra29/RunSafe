import { logInfo } from '../utils/logger.js';
import { getRecentRuns, RuntimeLogEntry } from '../utils/runtimeLog.js';

function formatDate(iso: string): string {
  return iso.split('T')[0];
}

export async function runDoctor(): Promise<void> {
  const runs = await getRecentRuns();
  if (runs.length === 0) {
    logInfo('No recent runs found.');
    return;
  }

  logInfo('Timestamp | Command | Cooldown | Error');
  logInfo('--------- | ------- | -------- | -----');
  for (const r of runs) {
    const ts = formatDate(r.timestamp);
    const cooldown = r.cooldownReason ? '🧊 cooldown' : '✅';
    const err = r.error ? '❌ error' : '';
    logInfo(`🕒 ${ts} | ${r.commandName} | ${cooldown} | ${err}`);
  }
}

