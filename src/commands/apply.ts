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
} from '../utils/logger.js';
import { parseEpic, FileEdit } from '../utils/parseEpic.js';
import { printUnifiedDiff } from "../utils/printUnifiedDiff.js";
import { writePasteLog } from '../utils/pasteLog.js';
import { isInCooldown } from '../utils/cooldown.js';
import { recordSuccess, recordFailure, getCooldownReason, logTelemetry } from '../utils/telemetry.js';

interface ApplyOptions {
  dryRun?: boolean;
  diff?: boolean;
  atomic?: boolean;
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
  await logTelemetry({
    command: 'applyEpic',
    timestamp: Date.now(),
    flags: Object.keys(options || {}),
  });
  if (await isInCooldown()) {
    logCooldownWarning();
    const reason = await getCooldownReason();
    if (reason) logWarn(`Reason: ${reason}`);
    return;
  }
  const workspace = process.cwd();
  const epicPath = path.resolve(workspace, file);
  let md: string;
  try {
    md = await fs.readFile(epicPath, 'utf8');
  } catch (err) {
    logError((err as Error).message);
    logError('Try running with --dry-run to debug');
    await recordFailure();
    return;
  }

  let epic: ReturnType<typeof parseEpic> | null;
  try {
    epic = parseEpic(md);
    if (!epic) throw new Error('Invalid epic');
  } catch (err) {
    const msg = process.env.NODE_ENV === 'debug' ? (err as Error).stack : (err as Error).message;
    try {
      logError(msg as string);
    } catch (logErr) {
      console.error(logErr);
    }
    await recordFailure();
    return;
  }

  logInfo(`Summary:\n${epic.summary}`);

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

      if (options.dryRun) {
        logInfo(`${edit.filePath} -> ${edit.type}`);
        const preview = diffLines(text, existing.updated);
        logInfo(preview);
      }
    }

    if (options.dryRun) {
      logDryRunNotice();
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
    logSuccessFinal('Your changes were safely planted.');
    await writePasteLog({
      timestamp: new Date().toISOString(),
      file,
      summary: epic.summary,
      bytesChanged,
      atomic: !!options.atomic,
    });
    await recordSuccess();
  } catch (err) {
    try {
      logError((err as Error).message);
    } catch (logErr) {
      console.error(logErr);
    }
    if (options.atomic) {
      for (const [absPath, orig] of backups.entries()) {
        await fs.writeFile(absPath, orig, 'utf8');
      }
      try {
        logError('Rolled back changes due to failure');
      } catch (logErr) {
        console.error(logErr);
      }
    }
    await recordFailure();
    if ((err as Error).message.startsWith('Unsupported edit type')) {
      throw err;
    }
  }
}
