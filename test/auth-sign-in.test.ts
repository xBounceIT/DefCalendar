import { PromptValue } from '../src/main/auth/msal-runtime';
import { getSignInPrompt, normalizeMicrosoftSignInError } from '../src/main/auth/auth-sign-in';
import {
  EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE,
  EXCHANGE365_REPLY_URL_NOT_CONFIGURED_MESSAGE,
} from '../src/shared/exchange-auth';
import { describe, expect, it } from 'vitest';

describe('auth sign-in helpers', () => {
  it('maps sign-in modes to the expected MSAL prompts', () => {
    expect(getSignInPrompt('user')).toBe(PromptValue.SELECT_ACCOUNT);
    expect(getSignInPrompt('admin_consent')).toBe(PromptValue.CONSENT);
  });

  it('normalizes consent failures into the admin approval message', () => {
    const error = normalizeMicrosoftSignInError(
      new Error('AADSTS65001: User or administrator has not consented to use the application.'),
    );

    expect(error.message).toBe(EXCHANGE365_ADMIN_APPROVAL_REQUIRED_MESSAGE);
  });

  it('normalizes missing reply URL failures into the localhost registration message', () => {
    const error = normalizeMicrosoftSignInError(
      new Error('AADSTS500113: No reply address is registered for the application.'),
    );

    expect(error.message).toBe(EXCHANGE365_REPLY_URL_NOT_CONFIGURED_MESSAGE);
  });

  it('passes through non-consent errors', () => {
    const error = normalizeMicrosoftSignInError(new Error('Network unavailable'));

    expect(error.message).toBe('Network unavailable');
  });
});
