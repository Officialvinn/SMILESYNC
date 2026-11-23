import { describe, expect, it } from 'vitest';
import { describeError } from '../api';

describe('describeError (FR 8.1 form feedback)', () => {
  it('names the field and the rule instead of "Invalid request"', () => {
    const msg = describeError(
      { error: 'Invalid request', details: [{ path: ['username'], message: 'Use 3-64 lowercase letters, digits, dot, dash or underscore' }] },
      400,
    );
    expect(msg).toBe('Username: Use 3-64 lowercase letters, digits, dot, dash or underscore');
  });
  it('falls back to the server error, then the status', () => {
    expect(describeError({ error: 'That username or CHW code is already used' }, 409)).toBe('That username or CHW code is already used');
    expect(describeError(null, 500)).toBe('Request failed (500)');
  });
});
