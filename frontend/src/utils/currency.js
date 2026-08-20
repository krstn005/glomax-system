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