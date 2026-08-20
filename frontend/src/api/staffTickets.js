import apiClient from "./client";

export async function getStaffTickets() {
  const res = await apiClient.get("/tickets/staff/");
  return res.data;
}

export async function getPartnerInstallers() {
  const res = await apiClient.get("/accounts/partner-installers/");
  return res.data;
}

export async function assignPartnerInstaller(ticketId, data) {
  const res = await apiClient.patch(`/tickets/${ticketId}/assign/`, data);
  return res.data;
}