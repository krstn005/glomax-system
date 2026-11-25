import apiClient from "./client";

// Returns tickets assigned to the logged-in Partner Installer.
// Optional status filter, e.g. getInstallerTickets("PI_ASSIGNED")
export async function getInstallerTickets(statusFilter) {
  const params = statusFilter ? { status: statusFilter } : {};
  const res = await apiClient.get("/tickets/installer/", { params });
  return res.data;
}

// Works out the roof result from the site data (the "Calculate" button on
// the Assessment Sheet). Nothing is saved. Send JSON like:
// { roof_outline: [[lat, lng], ...], roof_tilt_degrees, roof_direction,
//   shading_level, roof_condition, monthly_bill, system_type }
export async function previewRoofAssessment(ticketId, data) {
  const res = await apiClient.post(`/assessments/tickets/${ticketId}/preview/`, data);
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

// Marks an Approved ticket's installation as physically complete.
// formData must be a FormData instance including one or more
// "photos" files as proof of completion.
export async function completeInstallation(ticketId, formData) {
  const res = await apiClient.patch(`/tickets/${ticketId}/complete/`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

// PI Calendar page - returns every one of this PI's own tickets with
// a scheduled visit in the given month (month is 1-12, not 0-11).
export async function getInstallerCalendarTickets(month, year) {
  const params = new URLSearchParams({ month, year });
  const res = await apiClient.get(`/tickets/installer/calendar/?${params.toString()}`);
  return res.data;
}