// Helper to parse epic markdown files

export interface FileEdit {
  filePath: string;
  type: 'replace' | 'insert-before' | 'insert-after' | 'delete';
  target: string[];
  replacement?: string[];
}

export interface Epic {
  summary: string;
  edits: FileEdit[];
}

function splitSections(md: string): { summary: string; editsSection: string } {
  const summaryMatch = md.match(/Summary\n([\s\S]*?)(?:\n#+\s*|\nFile Edits|$)/i);
  const summary = summaryMatch ? summaryMatch[1].trim() : '';

  const fileEditsIndex = md.indexOf('File Edits');
  const editsSection = fileEditsIndex !== -1 ? md.slice(fileEditsIndex + 'File Edits'.length).trim() : '';

  return { summary, editsSection };
}

export function parseEpic(md: string): Epic {
  const { summary, editsSection } = splitSections(md);
  const lines = editsSection.split(/\r?\n/);
  const edits: FileEdit[] = [];
  let i = 0;
  while (i < lines.length) {
    let filePath = lines[i]?.trim();
    if (!filePath) { i++; continue; }
    // ignore stray labels
    if (['yaml', 'Copy', 'Edit'].includes(filePath)) { i++; continue; }
    i++;
    const type = (lines[i] || '').trim() as FileEdit['type'];
    if (!type) { break; }
    i++;
    const target: string[] = [];
    while (i < lines.length && lines[i].trim() !== 'with' && lines[i].trim() !== '') {
      target.push(lines[i]);
      i++;
    }
    let replacement: string[] | undefined;
    if (type !== 'delete') {
      // skip blank lines until 'with'
      while (i < lines.length && lines[i].trim() !== 'with') { i++; }
      if (lines[i] && lines[i].trim() === 'with') i++;
      replacement = [];
      while (i < lines.length && lines[i].trim() !== '') {
        replacement.push(lines[i]);
        i++;
      }
    }
    // skip any remaining blank lines
    while (i < lines.length && lines[i].trim() === '') i++;
    edits.push({ filePath, type, target, replacement });
  }
  return { summary, edits };
}
