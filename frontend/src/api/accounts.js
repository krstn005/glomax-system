import apiClient from "./client";

// Workers table listing (Admin only)
export async function getWorkers() {
  const res = await apiClient.get("/accounts/manage/partner-installers/");
  return res.data;
}

// Add Worker form - creates a new Partner Installer account.
// Backend accepts: username, full_name, email, phone_number.
// No password is sent: the worker gets an email link and sets their own.
// (If a password is sent, the account uses it and no email is sent.)
export async function addWorker(data) {
  const res = await apiClient.post("/accounts/manage/partner-installers/", data);
  return res.data;
}

// Deactivate / Reactivate toggle button
export async function toggleWorkerActive(id) {
  const res = await apiClient.patch(`/accounts/manage/${id}/toggle-active/`);
  return res.data;
}

// Credentials modal - Admin sets a new password for a worker's account.
// This is now the backup way. There is no way to view an existing
// password (Django never stores real passwords, only a one-way
// scrambled version) - this always sets a brand new one.
export async function setWorkerPassword(id, newPassword) {
  const res = await apiClient.patch(`/accounts/manage/${id}/set-password/`, {
    new_password: newPassword,
  });
  return res.data;
}

// Credentials modal - emails the worker a one-time link so they can
// create their own password. Admin never sees it.
export async function sendWorkerPasswordLink(id) {
  const res = await apiClient.post(`/accounts/manage/${id}/send-password-link/`);
  return res.data;
}

// Set Password page (public) - checks the emailed link is still good
export async function checkPasswordSetup(token) {
  const res = await apiClient.get("/accounts/password-setup/check/", { params: { token } });
  return res.data;
}

// Set Password page (public) - saves the password the worker chose
export async function completePasswordSetup(token, newPassword) {
  const res = await apiClient.post("/accounts/password-setup/complete/", {
    token,
    new_password: newPassword,
  });
  return res.data;
}