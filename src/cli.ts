// Main CLI definition using commander

import { Command } from 'commander';
import { loadConfig } from './utils/config.js';
import { logInfo, logError } from './utils/logger.js';
import { applyEpic } from './commands/apply.js';
import { validateEpic } from './commands/validate.js';
import { runDoctor } from './commands/doctor.js';
import { showHistory } from './commands/history.js';
import { replayPaste } from './commands/replay.js';

function showBanner() {
  const banner = `
 _____                 _____         __
|  __ \               / ____|       / _|
| |__) |__ _ _ __ ___| (___   ___  | |_ ___  _ __
|  _  // _` | '__/ _ \\___ \ / _ \ |  _/ _ \| '__|
| | \ \ (_| | | |  __/____) |  __/ | || (_) | |
|_|  \_\__,_|_|  \___|_____/ \___| |_| \___/|_|
`;
  logInfo(banner);
}

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name('runsafe')
    .description('RunSafe CLI');

  program
    .command('apply <epic>')
    .description('Apply file edits from epic markdown')
    .option('--dry-run', 'show intended changes only, do not apply')
    .option('--diff', 'display unified diffs before applying')
    .option('--atomic', 'apply all changes as a single transaction; if any fail, rollback all')
    .action(async (epic: string, opts: any) => {
      await applyEpic(epic, opts);
    });

  program
    .command('validate <epic>')
    .description('Validate epic markdown')
    .option('--council', 'runs AI review and appends feedback to the epic file')
    .action(async (epic: string, opts: any) => {
      await validateEpic(epic, opts);
    });

  program
    .command('doctor')
    .description('Run diagnostics')
    .action(async () => {
      await runDoctor();
    });

  program
    .command('scout')
    .description('Scout for updates')
    .action(async () => {
      logInfo('RunSafe: scout invoked');
    });

  program
    .command('chains')
    .description('Manage chains')
    .action(async () => {
      logInfo('RunSafe: chains invoked');
    });

  program
    .command('history')
    .description('Show apply history')
    .option('--all', 'show all history')
    .action(async (opts: any) => {
      await showHistory(opts);
    });

  program
    .command('replay <index>')
    .description('Replay a previous apply')
    .action(async (index: string) => {
      await replayPaste(parseInt(index, 10));
    });

  program
    .action(() => {
      showBanner();
    });

  try {
    await loadConfig();
    await program.parseAsync(argv);
  } catch (err: any) {
    logError(err.message);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv);
}
