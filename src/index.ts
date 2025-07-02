// Main CLI definition using commander

import { Command } from 'commander';
import { loadConfig } from './utils/config.ts';
import {
  logInfo,
  logError,
  logBanner,
  logWelcome,
  setQuiet,
} from './utils/logger.ts';
import { applyEpic } from './commands/apply.ts';
import { validateEpic } from './commands/validate.ts';
import { runDoctor } from './commands/doctor.ts';
import { showHistory } from './commands/history.ts';
import { replayPaste } from './commands/replay.ts';
import { checkFirstRun } from './utils/firstRun.ts';
import { createRequire } from 'module';

function showBanner() {
  const banner = `
 _____                 _____         __
|  __ \\               / ____|       / _|
| |__) |__ _ _ __ ___| (___   ___  | |_ ___  _ __
|  _  // _\` | '__/ _ \\___ \\ / _ \\ |  _/ _ \\| '__|
| | \\ \\ (_| | | |  __/____) |  __/ | || (_) | |
|_|  \\_\\__,_|_|  \\___|_____/ \\___| |_| \\___/|_|
`;
  logBanner(banner);
}

function showWelcome() {
  const msg = `🚀 Welcome to RunSafe – The CLI that applies AI-generated markdown, safely.\n 🔍 Try runsafe uado doctor to check recent runs.\n 📚 See runsafe help for available commands.`;
  logWelcome(msg);
}

function showIntro() {
  logBanner('🛡️  RunSafe CLI v0.1  —  Secure AI Dev, One Command at a Time');
}

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  const require = createRequire(import.meta.url);
  const { version } = require('../package.json');

  const quietFlag = argv.includes('--quiet') || argv.includes('-q');
  if (quietFlag) setQuiet(true);

  if (!quietFlag) {
    showIntro();
  }

  const noArgs = argv.length <= 2;
  const first = await checkFirstRun();
  if (first && !quietFlag && !noArgs) {
    showBanner();
    showWelcome();
  }

  program
    .name('runsafe')
    .description('RunSafe CLI')
    .version(version)
    .option('-q, --quiet', 'suppress banner and logs');

  program.addHelpText(
    'after',
    `\nRunSafe Commands:\n  apply <epic>     Apply file edits from epic markdown\n  validate <epic>  Validate epic markdown\n  uado doctor      Show recent run health summary\n\nFlags:\n  --summary  output json summary only\n  --silent   suppress all logging except errors\n  --json     output structured json\n  -q, --quiet suppress banner and logs\n\nExamples:\n  $ runsafe apply epic-001.md --dry-run\n  $ runsafe validate epic-001.md --council\n  $ runsafe uado doctor\n\n🔧 Tip: Use --json for machine-readable output`
  );

  program
    .command('apply <epic>')
    .description('Apply file edits from epic markdown')
    .option('--dry-run', 'show intended changes only, do not apply')
    .option('--diff', 'display unified diffs before applying')
    .option('--atomic', 'apply all changes as a single transaction; if any fail, rollback all')
    .option('--summary', 'output json summary only')
    .option('--json', 'output structured json')
    .option('--silent', 'suppress all logging except errors')
    .addHelpText('after', '\nExamples:\n  $ runsafe apply epic-001.md --dry-run')
    .action(async (epic: string, opts: any) => {
      if (opts.summary || opts.silent || opts.json) setQuiet(true);
      await applyEpic(epic, opts);
    });

  program
    .command('validate <epic>')
    .description('Validate epic markdown')
    .option('--council', 'runs AI review and appends feedback to the epic file')
    .option('--summary', 'output json summary only')
    .option('--json', 'output structured json')
    .option('--silent', 'suppress all logging except errors')
    .addHelpText('after', '\nExamples:\n  $ runsafe validate epic-001.md --council')
    .action(async (epic: string, opts: any) => {
      if (opts.summary || opts.silent || opts.json) setQuiet(true);
      await validateEpic(epic, opts);
    });


  const uado = program.command('uado').description('Developer utilities');

  uado
    .command('doctor')
    .description('Show recent run health summary')
    .addHelpText('after', '\nExamples:\n  $ runsafe uado doctor')
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
    .description('Execute a chain of epics')
    .action(async () => {
      const { runChains } = await import('./commands/chains.ts');
      await runChains();
    });

  program
    .command('history')
    .description('Show apply history')
    .option('--all', 'show all history')
    .addHelpText('after', '\nExamples:\n  $ runsafe history --all')
    .action(async (opts: any) => {
      await showHistory(opts);
    });

  program
    .command('replay <index>')
    .description('Replay a previous apply')
    .addHelpText('after', '\nExamples:\n  $ runsafe replay 2')
    .action(async (index: string) => {
      await replayPaste(parseInt(index, 10));
    });

  program.action(() => {
    showBanner();
    program.outputHelp();
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
