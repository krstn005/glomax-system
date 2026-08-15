
import apiClient from './client';

// Submits feedback for a specific ticket. Only allowed once that ticket is APPROVED.
// ⚠️ Verify this URL and field names match your real finalsheet app endpoint.
export async function submitFeedback(ticketId, { rating, comment }) {
  const response = await apiClient.post(`/tickets/${ticketId}/feedback/`, {
    rating,
    comment,
  });
  return response.data;
}