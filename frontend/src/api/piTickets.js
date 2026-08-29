import apiClient from "./client";

// Returns tickets assigned to the logged-in Partner Installer.
// Optional status filter, e.g. getInstallerTickets("PI_ASSIGNED")
export async function getInstallerTickets(statusFilter) {
  const params = statusFilter ? { status: statusFilter } : {};
  const res = await apiClient.get("/tickets/installer/", { params });
  return res.data;
}

// Submits the Roof Assessment Digital Form (Assessment Sheet's
// "Review and Submit" button). formData must be a FormData instance
// including 1-2 "photos" files, since this is multipart/form-data.
export async function submitAssessment(ticketId, formData) {
  const res = await apiClient.post(`/assessments/tickets/${ticketId}/submit/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}