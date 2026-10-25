import apiClient from './client';
import { saveTrustedToken } from '../utils/trustedDevice';

// 2-step login methods (must match the backend)
export const TWO_FACTOR_METHODS = {
  SMS: 'SMS',
  EMAIL: 'EMAIL',
};

// ----- During sign-in (no access token yet) -----

// Check the 6-digit code (or a backup code). Returns the real tokens.
// rememberDevice: true = don't ask for a code again on this browser
export async function verifyTwoFactor(challengeToken, code, rememberDevice = false) {
  const res = await apiClient.post('/accounts/2fa/verify/', {
    challenge_token: challengeToken,
    code,
    remember_device: rememberDevice,
  });
  saveTrustedToken(res.data.trusted_device_token);
  return res.data;
}

// Send a new code by SMS or email (sign-in screen or first-time setup).
// Returns { detail, resend_wait, phone_hint or email_hint }
export async function resendTwoFactorCode(challengeToken) {
  const res = await apiClient.post('/accounts/2fa/resend/', {
    challenge_token: challengeToken,
  });
  return res.data;
}

// First-time setup: method is 'SMS' or 'EMAIL'.
// For SMS, send the mobile number (leave it empty to use the number
// already on the account). If the backend answers with needs_phone,
// ask the user to type their mobile number.
export async function startTwoFactorSetup(challengeToken, method, phone) {
  const body = { challenge_token: challengeToken, method };
  if (phone) body.phone = phone;
  const res = await apiClient.post('/accounts/2fa/setup/start/', body);
  return res.data;
}

// First-time setup: returns the real tokens + backup_codes
// rememberDevice: true = don't ask for a code again on this browser
export async function confirmTwoFactorSetup(challengeToken, code, rememberDevice = false) {
  const res = await apiClient.post('/accounts/2fa/setup/confirm/', {
    challenge_token: challengeToken,
    code,
    remember_device: rememberDevice,
  });
  saveTrustedToken(res.data.trusted_device_token);
  return res.data;
}

// ----- Settings > Security (already signed in) -----

export async function getTwoFactorStatus() {
  const res = await apiClient.get('/accounts/2fa/status/');
  return res.data;
}

// Change the method: 'SMS' or 'EMAIL'. For SMS you can pass a new
// mobile number.
export async function startTwoFactorChange(method, phone) {
  const body = { method };
  if (phone) body.phone = phone;
  const res = await apiClient.post('/accounts/2fa/change/start/', body);
  return res.data;
}

export async function confirmTwoFactorChange(code) {
  const res = await apiClient.post('/accounts/2fa/change/confirm/', { code });
  return res.data;
}

// Sends a code (by SMS or email) before making new backup codes
export async function sendTwoFactorCode() {
  const res = await apiClient.post('/accounts/2fa/send-code/');
  return res.data;
}

export async function regenerateBackupCodes(code) {
  const res = await apiClient.post('/accounts/2fa/backup-codes/', { code });
  return res.data;
}

// ----- Admin -----

export async function adminResetTwoFactor(userId) {
  const res = await apiClient.post(`/accounts/manage/${userId}/reset-2fa/`);
  return res.data;
}

// Saves the tokens after a successful sign-in (same keys as before)
export function saveSession(data) {
  localStorage.setItem('access_token', data.access);
  localStorage.setItem('refresh_token', data.refresh);
  localStorage.setItem('role', data.role);
  localStorage.setItem('username', data.username);
  if (data.user_id !== undefined && data.user_id !== null) {
    localStorage.setItem('user_id', data.user_id);
  }
}

// Turns an API error into one readable sentence
export function getApiError(err, fallback = 'Something went wrong. Please try again.') {
  if (!err?.response) {
    return "Can't reach the server right now. Please check your connection and try again.";
  }
  return err.response.data?.detail || fallback;
}

// How many seconds to wait before "Resend code" works again.
// Uses the backend's answer; falls back to 60 for SMS and 30 for email.
export function getResendWait(data, method) {
  const wait = Number(data?.resend_wait ?? data?.wait);
  if (Number.isFinite(wait) && wait > 0) return wait;
  return method === TWO_FACTOR_METHODS.SMS ? 60 : 30;
}