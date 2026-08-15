import apiClient from './client';

// Gets all tickets belonging to the logged-in customer.
export async function getMyTickets() {
  const response = await apiClient.get('/tickets/');
  return response.data;
}

// Withdraws a ticket. Only works while status is still REQUEST_SUBMITTED.
export async function withdrawTicket(ticketId) {
  const response = await apiClient.patch(`/tickets/${ticketId}/withdraw/`);
  return response.data;
}

// Creates a new ticket (Submit Schedule Request)
export async function createTicket(payload) {
  const response = await apiClient.post('/tickets/', payload);
  return response.data;
}