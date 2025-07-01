import { promises as fs } from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), '.runsafe');
const FLAG = path.join(DIR, '.first-run');

export async function checkFirstRun(): Promise<boolean> {
  try {
    await fs.access(FLAG);
    return false;
  } catch {
    try {
      await fs.mkdir(DIR, { recursive: true });
      await fs.writeFile(FLAG, new Date().toISOString(), 'utf8');
    } catch {}
    return true;
  }
}
