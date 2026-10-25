import apiClient from "./client";

export async function getNotifications() {
  const res = await apiClient.get("/notifications/");
  return res.data;
}

export async function markNotificationRead(id) {
  const res = await apiClient.patch(`/notifications/${id}/read/`);
  return res.data;
}

export async function markAllNotificationsRead() {
  const res = await apiClient.patch("/notifications/read-all/");
  return res.data;
}

export async function deleteNotification(id) {
  await apiClient.delete(`/notifications/${id}/`);
}

export async function clearAllNotifications() {
  await apiClient.delete("/notifications/clear-all/");
}