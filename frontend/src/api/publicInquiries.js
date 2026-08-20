import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000/api';

// Separate, plain axios instance (not the shared `client`) since these
// calls are public - no login, no Authorization header, no token
// refresh logic needed.
const publicClient = axios.create({
  baseURL: API_BASE_URL,
});

export async function getPublicInquiry(accessToken) {
  const response = await publicClient.get(`/inquiries/public/${accessToken}/`);
  return response.data;
}

export async function getPublicMessages(accessToken) {
  const response = await publicClient.get(`/inquiries/public/${accessToken}/messages/`);
  return response.data;
}

export async function sendPublicMessage(accessToken, body) {
  const response = await publicClient.post(`/inquiries/public/${accessToken}/messages/`, { body });
  return response.data;
}