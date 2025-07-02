export default {
codex/create-jest-test-suite-for-diff-feature-in-runsafe-cli
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
      tsconfig: { esModuleInterop: true },
    },
  },
  transform: {},
  moduleNameMapper: {},

  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  testMatch: ['**/__tests__/**/*.test.ts'],
};
