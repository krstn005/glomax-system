import client from './client';

export async function submitInquiry(data) {
  const response = await client.post('/inquiries/', data);
  return response.data;
}