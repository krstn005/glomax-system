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