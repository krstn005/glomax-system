import apiClient from "./client";

export async function approveTicket(ticketId, data) {
  const res = await apiClient.patch(`/tickets/${ticketId}/approve/`, data);
  return res.data;
}

export async function returnForRevision(ticketId, notes) {
  const res = await apiClient.patch(`/tickets/${ticketId}/return-for-revision/`, { notes });
  return res.data;
}