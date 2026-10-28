import client from './client';

export async function submitInquiry(data) {
  const response = await client.post('/inquiries/', data);
  return response.data;
}

export async function getInquiries() {
  const response = await client.get('/inquiries/staff/');
  return response.data;
}

// Paginated version for the Email Inquiries page. isReplied can be
// true, false, or omitted entirely to get every status.
export async function getInquiriesPage(page = 1, isReplied = null) {
  const params = new URLSearchParams({ page });
  if (isReplied !== null) params.set('is_replied', isReplied);
  const response = await client.get(`/inquiries/staff/?${params.toString()}`);
  return response.data;
}

export async function getInquiryDetail(id) {
  const response = await client.get(`/inquiries/staff/${id}/`);
  return response.data;
}

export async function markInquiryReplied(id) {
  const response = await client.patch(`/inquiries/staff/${id}/mark-replied/`);
  return response.data;
}

export async function sendQuotationEmail(id, quotationData) {
  const response = await client.post(`/inquiries/staff/${id}/send-quotation/`, quotationData);
  return response.data;
}

// --- Staff-side conversation thread ---

export async function getInquiryMessages(id) {
  const response = await client.get(`/inquiries/staff/${id}/messages/`, {
    params: { _t: Date.now() },
  });
  return response.data;
}

export async function sendInquiryReply(id, content) {
  const response = await client.post(`/inquiries/staff/${id}/messages/`, { content });
  return response.data;
}

// --- Public, no-login reply-link thread (customer side) ---
// Uses a plain axios call (not the shared client) since these
// endpoints are unauthenticated - a customer with no account has no
// login token, so the shared client's auth logic does not apply here.
//
// The address of the backend comes from VITE_API_URL, the same
// setting the rest of the app uses. Online it is
// https://api.glomaxsolar.me/api. If it is not set (local testing
// only), it uses the same computer name the page was opened with, so
// testing from a phone on the same Wi-Fi still works.

import axios from 'axios';

const API_BASE_URL = String(
  import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000/api`
).replace(/\/+$/, '');

export async function getPublicInquiryThread(token) {
  const response = await axios.get(`${API_BASE_URL}/inquiries/public/${token}/`);
  return response.data;
}

export async function sendPublicInquiryReply(token, content) {
  const response = await axios.post(`${API_BASE_URL}/inquiries/public/${token}/`, { content });
  return response.data;
}