import apiClient from "./client";

// Workers table listing (Admin only)
export async function getWorkers() {
  const res = await apiClient.get("/accounts/manage/partner-installers/");
  return res.data;
}

// Add Worker form - creates a new Partner Installer account.
// Backend only accepts: username, email, phone_number, password.
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
// There is no way to view an existing password (Django never stores
// real passwords, only a one-way scrambled version) - this always
// sets a brand new one.
export async function setWorkerPassword(id, newPassword) {
  const res = await apiClient.patch(`/accounts/manage/${id}/set-password/`, {
    new_password: newPassword,
  });
  return res.data;
}