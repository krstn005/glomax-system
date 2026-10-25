import apiClient from './client';

// Submits feedback for a specific ticket. Only allowed once that ticket is APPROVED.
export async function submitFeedback(ticketId, { rating, comments, highlights }) {
  const response = await apiClient.post(`/tickets/${ticketId}/feedback/`, {
    rating,
    comments,
    highlights,
  });
  return response.data;
}