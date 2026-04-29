import { describe, expect, it } from 'vitest';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from '@/modules/auth/auth.schema';

describe('auth.schema — input validation', () => {
  it('rejects logins without email', () => {
    expect(() => loginBodySchema.parse({ password: 'x' })).toThrow();
  });

  it('rejects logins with malformed email', () => {
    expect(() => loginBodySchema.parse({ email: 'nope', password: 'x' })).toThrow();
  });

  it('lowercases + trims emails', () => {
    const r = loginBodySchema.parse({
      email: '  Magnus@AfriZoneMart.com  ',
      password: 'pw',
    });
    expect(r.email).toBe('magnus@afrizonemart.com');
  });

  it('register requires 8+ char password', () => {
    expect(() =>
      registerBodySchema.parse({ email: 'x@y.co', password: '1234567' }),
    ).toThrow();
    expect(
      registerBodySchema.parse({ email: 'x@y.co', password: '12345678' }).password,
    ).toBe('12345678');
  });

  it('forgot-password accepts only email', () => {
    expect(() => forgotPasswordBodySchema.parse({})).toThrow();
    expect(forgotPasswordBodySchema.parse({ email: 'x@y.co' })).toEqual({
      email: 'x@y.co',
    });
  });

  it('reset-password requires token + 8+ char password', () => {
    expect(() =>
      resetPasswordBodySchema.parse({ token: 'short', password: '12345678' }),
    ).toThrow();
    expect(() =>
      resetPasswordBodySchema.parse({
        token: '0123456789abcdefghij0123',
        password: 'short',
      }),
    ).toThrow();
  });
});
