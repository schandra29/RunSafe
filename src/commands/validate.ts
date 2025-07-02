import { promises as fs } from 'fs';
import path from 'path';
import {
  logInfo,
  logError,
  logSuccessFinal,
  logCooldownWarning,
  logSummary,
  setQuiet,
  logJson,
  setJson,
} from '../utils/logger.js';
import { recordFailure, recordSuccess, getCooldownReason, logTelemetry } from '../utils/telemetry.js';
import { runtimeLog } from '../utils/runtimeLog.js';
import { ErrorCodes, ErrorCode } from '../constants/errorCodes.js';
import { isInCooldown } from '../utils/cooldown.js';
import { validateSchema } from '../utils/validateSchema.js';
import { multiAgentReview, CouncilVerdict } from '../utils/multiAgentReview.js';

interface ValidateOptions {
  council?: boolean;
  summary?: boolean;
  silent?: boolean;
  json?: boolean;
}

export async function validateEpic(epicFilePath: string, options: ValidateOptions): Promise<void> {
  const json = !!options.json;
  const summary = !!options.summary && !json;
  const silent = !!options.silent && !json;
  if (summary || silent || json) setQuiet(true);
  if (json) setJson(true);
  let success = true;
  let error: { message: string; code: ErrorCode } | null = null;
  let summaryText = '';
  let cooldown = false;

  function emitJson() {
    logJson({
      command: 'validateEpic',
      success,
      edits: [],
      errors: error ? [{ message: error.message, code: error.code }] : undefined,
      cooldown,
      cooldownReason: cooldown ? cooldownReason || undefined : undefined,
      summary: summaryText,
    });
  }

  const cooldownReason = await getCooldownReason();
  await runtimeLog('validateEpic', { epicFilePath, options }, cooldownReason, null);
  await logTelemetry({
    command: 'validateEpic',
    timestamp: Date.now(),
    flags: Object.keys(options || {}),
  });
  if (await isInCooldown()) {
    success = false;
    error = { message: 'Cooldown active', code: ErrorCodes.COOLDOWN_ACTIVE };
    cooldown = true;
    if (!summary && !silent) {
      logCooldownWarning();
      if (cooldownReason) logInfo(`Reason: ${cooldownReason}`);
    }
    if (summary) {
      const reason = cooldownReason ? `Cooldown active: ${cooldownReason}` : 'Cooldown active';
      logSummary({ success, files: [], cooldown: reason });
    }
    if (json) emitJson();
    return;
  }

  const absPath = path.resolve(process.cwd(), epicFilePath);
  let raw: string;
  try {
    raw = await fs.readFile(absPath, 'utf8');
  } catch (err) {
    if (!summary) logError(`❌ [${ErrorCodes.FILE_READ_FAIL}] Epic file not found`);
    if (!summary) logError('💡 Tip: Use --dry-run to preview changes without applying.');
    error = { message: 'Epic file not found', code: ErrorCodes.FILE_READ_FAIL };
    await recordFailure(error);
    process.exitCode = 1;
    await runtimeLog('validateEpic', { epicFilePath, options }, cooldownReason, error.message, error.code);
    success = false;
    if (summary) logSummary({ success, files: [], error: error.message });
    if (json) emitJson();
    return;
  }

  let epic: any;
  try {
    epic = JSON.parse(raw);
    summaryText = typeof epic.summary === 'string' ? epic.summary : '';
  } catch (err) {
    if (!summary) logError(`❌ [${ErrorCodes.INVALID_EPIC}] Invalid JSON format`);
    if (!summary) logError('💡 Tip: Use --dry-run to preview changes without applying.');
    error = { message: 'Invalid JSON format', code: ErrorCodes.INVALID_EPIC };
    await recordFailure(error);
    process.exitCode = 1;
    await runtimeLog('validateEpic', { epicFilePath, options }, cooldownReason, error.message, error.code);
    success = false;
    if (summary) logSummary({ success, files: [], error: error.message });
    if (json) emitJson();
    return;
  }

  const result = validateSchema(epic);
  if (!result.valid) {
    if (!summary) logError(`❌ [${ErrorCodes.INVALID_EPIC}] Epic schema validation failed`);
    if (!summary) logError('💡 Tip: Use --dry-run to preview changes without applying.');
    error = { message: 'Epic schema validation failed', code: ErrorCodes.INVALID_EPIC };
    await recordFailure(error);
    process.exitCode = 1;
    success = false;
    if (summary) logSummary({ success, files: [], error: error.message });
    if (json) emitJson();
    return;
  }

  if (!summary && !silent) {
    logSuccessFinal("Validation passed. You're good to go!");
  }
  await recordSuccess();

  if (options.council) {
    const verdict = await multiAgentReview(epic);
    if (verdict === CouncilVerdict.REJECTED) {
      if (!summary) logError(`❌ [${ErrorCodes.VALIDATION_REJECTED}] Council rejected this epic.`);
      error = { message: 'Council rejected this epic.', code: ErrorCodes.VALIDATION_REJECTED };
      await recordFailure(error);
      process.exitCode = 1;
      success = false;
      if (summary) logSummary({ success, files: [], error: error.message });
      if (json) emitJson();
      return;
    }
    if (!summary && !silent) logInfo('Council approved this epic.');
  }

  if (summary) logSummary({ success: true, files: [] });
  if (json) emitJson();
}
