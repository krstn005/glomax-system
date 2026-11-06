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

// reapplyDays is only used for NOT_COMPATIBLE_CAN_REAPPLY: how many days from
// today until the customer can reapply (0 = right away, default 30 on the server).
// reason is required for both Not Compatible choices.
export async function submitDecision(ticketId, decision, reapplyDays = null, reason = null) {
  const body = { decision };
  if (reapplyDays !== null && reapplyDays !== undefined) body.reapply_days = Number(reapplyDays);
  if (reason) body.reason = reason;
  const res = await apiClient.patch(`/tickets/${ticketId}/decision/`, body);
  return res.data;
}

// Staff changes the date the customer can start reapplying (days from today).
export async function enableReapply(ticketId, reapplyDays = 30) {
  const res = await apiClient.patch(`/tickets/${ticketId}/enable-reapply/`, {
    reapply_days: Number(reapplyDays),
  });
  return res.data;
}

export async function getStaffTicketsPage(page = 1, status = null, search = null) {
  const params = new URLSearchParams({ page });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const res = await apiClient.get(`/tickets/staff/?${params.toString()}`);
  return res.data;
}

export async function getAssessmentReviewPage(page = 1, tab = 'NEEDS_REVIEW', search = null) {
  const params = new URLSearchParams({ page, has_assessment: 'true' });
  if (tab === 'NEEDS_REVIEW') {
    params.set('status', 'ASSESSMENT_SUBMITTED,STAFF_REVIEW');
    params.set('ordering', 'oldest_assessment');
  }
  if (search) params.set('search', search);
  const res = await apiClient.get(`/tickets/staff/?${params.toString()}`);
  return res.data;
}

// Staff's Approve/Decline action on a pending reschedule request.
export async function resolveRescheduleRequest(ticketId, rescheduleId, decision, staffResponseNote = '') {
  const res = await apiClient.patch(`/tickets/${ticketId}/reschedule/${rescheduleId}/`, {
    decision,
    staff_response_note: staffResponseNote,
  });
  return res.data;
}

// Staff Calendar page - returns every ticket with a scheduled visit
// in the given month (month is 1-12, not 0-11).
export async function getStaffCalendarTickets(month, year) {
  const params = new URLSearchParams({ month, year });
  const res = await apiClient.get(`/tickets/staff/calendar/?${params.toString()}`);
  return res.data;
}