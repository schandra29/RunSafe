// Chain runner for executing multiple epics
import { promises as fs } from 'fs';
import path from 'path';
import { load as loadYaml } from 'js-yaml';
import { logBanner, logError, logWarn, logSuccessFinal } from '../utils/logger.js';
import { applyEpic } from './apply.js';

interface ChainItem {
  file: string;
  dryRun?: boolean;
  atomic?: boolean;
}

interface ChainFile {
  chain: ChainItem[];
}

function parseYaml(content: string): ChainFile | null {
  try {
    const data = loadYaml(content) as any;
    if (!data || !Array.isArray(data.chain)) return null;
    const chain: ChainItem[] = [];
    for (const item of data.chain) {
      if (!item || typeof item.file !== 'string') return null;
      const entry: ChainItem = { file: item.file };
      if (item.dryRun !== undefined) entry.dryRun = !!item.dryRun;
      if (item.atomic !== undefined) entry.atomic = !!item.atomic;
      chain.push(entry);
    }
    return { chain };
  } catch {
    return null;
  }
}

export async function runChains(): Promise<void> {
  const chainPath = path.join(process.cwd(), 'uado.chain.yml');
  let yamlStr: string;
  try {
    yamlStr = await fs.readFile(chainPath, 'utf8');
  } catch {
    logWarn('⚠️ No chain file found. Expected: ./uado.chain.yml');
    return;
  }

  const parsed = parseYaml(yamlStr);
  if (!parsed) {
    logError('Malformed chain file.');
    return;
  }

  const files = parsed.chain.map(c => c.file);

  // Validate files exist
  for (const f of files) {
    const p = path.resolve(process.cwd(), f);
    try {
      await fs.access(p);
    } catch {
      logError(`Chain file missing: ${f}`);
      return;
    }
  }

  const banner = `⛓️ Executing epic chain: [${files.join(' → ')}]`;
  logBanner(banner);

  for (const item of parsed.chain) {
    try {
      await applyEpic(item.file, { dryRun: item.dryRun, atomic: item.atomic });
    } catch (err: any) {
      logError(`Chain failed at ${item.file}`);
      return;
    }
  }

  logSuccessFinal('Chain completed successfully.');
}
