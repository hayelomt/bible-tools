import { signupRequestSchema } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { ApiRequestError, NetworkError } from './api.ts';
import { authErrorMessage, fieldErrors } from './auth-messages.ts';

const apiError = (errorCode: string, details?: unknown) =>
  new ApiRequestError(400, errorCode, 'from the server', details);

describe('authErrorMessage', () => {
  it('says how long a lockout lasts, in minutes', () => {
    expect(authErrorMessage(apiError('ACCOUNT_LOCKED', { retryAfterSeconds: 900 }))).toBe(
      'Too many tries. Wait 15 minutes, or reset your password.',
    );
    expect(authErrorMessage(apiError('ACCOUNT_LOCKED', { retryAfterSeconds: 30 }))).toBe(
      'Too many tries. Wait 1 minute, or reset your password.',
    );
  });

  it('never says whether the email or the password was wrong', () => {
    expect(authErrorMessage(apiError('INVALID_CREDENTIALS'))).toBe(
      'The email or password is wrong.',
    );
  });

  it('keeps offline calm, and anything unknown generic', () => {
    expect(authErrorMessage(new NetworkError(null))).toMatch(/notes keep working offline/);
    expect(authErrorMessage(apiError('SOMETHING_NEW'))).toBe('Something went wrong. Try again.');
    expect(authErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
  });
});

describe('fieldErrors', () => {
  const messages = { email: 'Bad email.', password: 'Too short.' };

  it('gives each field with a problem its message', () => {
    expect(
      fieldErrors(signupRequestSchema, { email: 'nope', password: 'short' }, messages),
    ).toEqual(messages);
    expect(
      fieldErrors(
        signupRequestSchema,
        { email: ' you@example.com ', password: 'long enough!' },
        messages,
      ),
    ).toEqual({});
  });

  it('leaves out fields without a message', () => {
    expect(
      fieldErrors(signupRequestSchema, { email: 'nope', password: 'short' }, { email: 'Bad.' }),
    ).toEqual({ email: 'Bad.' });
  });
});
