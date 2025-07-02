import { promises as fs } from 'fs';
import path from 'path';
import { getUadoDir } from './getUadoDir.ts';
import { readPasteLog } from './pasteLog.ts';

export interface TelemetryState {
  consecutiveFailures: number;
  lastRun: string;
  cooldown: boolean;
}

const DIR = path.join(process.cwd(), '.runsafe');
const FILE = path.join(DIR, 'telemetry.json');

let cached: TelemetryState | null = null;

async function readState(): Promise<TelemetryState> {
  if (cached) return cached;
  try {
    const data = await fs.readFile(FILE, 'utf8');
    const parsed = JSON.parse(data);
    if (
      typeof parsed.consecutiveFailures === 'number' &&
      typeof parsed.lastRun === 'string' &&
      typeof parsed.cooldown === 'boolean'
    ) {
      cached = parsed;
      return cached;
    }
  } catch {
    // ignore
  }
  cached = {
    consecutiveFailures: 0,
    lastRun: new Date().toISOString(),
    cooldown: false,
  };
  return cached;
}

async function writeState(state: TelemetryState): Promise<void> {
  cached = state;
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // ignore errors
  }
}

async function checkConditions(state: TelemetryState): Promise<void> {
  if (state.consecutiveFailures >= 3) {
    state.cooldown = true;
    return;
  }
  const memoryHigh = process.memoryUsage().rss > 600 * 1024 * 1024;
  if (memoryHigh) {
    state.cooldown = true;
    return;
  }
  try {
    const log = await readPasteLog();
    if (log.length > 100) {
      state.cooldown = true;
    }
  } catch {
    // ignore
  }
}

export async function recordFailure(_error?: { message: string; code: string }): Promise<void> {
  const state = await readState();
  state.consecutiveFailures += 1;
  state.lastRun = new Date().toISOString();
  await checkConditions(state);
  await writeState(state);
}

export async function recordSuccess(): Promise<void> {
  const state = await readState();
  state.consecutiveFailures = 0;
  state.lastRun = new Date().toISOString();
  await checkConditions(state);
  await writeState(state);
}

export async function resetCooldown(): Promise<void> {
  const state = await readState();
  state.consecutiveFailures = 0;
  state.cooldown = false;
  state.lastRun = new Date().toISOString();
  await writeState(state);
}

export async function getTelemetry(): Promise<TelemetryState> {
  return readState();
}

export async function getCooldownReason(): Promise<string | null> {
  const state = await readState();
  if (state.consecutiveFailures >= 3) return 'Too many consecutive apply failures';
  if (process.memoryUsage().rss > 600 * 1024 * 1024) return 'High memory usage';
  try {
    const log = await readPasteLog();
    if (log.length > 100) return 'History log exceeds 100 entries';
  } catch {
    // ignore
  }
  return null;
}

export interface TelemetryEntry {
  command: string;
  timestamp: number;
  flags?: string[];
}

export async function logTelemetry(entry: TelemetryEntry): Promise<void> {
  const dir = getUadoDir();
  const file = path.join(dir, 'telemetry.jsonl');
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // fail silently
  }
}
