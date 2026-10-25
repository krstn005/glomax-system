import apiClient from "./client";

export async function getAdminPriceHistory() {
  const res = await apiClient.get("/pricing/price-history/");
  return res.data;
}

export async function addPriceEntry(data) {
  const res = await apiClient.post("/pricing/price-history/", data);
  return res.data;
}

export async function getAdminPaymentTerms() {
  const res = await apiClient.get("/pricing/payment-terms/");
  return res.data;
}

export async function addPaymentTerm(data) {
  const res = await apiClient.post("/pricing/payment-terms/", data);
  return res.data;
}