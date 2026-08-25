import client from './client';

export async function submitInquiry(data) {
  const response = await client.post('/inquiries/', data);
  return response.data;
}

export async function getInquiries() {
  const response = await client.get('/inquiries/staff/');
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
// endpoints are unauthenticated - no JWT token exists for a customer
// with no account, so the shared client's auth header logic doesn't
// apply here.
//
// The API base URL is built dynamically from window.location.hostname
// instead of being hard-coded, so this page works correctly whether
// it's opened as http://localhost:5173 (on the same computer) or
// http://192.168.x.x:5173 (from a phone on the same network) -
// whatever hostname the browser actually used to reach this page is
// the same one it should use to reach the Django backend, since
// they're running on the same machine.

import axios from 'axios';

const API_BASE_URL = `http://${window.location.hostname}:8000/api`;

export async function getPublicInquiryThread(token) {
  const response = await axios.get(`${API_BASE_URL}/inquiries/public/${token}/`);
  return response.data;
}

export async function sendPublicInquiryReply(token, content) {
  const response = await axios.post(`${API_BASE_URL}/inquiries/public/${token}/`, { content });
  return response.data;
}