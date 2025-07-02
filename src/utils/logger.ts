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
