import apiClient from '../api/client';

// Turns a photo link from the backend into a full link the browser can open.
// Example: "/media/profile_pictures/me.jpg" becomes
// "http://127.0.0.1:8000/media/profile_pictures/me.jpg".
// Links that already start with http:// or https:// are left as they are.
export function toMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, apiClient.defaults.baseURL).href;
  } catch {
    return url;
  }
}