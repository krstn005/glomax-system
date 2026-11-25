import client from './client';

// Public chat box on the website. Nothing is saved.
export async function askChatbot(message) {
  const response = await client.post('/inquiries/chatbot/ask/', { message });
  return response.data;
}

// Admin: manage the FAQ list the chatbot uses
export async function getFaqs() {
  const response = await client.get('/inquiries/admin/faqs/');
  return response.data;
}

export async function createFaq(data) {
  const response = await client.post('/inquiries/admin/faqs/', data);
  return response.data;
}

export async function updateFaq(id, data) {
  const response = await client.patch(`/inquiries/admin/faqs/${id}/`, data);
  return response.data;
}

export async function deleteFaq(id) {
  await client.delete(`/inquiries/admin/faqs/${id}/`);
}

export async function loadDefaultFaqs() {
  const response = await client.post('/inquiries/admin/faqs/load-defaults/');
  return response.data;
}