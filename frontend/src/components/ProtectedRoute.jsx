import axios from 'axios';
import { getTrustedTokens } from '../utils/trustedDevice';

// The Django backend address. Set VITE_API_URL in the frontend .env
// file (online it will be something like https://api.glomaxsolar.me/api).
export const API_BASE_URL = String(import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');

const client = axios.create({
  baseURL: API_BASE_URL,
});

// Sign-in requests. A 401 here just means "wrong password", NOT an
// expired session, so they should never trigger the refresh/redirect
// logic below.
const SIGN_IN_PATHS = [
  '/accounts/login/',
  '/accounts/google-login/',
  '/accounts/token/refresh/',
  '/accounts/2fa/verify/',
  '/accounts/2fa/resend/',
  '/accounts/2fa/setup/',
];

function isSignInRequest(config) {
  const url = config?.url || '';
  return SIGN_IN_PATHS.some((path) => url.includes(path));
}

// Everybody now uses the one login page
const LOGIN_PAGES = {
  CUSTOMER: '/login',
  STAFF: '/login',
  PARTNER_INSTALLER: '/login',
  ADMIN: '/login',
};

// Session is over: clear it and go to the login page.
// (The "remember this device" cookie is not touched by this.)
function endSession() {
  const role = localStorage.getItem('role');
  localStorage.clear();
  window.location.href = LOGIN_PAGES[role] || '/login';
}

// The two sign-in requests where a remembered browser can skip the code
const LOGIN_PATHS = ['/accounts/login/', '/accounts/google-login/'];

// Attach the saved access token to every outgoing request, if one exists.
// Sign-in requests don't need it.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token && !isSignInRequest(config)) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  // "Remember this device": send this browser's saved tokens with the
  // sign-in, so the backend can skip the 2-step code if it knows it
  const url = config?.url || '';
  if (config.method === 'post' && LOGIN_PATHS.some((path) => url.includes(path))) {
    const trusted = getTrustedTokens();
    if (trusted.length > 0 && config.data && typeof config.data === 'object' && !(config.data instanceof FormData)) {
      config.data = { ...config.data, trusted_devices: trusted };
    }
  }
  return config;
});

// If a request comes back 401 (expired access token), try to silently get a
// new access token using the refresh token, then retry the original request
// once. The user never sees an error - the page just loads normally.
// If the refresh token is ALSO expired (after 7 days of inactivity), send
// them back to login instead of showing a broken page.
let isRefreshing = false;
let pendingRequests = [];

function resolvePendingRequests(newToken) {
  pendingRequests.forEach((callback) => callback(newToken));
  pendingRequests = [];
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401s, only try this once per request (avoid infinite
    // loops), and never for sign-in requests (see SIGN_IN_PATHS above)
    if (
      error.response?.status !== 401 ||
      originalRequest?._retry ||
      isSignInRequest(originalRequest)
    ) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      // No refresh token at all - nothing we can do, send to login
      endSession();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      // A refresh is already in progress - wait for it instead of firing
      // a second refresh request at the same time
      return new Promise((resolve) => {
        pendingRequests.push((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          resolve(client(originalRequest));
        });
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const response = await axios.post(`${API_BASE_URL}/accounts/token/refresh/`, {
        refresh: refreshToken,
      });
      const newAccessToken = response.data.access;
      localStorage.setItem('access_token', newAccessToken);
      // The backend gives a new refresh token each time (it rotates).
      // Saving it keeps people signed in while they keep using the
      // system, instead of logging them out 7 days after signing in.
      if (response.data.refresh) {
        localStorage.setItem('refresh_token', response.data.refresh);
      }

      resolvePendingRequests(newAccessToken);
      isRefreshing = false;

      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return client(originalRequest);
    } catch (refreshError) {
      // Refresh token itself is expired or invalid - session is truly over
      isRefreshing = false;
      pendingRequests = [];
      endSession();
      return Promise.reject(refreshError);
    }
  }
);

export default client;