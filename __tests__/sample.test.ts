import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "bun:test";
import { setupTestFile } from "./testSetup.ts";
setupTestFile(import.meta.url);
it('RunSafe test system works', () => {
  expect(1 + 1).toBe(2);
});
