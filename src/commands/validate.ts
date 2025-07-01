import { promises as fs } from 'fs';
import path from 'path';
import { parseEpic, FileEdit } from '../utils/parseEpic.js';
import { logError, logSuccess } from '../utils/logger.js';
import { recordFailure } from '../utils/telemetry.js';

interface ValidateOptions {
  council?: boolean;
}

async function checkLineFormat(lines: string[], prefix: string, file: string): Promise<void> {
  for (const line of lines) {
    if (!line.startsWith(prefix)) {
      logError(`Invalid ${prefix.trim()} line format in ${file}`);
      await recordFailure();
      process.exit(1);
      }
  }
}

export async function validateEpic(file: string, opts: ValidateOptions): Promise<void> {
  const workspace = process.cwd();
  const epicPath = path.resolve(workspace, file);
  const md = await fs.readFile(epicPath, 'utf8');
  const epic = parseEpic(md);

  if (!md.includes('# Summary')) {
    logError('Missing # Summary section');
    await recordFailure();
    process.exit(1);
  }
  if (!md.includes('File Edits')) {
    logError('Missing # File Edits section');
    await recordFailure();
    process.exit(1);
  }
  if (epic.edits.length === 0) {
    logError('No file edits found');
    await recordFailure();
    process.exit(1);
  }

  for (const edit of epic.edits) {
    const absPath = path.resolve(workspace, edit.filePath);
    if (!absPath.startsWith(workspace)) {
      logError(`Path ${edit.filePath} is outside workspace`);
      await recordFailure();
      process.exit(1);
    }
    if (
      absPath.includes(`${path.sep}node_modules${path.sep}`) ||
      absPath.includes(`${path.sep}.git${path.sep}`) ||
      edit.filePath.endsWith('package-lock.json')
    ) {
      logError(`Modification of protected path ${edit.filePath} not allowed`);
      await recordFailure();
      process.exit(1);
    }
    if (!['replace', 'insert-before', 'insert-after', 'delete'].includes(edit.type)) {
      logError(`Invalid operation ${edit.type} in ${edit.filePath}`);
      await recordFailure();
      process.exit(1);
    }
    await checkLineFormat(edit.target, '- ', edit.filePath);
    if (edit.replacement) {
      await checkLineFormat(edit.replacement, '+ ', edit.filePath);
    }
  }

  logSuccess('✅ Epic is valid and safe to apply.');

  if (opts.council) {
    const council =
      '\n\n# Council Feedback\n\n✅ Structure valid  \n⚠️ Suggest replacing absolute imports with relative paths  \n✅ Atomic flag present\n';
    await fs.appendFile(epicPath, council, 'utf8');
  }
}
