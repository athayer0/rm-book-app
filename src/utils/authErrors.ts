import type { TFunction } from 'i18next';

/** Supabase Auth error codes this app can hit, mapped to a plain-language key. */
const CODE_KEYS: Record<string, string> = {
  invalid_credentials: 'authErrors.invalidCredentials',
  user_already_exists: 'authErrors.userAlreadyExists',
  email_exists: 'authErrors.userAlreadyExists',
  identity_already_exists: 'authErrors.userAlreadyExists',
  user_not_found: 'authErrors.userNotFound',
  email_not_confirmed: 'authErrors.emailNotConfirmed',
  email_address_invalid: 'authErrors.invalidEmail',
  email_address_not_authorized: 'authErrors.invalidEmail',
  weak_password: 'authErrors.weakPassword',
  same_password: 'authErrors.samePassword',
  otp_expired: 'authErrors.codeExpired',
  signup_disabled: 'authErrors.signupDisabled',
  user_banned: 'authErrors.userBanned',
  over_email_send_rate_limit: 'authErrors.rateLimited',
  over_request_rate_limit: 'authErrors.rateLimited',
  over_sms_send_rate_limit: 'authErrors.rateLimited',
  session_expired: 'authErrors.sessionExpired',
  refresh_token_not_found: 'authErrors.sessionExpired',
};

/**
 * Turns a Supabase AuthError (or an OAuth-flow throw, which may just be a
 * plain Error) into copy a user can act on, rather than the raw
 * error.message Supabase/Google/Apple hand back.
 */
export function authErrorMessage(error: unknown, t: TFunction): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  if (typeof code === 'string' && CODE_KEYS[code]) {
    return t(CODE_KEYS[code]);
  }
  const message = error instanceof Error ? error.message : '';
  if (/network|fetch/i.test(message)) {
    return t('authErrors.network');
  }
  return t('authErrors.generic');
}
