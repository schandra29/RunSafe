import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
  logInfo,
  logError,
  logSuccessFinal,
  logDryRunNotice,
  logWarn,
  logCooldownWarning,
  logSummary,
  LogSummaryFile,
  setQuiet,
} from '../utils/logger.js';
import { parseEpic, FileEdit } from '../utils/parseEpic.js';
import { printUnifiedDiff } from "../utils/printUnifiedDiff.js";
import { writePasteLog } from '../utils/pasteLog.js';
import { isInCooldown } from '../utils/cooldown.js';
import { recordSuccess, recordFailure, getCooldownReason, logTelemetry } from '../utils/telemetry.js';
import { runtimeLog } from '../utils/runtimeLog.js';
import { ErrorCodes, ErrorCode } from '../constants/errorCodes.js';

interface ApplyOptions {
  dryRun?: boolean;
  diff?: boolean;
  atomic?: boolean;
  summary?: boolean;
  silent?: boolean;
}

function isBinary(buf: Buffer): boolean {
  for (let i = 0; i < buf.length; i++) {
    const char = buf[i];
    if (char === 0) return true;
  }
  return false;
}

function applyEdit(content: string, edit: FileEdit): string {
  const target = edit.target.join('\n');
  const replacement = edit.replacement?.join('\n') ?? '';
  switch (edit.type) {
    case 'replace':
      return content.replace(target, replacement);
    case 'insert-before':
      return content.replace(target, `${replacement}\n${target}`);
    case 'insert-after':
      return content.replace(target, `${target}\n${replacement}`);
    case 'delete':
      return content.replace(target, '');
    default:
      throw new Error(`Unsupported edit type ${edit.type}`);
  }
}

function diffLines(oldStr: string, newStr: string): string {
  const oldLines = oldStr.split(/\r?\n/);
  const newLines = newStr.split(/\r?\n/);
  let out = '';
  oldLines.forEach((line, i) => {
    if (newLines[i] === undefined) {
      out += chalk.red(`- ${line}\n`);
    } else if (newLines[i] !== line) {
      out += chalk.red(`- ${line}\n`);
      out += chalk.green(`+ ${newLines[i]}\n`);
    } else {
      out += `  ${line}\n`;
    }
  });
  for (let j = oldLines.length; j < newLines.length; j++) {
    out += chalk.green(`+ ${newLines[j]}\n`);
  }
  return out;
}

export async function applyEpic(file: string, options: ApplyOptions): Promise<void> {
  const summary = !!options.summary;
  const silent = !!options.silent;
  if (summary || silent) setQuiet(true);
  let success = true;
  let error: { message: string; code: ErrorCode } | null = null;
  let summaryFiles: LogSummaryFile[] = [];

  const cooldownReason = await getCooldownReason();
  await runtimeLog('applyEpic', { file, options }, cooldownReason, null);
  await logTelemetry({
    command: 'applyEpic',
    timestamp: Date.now(),
    flags: Object.keys(options || {}),
  });
  if (await isInCooldown()) {
    success = false;
    error = { message: 'Cooldown active', code: ErrorCodes.COOLDOWN_ACTIVE };
    if (!summary && !silent) {
      logCooldownWarning();
      if (cooldownReason) logWarn(`Reason: ${cooldownReason}`);
    }
    if (summary) {
      const reason = cooldownReason ? `Cooldown active: ${cooldownReason}` : 'Cooldown active';
      logSummary({ success, files: [], cooldown: reason });
    }
    return;
  }
  const workspace = process.cwd();
  const epicPath = path.resolve(workspace, file);
  let md: string;
  try {
    md = await fs.readFile(epicPath, 'utf8');
  } catch (err) {
    if (!summary) {
      logError(`[${ErrorCodes.FILE_READ_FAIL}] ${(err as Error).message}`);
      logError('Try running with --dry-run to debug');
    }
    error = { message: (err as Error).message, code: ErrorCodes.FILE_READ_FAIL };
    await recordFailure(error);
    await runtimeLog('applyEpic', { file, options }, cooldownReason, error.message, error.code);
    success = false;
    if (summary) logSummary({ success, files: [], error: error.message });
    return;
  }

  let epic: ReturnType<typeof parseEpic> | null;
  try {
    epic = parseEpic(md);
    if (!epic) throw new Error('Invalid epic');
  } catch (err) {
    const msg = process.env.NODE_ENV === 'debug' ? (err as Error).stack : (err as Error).message;
    if (!summary) {
      try {
        logError(`[${ErrorCodes.INVALID_EPIC}] ${msg as string}`);
      } catch (logErr) {
        console.error(logErr);
      }
    }
    error = { message: (err as Error).message, code: ErrorCodes.INVALID_EPIC };
    await recordFailure(error);
    await runtimeLog('applyEpic', { file, options }, cooldownReason, error.message, error.code);
    success = false;
    if (summary) logSummary({ success, files: [], error: error.message });
    return;
  }

  if (!silent && !summary) {
    logInfo(`Summary:\n${epic.summary}`);
  }

  summaryFiles = Object.entries(
    epic.edits.reduce((acc: Record<string, string[]>, e) => {
      acc[e.filePath] = acc[e.filePath] || [];
      acc[e.filePath].push(e.type);
      return acc;
    }, {})
  ).map(([filePath, types]) => ({ filePath, edits: types.map(t => ({ type: t })) }));

  const fileContents = new Map<string, { original: string; updated: string }>();
  let bytesChanged = 0;
  const backups: Map<string, string> = new Map();

  try {
    for (const edit of epic.edits) {
      const absPath = path.resolve(workspace, edit.filePath);
      if (!absPath.startsWith(workspace)) {
        throw new Error(`Path ${edit.filePath} is outside workspace`);
      }
      if (
        absPath.includes(`${path.sep}node_modules${path.sep}`) ||
        absPath.includes(`${path.sep}.git${path.sep}`)
      ) {
        throw new Error(`Modification of protected path ${edit.filePath} not allowed`);
      }
      const buf = await fs.readFile(absPath);
      if (isBinary(buf)) throw new Error(`Binary file ${edit.filePath} not allowed`);
      const text = buf.toString('utf8');
      const existing = fileContents.get(absPath) || { original: text, updated: text };
      existing.updated = applyEdit(existing.updated, edit);
      fileContents.set(absPath, existing);

      if (options.dryRun && !summary && !silent) {
        logInfo(`${edit.filePath} -> ${edit.type}`);
        const preview = diffLines(text, existing.updated);
        logInfo(preview);
      }
    }

    if (options.dryRun) {
      if (!summary && !silent) logDryRunNotice();
      if (summary) logSummary({ success: true, files: summaryFiles });
      return;
    }

    for (const [absPath, data] of fileContents.entries()) {
      if (options.diff) {
        const rel = path.relative(workspace, absPath);
        printUnifiedDiff(data.original, data.updated, rel);
      }
      if (options.atomic) {
        backups.set(absPath, data.original);
      }
      bytesChanged += Math.abs(
        Buffer.byteLength(data.updated, 'utf8') - Buffer.byteLength(data.original, 'utf8')
      );
      await fs.writeFile(absPath, data.updated, 'utf8');
    }
    if (!summary && !silent) {
      logSuccessFinal('Your changes were safely planted.');
    }
    await writePasteLog({
      timestamp: new Date().toISOString(),
      file,
      summary: epic.summary,
      bytesChanged,
      atomic: !!options.atomic,
    });
    await recordSuccess();
    if (summary) logSummary({ success: true, files: summaryFiles });
  } catch (err) {
    if (!summary) {
      try {
        const code = (err as Error).message.startsWith('Unsupported edit type')
          ? ErrorCodes.UNSUPPORTED_EDIT
          : ErrorCodes.WRITE_FAIL;
        logError(`[${code}] ${(err as Error).message}`);
      } catch (logErr) {
        console.error(logErr);
      }
    }
    if (options.atomic) {
      for (const [absPath, orig] of backups.entries()) {
        await fs.writeFile(absPath, orig, 'utf8');
      }
      try {
        if (!summary) logError('Rolled back changes due to failure');
      } catch (logErr) {
        console.error(logErr);
      }
    }
    const code = (err as Error).message.startsWith('Unsupported edit type')
      ? ErrorCodes.UNSUPPORTED_EDIT
      : ErrorCodes.WRITE_FAIL;
    error = { message: (err as Error).message, code };
    await recordFailure(error);
    await runtimeLog('applyEpic', { file, options }, cooldownReason, error.message, error.code);
    success = false;
    if (summary) logSummary({ success, files: summaryFiles, error: error.message });
    if ((err as Error).message.startsWith('Unsupported edit type')) {
      throw err;
    }
  }
}
