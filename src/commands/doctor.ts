import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { logInfo, logSuccess, logError, logWarn, logSuccessFinal } from '../utils/logger.js';
import { resetCooldown, recordFailure } from '../utils/telemetry.js';

async function checkNodeVersion(): Promise<boolean> {
  const version = process.version.replace(/^v/, '');
  const [major] = version.split('.').map(Number);
  const ok = major >= 18;
  if (ok) {
    logSuccess(`✅ Node.js ${process.version}`);
  } else {
    logError(`❌ Node.js ${process.version} (requires v18.0.0+)`);
  }
  return ok;
}

function printOSInfo(): void {
  const platform = os.platform();
  const arch = process.arch;
  let name = platform;
  if (platform === 'win32') name = 'Windows';
  else if (platform === 'darwin') name = 'macOS';
  else if (platform === 'linux') name = 'Linux';
  logInfo(`OS: ${name} (${arch})`);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function checkRequiredFiles(): Promise<boolean> {
  const cwd = process.cwd();
  const files = ['package.json', path.join('src', 'cli.ts'), path.join('bin', 'runsafe')];
  let ok = true;
  for (const f of files) {
    const fp = path.join(cwd, f);
    if (await fileExists(fp)) {
      logSuccess(`✅ ${f}`);
    } else {
      logError(`❌ Missing ${f}`);
      ok = false;
    }
  }
  return ok;
}

async function checkConfigFile(): Promise<void> {
  const cwd = path.join(process.cwd(), '.runsaferc.json');
  const home = path.join(os.homedir(), '.runsaferc.json');
  if (await fileExists(cwd)) {
    logInfo('Config: .runsaferc.json in project');
  } else if (await fileExists(home)) {
    logInfo('Config: .runsaferc.json in home');
  } else {
    logWarn('⚠️  Config file .runsaferc.json not found');
  }
}

async function checkLockFile(): Promise<boolean> {
  const cwd = process.cwd();
  const lockPath = path.join(cwd, 'package-lock.json');
  if (!(await fileExists(lockPath))) {
    logError('❌ Missing package-lock.json');
    return false;
  }
  const pkgPath = path.join(cwd, 'package.json');
  try {
    const lockStat = await fs.stat(lockPath);
    const pkgStat = await fs.stat(pkgPath);
    if (lockStat.mtimeMs < pkgStat.mtimeMs) {
      logWarn('⚠️  package-lock.json may be out of sync with package.json');
    } else {
      logSuccess('✅ package-lock.json');
    }
  } catch {
    logSuccess('✅ package-lock.json');
  }
  return true;
}

export async function runDoctor(): Promise<void> {
  let errors = false;
  const nodeOk = await checkNodeVersion();
  if (!nodeOk) errors = true;

  printOSInfo();

  const filesOk = await checkRequiredFiles();
  if (!filesOk) errors = true;

  await checkConfigFile();
  const lockOk = await checkLockFile();
  if (!lockOk) errors = true;

  if (errors) {
    logError('🚨 Something looks off. Use runsafe doctor to investigate.');
    await recordFailure();
  } else {
    logSuccessFinal('All systems go! 🚀');
    await resetCooldown();
  }
}
