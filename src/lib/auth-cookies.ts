process.env.NEXTAUTH_URL ??= process.env.VOIDKOI_NEXTAUTH_URL;

const useSecureCookies = (process.env.VOIDKOI_NEXTAUTH_URL ?? '').startsWith('https://');

/** Over https, every cookie is __Host-: bound to this exact host, so a sibling subdomain can't set or replace one. */
const hostPrefix = useSecureCookies ? '__Host-' : '';

export const sessionCookieName = `${hostPrefix}voidkoi.session-token`;
export const callbackCookieName = `${hostPrefix}voidkoi.callback-url`;
export const csrfCookieName = `${hostPrefix}voidkoi.csrf-token`;

/** Set by the sign-in page when someone agrees to a new account, for the sign-in that follows. */
export const newAccountCookieName = `${hostPrefix}voidkoi.new-account`;

export const baseCookieOptions = {
  sameSite: 'lax' as const,
  path: '/',
  secure: useSecureCookies,
};
