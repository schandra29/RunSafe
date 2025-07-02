export interface SchemaResult {
  valid: boolean;
  errors?: string[];
}

export function validateSchema(epic: any): SchemaResult {
  if (typeof epic !== 'object' || epic === null) {
    return { valid: false, errors: ['Epic must be an object'] };
  }
  if (typeof epic.summary !== 'string') {
    return { valid: false, errors: ['Missing summary'] };
  }
  if (!Array.isArray(epic.edits)) {
    return { valid: false, errors: ['Missing edits'] };
  }
  return { valid: true };
}
