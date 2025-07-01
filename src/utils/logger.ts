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
