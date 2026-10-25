/*
  Each portal has its own web address (domain).

    Customer           -> http://localhost:5173            (online: https://glomaxsolar.me)
    Staff              -> http://staff.localhost:5173      (online: https://staff.glomaxsolar.me)
    Partner Installer  -> http://installer.localhost:5173  (online: https://installer.glomaxsolar.me)
    Admin              -> http://admin.localhost:5173      (online: https://admin.glomaxsolar.me)

  The addresses come from the frontend .env file (VITE_..._URL). The
  values below are only used when the .env file doesn't set them.

  If the app is opened on an address that isn't in this list (for
  example http://192.168.1.17:5173 from a phone on the same Wi-Fi),
  every portal still works from that one address, just like before.
*/

const DEFAULT_URLS = {
  CUSTOMER: 'http://localhost:5173',
  STAFF: 'http://staff.localhost:5173',
  PARTNER_INSTALLER: 'http://installer.localhost:5173',
  ADMIN: 'http://admin.localhost:5173',
};

// Removes a trailing "/" so we can safely add paths later
function cleanUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

export const PORTAL_URLS = {
  CUSTOMER: cleanUrl(import.meta.env.VITE_CUSTOMER_URL) || DEFAULT_URLS.CUSTOMER,
  STAFF: cleanUrl(import.meta.env.VITE_STAFF_URL) || DEFAULT_URLS.STAFF,
  PARTNER_INSTALLER: cleanUrl(import.meta.env.VITE_INSTALLER_URL) || DEFAULT_URLS.PARTNER_INSTALLER,
  ADMIN: cleanUrl(import.meta.env.VITE_ADMIN_URL) || DEFAULT_URLS.ADMIN,
};

// Turn it off completely with VITE_SPLIT_PORTALS=false in the .env file
const SPLIT_ENABLED = String(import.meta.env.VITE_SPLIT_PORTALS ?? 'true').toLowerCase() !== 'false';

// "staff.localhost:5173" from "http://staff.localhost:5173"
function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

function findCurrentPortal() {
  if (!SPLIT_ENABLED || typeof window === 'undefined') return null;
  const here = window.location.host.toLowerCase();
  const match = Object.entries(PORTAL_URLS).find(([, url]) => hostOf(url) === here);
  return match ? match[0] : null;
}

// Which portal this address belongs to: 'CUSTOMER', 'STAFF',
// 'PARTNER_INSTALLER', 'ADMIN', or null (all portals on one address)
export const CURRENT_PORTAL = findCurrentPortal();

// true when each portal is on its own address
export function isSplitMode() {
  return CURRENT_PORTAL !== null;
}

// true if this role's pages can open on the current address
export function isOnPortal(role) {
  return CURRENT_PORTAL === null || CURRENT_PORTAL === role;
}

// Full link to a page on another portal, e.g.
// portalLink('STAFF', '/staff-login') -> 'http://staff.localhost:5173/staff-login'
// When all portals share one address, it stays a normal path.
export function portalLink(role, path = '/') {
  if (!isSplitMode()) return path;
  const base = PORTAL_URLS[role] || PORTAL_URLS.CUSTOMER;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}