import { beforeAll, afterAll, it as bunIt } from "bun:test";

export function setupTestFile(file: string): void {
  beforeAll(() => {
    console.log("🥐 Running Bun tests...");
  });

  let ran = false;

  (globalThis as any).it = ((name: any, fn?: any, timeout?: number) => {
    ran = true;
    return bunIt(name, fn, timeout);
  }) as typeof bunIt;

  afterAll(() => {
    if (!ran) {
      console.warn(`⚠️  No tests executed in ${file}`);
    }
    (globalThis as any).it = bunIt;
  });
}
