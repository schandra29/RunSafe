import { promises as fs } from 'fs';
import path from 'path';
import {
  logInfo,
  logError,
  logSuccessFinal,
  logCooldownWarning,
} from '../utils/logger.js';
import { recordFailure, recordSuccess, getCooldownReason } from '../utils/telemetry.js';
import { isInCooldown } from '../utils/cooldown.js';
import { validateSchema } from '../utils/validateSchema.js';
import { multiAgentReview, CouncilVerdict } from '../utils/multiAgentReview.js';

interface ValidateOptions {
  council?: boolean;
}

export async function validateEpic(epicFilePath: string, options: ValidateOptions): Promise<void> {
  if (await isInCooldown()) {
    logCooldownWarning();
    const reason = await getCooldownReason();
    if (reason) logInfo(`Reason: ${reason}`);
    return;
  }

  const absPath = path.resolve(process.cwd(), epicFilePath);
  let raw: string;
  try {
    raw = await fs.readFile(absPath, 'utf8');
  } catch {
    logError('Epic file not found');
    await recordFailure();
    process.exitCode = 1;
    return;
  }

  let epic: any;
  try {
    epic = JSON.parse(raw);
  } catch {
    logError('Invalid JSON format');
    await recordFailure();
    process.exitCode = 1;
    return;
  }

  const result = validateSchema(epic);
  if (!result.valid) {
    logError('Epic schema validation failed');
    await recordFailure();
    process.exitCode = 1;
    return;
  }

  logSuccessFinal("Validation passed. You're good to go!");
  await recordSuccess();

  if (options.council) {
    const verdict = await multiAgentReview(epic);
    if (verdict === CouncilVerdict.REJECTED) {
      logError('Council rejected this epic.');
      await recordFailure();
      process.exitCode = 1;
      return;
    }
    logInfo('Council approved this epic.');
  }
}
