import { promises as fs } from 'fs';
import path from 'path';
import {
  logInfo,
  logError,
  logSuccessFinal,
  logCooldownWarning,
  setQuiet,
} from '../utils/logger.js';
import { recordFailure, recordSuccess, getCooldownReason, logTelemetry } from '../utils/telemetry.js';
import { runtimeLog } from '../utils/runtimeLog.js';
import { isInCooldown } from '../utils/cooldown.js';
import { validateSchema } from '../utils/validateSchema.js';
import { multiAgentReview, CouncilVerdict } from '../utils/multiAgentReview.js';

interface ValidateOptions {
  council?: boolean;
  summary?: boolean;
  silent?: boolean;
}

export async function validateEpic(epicFilePath: string, options: ValidateOptions): Promise<void> {
  const summary = !!options.summary;
  const silent = !!options.silent;
  if (summary || silent) setQuiet(true);
  let success = true;
  let errorMsg: string | null = null;

  const cooldownReason = await getCooldownReason();
  await runtimeLog('validateEpic', { epicFilePath, options }, cooldownReason, null);
  await logTelemetry({
    command: 'validateEpic',
    timestamp: Date.now(),
    flags: Object.keys(options || {}),
  });
  if (await isInCooldown()) {
    success = false;
    errorMsg = 'Cooldown active';
    if (!summary && !silent) {
      logCooldownWarning();
      if (cooldownReason) logInfo(`Reason: ${cooldownReason}`);
    }
    if (summary) console.log(JSON.stringify({ success, error: errorMsg }));
    return;
  }

  const absPath = path.resolve(process.cwd(), epicFilePath);
  let raw: string;
  try {
    raw = await fs.readFile(absPath, 'utf8');
  } catch (err) {
    if (!summary) logError('Epic file not found');
    await recordFailure();
    process.exitCode = 1;
    await runtimeLog('validateEpic', { epicFilePath, options }, cooldownReason, (err as Error).message);
    success = false;
    errorMsg = 'Epic file not found';
    if (summary) console.log(JSON.stringify({ success, error: errorMsg }));
    return;
  }

  let epic: any;
  try {
    epic = JSON.parse(raw);
  } catch (err) {
    if (!summary) logError('Invalid JSON format');
    await recordFailure();
    process.exitCode = 1;
    await runtimeLog('validateEpic', { epicFilePath, options }, cooldownReason, (err as Error).message);
    success = false;
    errorMsg = 'Invalid JSON format';
    if (summary) console.log(JSON.stringify({ success, error: errorMsg }));
    return;
  }

  const result = validateSchema(epic);
  if (!result.valid) {
    if (!summary) logError('Epic schema validation failed');
    await recordFailure();
    process.exitCode = 1;
    success = false;
    errorMsg = 'Epic schema validation failed';
    if (summary) console.log(JSON.stringify({ success, error: errorMsg }));
    return;
  }

  if (!summary && !silent) {
    logSuccessFinal("Validation passed. You're good to go!");
  }
  await recordSuccess();

  if (options.council) {
    const verdict = await multiAgentReview(epic);
    if (verdict === CouncilVerdict.REJECTED) {
      if (!summary) logError('Council rejected this epic.');
      await recordFailure();
      process.exitCode = 1;
      success = false;
      errorMsg = 'Council rejected this epic.';
      if (summary) console.log(JSON.stringify({ success, error: errorMsg }));
      return;
    }
    if (!summary && !silent) logInfo('Council approved this epic.');
  }

  if (summary) console.log(JSON.stringify({ success: true }));
}
