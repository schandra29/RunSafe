// Logger utilities using chalk for consistent output

import chalk from 'chalk';

let quiet = false;

export function setQuiet(q: boolean): void {
  quiet = q;
}

export function logInfo(message: string): void {
  if (quiet) return;
  console.log(chalk.cyan(message));
}

export function logSuccess(message: string): void {
  if (quiet) return;
  console.log(chalk.green(message));
}

export function logError(message: string): void {
  console.error(chalk.red(message));
}

export function logWarn(message: string): void {
  if (quiet) return;
  console.log(chalk.yellow(message));
}

export function logBanner(message: string): void {
  if (quiet) return;
  console.log(chalk.blue(message));
}

export function logWelcome(message: string): void {
  if (quiet) return;
  console.log(chalk.magenta(message));
}

export function logCooldownWarning(): void {
  console.log(
    chalk.red(
      '🧯 RunSafe is in cooldown mode.\nHigh resource usage or repeated failures detected.\nUse runsafe doctor to troubleshoot, or wait and try again.'
    )
  );
}

export function logSuccessFinal(msg: string): void {
  if (quiet) return;
  console.log(chalk.green(`🌱 ${msg}`));
}

export function logDryRunNotice(): void {
  if (quiet) return;
  console.log(chalk.yellow('🚧 Dry-run mode enabled. No changes were written.'));
}

export interface LogSummaryFile {
  filePath: string;
  edits: { type: string; skipped?: boolean }[];
}

export interface LogSummaryOptions {
  success: boolean;
  files?: LogSummaryFile[];
  cooldown?: string | null;
  error?: string | null;
}

export function logSummary(opts: LogSummaryOptions): void {
  const lines: string[] = [];

  if (opts.cooldown) {
    lines.push(chalk.yellow(`⚠️ ${opts.cooldown}`));
  }

  const files = opts.files ?? [];
  for (const f of files) {
    lines.push(`📄 ${f.filePath}`);
    for (const e of f.edits) {
      const color = e.skipped ? chalk.gray : chalk.green;
      const icon = e.skipped ? '⚪' : '✅';
      lines.push(`  ${color(`${icon} ${e.type}`)}`);
    }
  }

  if (opts.error) {
    lines.push(chalk.red(`❌ ${opts.error}`));
  }

  const fileCount = files.length;
  const skipped = files.reduce((acc, f) => acc + f.edits.filter(e => e.skipped).length, 0);
  const errorCount = opts.error ? 1 : 0;
  lines.push(
    `Summary: ${fileCount} files updated, ${skipped} edits skipped, ${errorCount} error${errorCount === 1 ? '' : 's'}`
  );

  console.log(lines.join('\n'));
}
