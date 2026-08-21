import client from './client';

export async function getPaymentTerms() {
  const response = await client.get('/pricing/payment-terms/');
  return response.data;
}

export async function sendQuotation(ticketId, data) {
  const response = await client.post(`/tickets/${ticketId}/quotations/`, data);
  return response.data;
}

export async function getPriceHistory() {
  const response = await client.get('/pricing/price-history/');
  return response.data;
}