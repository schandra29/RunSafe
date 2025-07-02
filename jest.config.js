export default {
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
  testMatch: ['**/__tests__/**/*.test.ts'],
};
