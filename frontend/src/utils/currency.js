// Formats a raw number/string cost into a clean, comma-separated
// peso amount for display - e.g. "677678.00" -> "₱677,678.00"
export function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "—";

  const number = Number(value);
  if (Number.isNaN(number)) return "—";

  return `₱${number.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Splits a comma-separated payment terms string into pipe-separated
// segments for easier scanning, e.g. "50% downpayment, 50% upon
// completion" -> "50% downpayment | 50% upon completion".
export function formatPaymentTerms(text) {
  if (!text) return text;
  return text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" | ");
}

// Formats a date string as "Month Day, Year | h:mm AM/PM" instead of
// the default toLocaleString() comma-separated format.
export function formatDateTime(dateString) {
  if (!dateString) return dateString;
  const date = new Date(dateString);
  const datePart = date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} | ${timePart}`;
}