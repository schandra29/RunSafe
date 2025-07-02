// Logger utilities using chalk for consistent output

import chalk from 'chalk';

let quiet = false;
let json = false;

export function setQuiet(q: boolean): void {
  quiet = q;
}

export function setJson(j: boolean): void {
  json = j;
}

export function logInfo(message: string): void {
  if (quiet || json) return;
  console.log(chalk.cyan(message));
}

export function logSuccess(message: string): void {
  if (quiet || json) return;
  console.log(chalk.green(message));
}

export function logError(message: string): void {
  if (json) return;
  console.error(chalk.red(message));
}

export function logWarn(message: string): void {
  if (quiet || json) return;
  console.log(chalk.yellow(message));
}

export function logBanner(message: string): void {
  if (quiet || json) return;
  console.log(chalk.blue(message));
}

export function logWelcome(message: string): void {
  if (quiet || json) return;
  console.log(chalk.magenta(message));
}

export function logCooldownWarning(): void {
  if (json) return;
  console.log(
    chalk.red(
      '🧯 RunSafe is in cooldown mode.\nHigh resource usage or repeated failures detected.\nUse runsafe doctor to troubleshoot, or wait and try again.'
    )
  );
}

export function logSuccessFinal(msg: string): void {
  if (quiet || json) return;
  console.log(chalk.green(`🌱 ${msg}`));
}

export function logDryRunNotice(): void {
  if (quiet || json) return;
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
    lines.push('');
  }

  const files = opts.files ?? [];
  const modified = files.filter(f => f.edits.some(e => !e.skipped));
  const skipped = files.filter(f => f.edits.every(e => e.skipped));

  if (modified.length > 0) {
    lines.push('📝 Modified Files');
    for (const f of modified) {
      lines.push(`- ${f.filePath}`);
    }
    lines.push('');
  }

  if (skipped.length > 0) {
    lines.push('⚠️ Skipped Edits');
    for (const f of skipped) {
      lines.push(`- ${f.filePath}`);
    }
    lines.push('');
  }

  if (opts.error) {
    lines.push('❌ Errors');
    lines.push(`- ${opts.error}`);
    lines.push('');
  }

  const appliedCount = modified.length;
  const skippedCount = skipped.length;
  const errorCount = opts.error ? 1 : 0;

  lines.push(`✅ ${appliedCount} applied · ⚠️ ${skippedCount} skipped · ❌ ${errorCount} error${errorCount === 1 ? '' : 's'}`);

  console.log(lines.join('\n'));
}

export function logJson(data: unknown): void {
  console.log(JSON.stringify(data));
}
