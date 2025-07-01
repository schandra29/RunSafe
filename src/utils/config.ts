// Configuration loader for RunSafe

import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

export interface RunSafeConfig {
  [key: string]: unknown;
}

async function readJSON(filePath: string): Promise<RunSafeConfig> {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export async function loadConfig(): Promise<RunSafeConfig> {
  const cwdFile = path.join(process.cwd(), '.runsaferc.json');
  const homeFile = path.join(os.homedir(), '.runsaferc.json');

  const homeConfig = await readJSON(homeFile);
  const cwdConfig = await readJSON(cwdFile);

  return { ...homeConfig, ...cwdConfig };
}
