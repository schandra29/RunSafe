import { promises as fs } from 'fs';
import path from 'path';
import chalk from 'chalk';
import { logInfo, logError, logSuccess } from '../utils/logger.js';
import { parseEpic, FileEdit } from '../utils/parseEpic.js';

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
      if (!content.includes(target)) throw new Error(`target not found for replace in ${edit.filePath}`);
      return content.replace(target, replacement);
    case 'insert-before':
      if (!content.includes(target)) throw new Error(`target not found for insert-before in ${edit.filePath}`);
      return content.replace(target, `${replacement}\n${target}`);
    case 'insert-after':
      if (!content.includes(target)) throw new Error(`target not found for insert-after in ${edit.filePath}`);
      return content.replace(target, `${target}\n${replacement}`);
    case 'delete':
      if (!content.includes(target)) throw new Error(`target not found for delete in ${edit.filePath}`);
      return content.replace(target, '');
    default:
      return content;
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
  const workspace = process.cwd();
  const epicPath = path.resolve(workspace, file);
  const md = await fs.readFile(epicPath, 'utf8');
  const epic = parseEpic(md);

  logInfo(`Summary:\n${epic.summary}`);

  const fileContents = new Map<string, { original: string; updated: string }>();

  for (const edit of epic.edits) {
    const absPath = path.resolve(workspace, edit.filePath);
    if (!absPath.startsWith(workspace)) {
      throw new Error(`Path ${edit.filePath} is outside workspace`);
    }
    if (absPath.includes(`${path.sep}node_modules${path.sep}`) || absPath.includes(`${path.sep}.git${path.sep}`)) {
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
    return;
  }

  const backups: Map<string, string> = new Map();
  try {
    for (const [absPath, data] of fileContents.entries()) {
      if (options.diff) {
        const d = diffLines(data.original, data.updated);
        logInfo(`Diff for ${absPath}:\n${d}`);
      }
      if (options.atomic) {
        backups.set(absPath, data.original);
      }
      await fs.writeFile(absPath, data.updated, 'utf8');
    }
    logSuccess('All changes applied');
  } catch (err) {
    logError((err as Error).message);
    if (options.atomic) {
      for (const [absPath, orig] of backups.entries()) {
        await fs.writeFile(absPath, orig, 'utf8');
      }
      logError('Rolled back changes due to failure');
    }
  }
}
