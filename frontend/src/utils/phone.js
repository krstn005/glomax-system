// Strips anything that isn't a digit (0-9) out of a phone number input.
// Returns the cleaned value plus whether an invalid character was typed,
// so the field can show a warning message when that happens.
export function sanitizePhoneNumber(rawValue) {
  const digitsOnly = rawValue.replace(/[^0-9]/g, '');
  const hadInvalidChar = digitsOnly.length !== rawValue.length;
  return { value: digitsOnly, hadInvalidChar };
}