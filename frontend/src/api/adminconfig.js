import apiClient from "./client";

// SMS Templates
export async function getSmsTemplates() {
  const res = await apiClient.get("/adminconfig/sms-templates/");
  return res.data;
}
export async function createSmsTemplate(data) {
  const res = await apiClient.post("/adminconfig/sms-templates/", data);
  return res.data;
}
export async function updateSmsTemplate(id, data) {
  const res = await apiClient.patch(`/adminconfig/sms-templates/${id}/`, data);
  return res.data;
}
export async function deleteSmsTemplate(id) {
  await apiClient.delete(`/adminconfig/sms-templates/${id}/`);
}

// System Settings
export async function getSystemSettings() {
  const res = await apiClient.get("/adminconfig/system-settings/");
  return res.data;
}
export async function createSystemSetting(data) {
  const res = await apiClient.post("/adminconfig/system-settings/", data);
  return res.data;
}
export async function updateSystemSetting(id, data) {
  const res = await apiClient.patch(`/adminconfig/system-settings/${id}/`, data);
  return res.data;
}
export async function deleteSystemSetting(id) {
  await apiClient.delete(`/adminconfig/system-settings/${id}/`);
}

// FAQs
export async function getFaqs() {
  const res = await apiClient.get("/adminconfig/faqs/");
  return res.data;
}
export async function createFaq(data) {
  const res = await apiClient.post("/adminconfig/faqs/", data);
  return res.data;
}
export async function updateFaq(id, data) {
  const res = await apiClient.patch(`/adminconfig/faqs/${id}/`, data);
  return res.data;
}
export async function deleteFaq(id) {
  await apiClient.delete(`/adminconfig/faqs/${id}/`);
}

// Public (Customer-facing)
export async function getPublicFaqs() {
  const res = await apiClient.get("/adminconfig/faqs/public/");
  return res.data;
}