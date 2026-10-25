// "Remember this device" for 2-step login.
//
// After a correct code, the backend gives this browser a token. We keep
// it in a cookie (not localStorage), because Sign Out clears
// localStorage - and we want the browser to stay remembered even after
// signing out or closing the system by mistake.
//
// The token is sent with the next sign-in. If it's still valid, the
// backend signs the user in without asking for a new code.

const COOKIE_NAME = 'glomax_trusted_devices';
const MAX_TOKENS = 5; // a shared computer may remember a few accounts
const KEEP_DAYS = 365; // the backend decides when a token really expires

function readCookie() {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!match) return [];
  try {
    const list = JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')));
    return Array.isArray(list) ? list.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function writeCookie(list) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  const value = encodeURIComponent(JSON.stringify(list));
  document.cookie = `${COOKIE_NAME}=${value}; Max-Age=${KEEP_DAYS * 24 * 60 * 60}; Path=/; SameSite=Lax${secure}`;
}

// All remembered-device tokens saved in this browser
export function getTrustedTokens() {
  return readCookie();
}

// Saves a new token from the backend (newest first)
export function saveTrustedToken(token) {
  if (!token) return;
  const list = [token, ...readCookie().filter((t) => t !== token)].slice(0, MAX_TOKENS);
  writeCookie(list);
}

// Makes this browser ask for a code again on the next sign-in
export function forgetThisDevice() {
  document.cookie = `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}