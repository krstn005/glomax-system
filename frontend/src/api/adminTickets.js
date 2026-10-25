import apiClient from "./client";

// Without a page number, returns the full list (unchanged from before).
export async function getAdminTickets() {
  const res = await apiClient.get("/tickets/staff/");
  return res.data;
}

// With a page number, returns { count, next, previous, results }.
// Optional search runs server-side across ALL tickets, not just the
// current page.
export async function getAdminTicketsPage(page = 1, status = null, search = null) {
  const params = new URLSearchParams({ page });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const res = await apiClient.get(`/tickets/staff/?${params.toString()}`);
  return res.data;
}

export async function exportReportsPdf() {
  const res = await apiClient.get("/tickets/reports/pdf/", { responseType: "blob" });
  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "glomax-reports.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}