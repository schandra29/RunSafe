import path from 'path';

export function getUadoDir(): string {
  return process.env.UADO_DIR || path.join(process.cwd(), '.uado');
}
