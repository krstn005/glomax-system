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

// Creates a new ticket (Submit Schedule Request).
// If the customer's latest ticket was Withdrawn or Not Compatible -
// Can Reapply, the backend reuses that same ticket instead of making
// a new one. The response then has reapplied: true.
export async function createTicket(payload) {
  const response = await apiClient.post('/tickets/', payload);
  return response.data;
}

// Reapplies using an old ticket (same ticket number). Only works while
// it's Withdrawn or Not Compatible - Can Reapply. Fields left out of
// payload keep their old values.
export async function reapplyTicket(ticketId, payload = {}) {
  const response = await apiClient.post(`/tickets/${ticketId}/reapply/`, payload);
  return response.data;
}

// Requests a new visit date. Only works while status is
// PI_ASSIGNED, and only if no pending request already exists.
export async function requestReschedule(ticketId, payload) {
  const response = await apiClient.post(`/tickets/${ticketId}/reschedule/`, payload);
  return response.data;
}

// Downloads the Final Sheet PDF for an approved ticket and triggers
// a browser file download. Only works once the ticket has a Final
// Sheet (status APPROVED or COMPLETED).
export async function downloadFinalSheetPDF(ticketId, ticketNumber) {
  const response = await apiClient.get(`/tickets/${ticketId}/final-sheet/pdf/`, {
    responseType: 'blob',
  });

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', `${ticketNumber}-final-sheet.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}

// Downloads the Completion Certificate PDF. Only works once the
// ticket's status is COMPLETED.
export async function downloadCompletionCertificatePDF(ticketId, ticketNumber) {
  const response = await apiClient.get(`/tickets/${ticketId}/completion-certificate/pdf/`, {
    responseType: 'blob',
  });

  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', `${ticketNumber}-completion-certificate.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}