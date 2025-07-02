export const ErrorCodes = Object.freeze({
  INVALID_EPIC: 'E001',
  FILE_READ_FAIL: 'E002',
  WRITE_FAIL: 'E003',
  UNSUPPORTED_EDIT: 'E004',
  COOLDOWN_ACTIVE: 'E005',
  VALIDATION_REJECTED: 'E006',
} as const);
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
