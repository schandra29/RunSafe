import { getTelemetry, resetCooldown } from './telemetry.ts';

const IDLE_LIMIT = 10 * 60 * 1000; // 10 minutes

export async function isInCooldown(): Promise<boolean> {
  const state = await getTelemetry();
  if (!state.cooldown) return false;
  const last = new Date(state.lastRun).getTime();
  if (Date.now() - last > IDLE_LIMIT) {
    await resetCooldown();
    return false;
  }
  return true;
}

export { resetCooldown } from './telemetry.ts';
