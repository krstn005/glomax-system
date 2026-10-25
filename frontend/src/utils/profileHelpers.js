// Shared helpers for every portal's Settings page (profile and password forms).

export const MAX_PHOTO_SIZE_MB = 5;

// Friendly names for the fields the server might complain about
const FIELD_LABELS = {
  username: 'Full Name',
  email: 'Email Address',
  phone_number: 'Phone Number',
  address: 'Home Address',
  profile_picture: 'Photo',
  current_password: 'Current Password',
  new_password: 'New Password',
};

// Turns the server's error into a short message people can understand.
// Example: { username: ["A user with that username already exists."] }
// becomes "Full Name: A user with that username already exists."
export function getServerErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') {
    const code = err?.response?.status;
    return code ? `${fallback} (error ${code})` : fallback;
  }
  if (data.detail) return data.detail;

  const firstEntry = Object.entries(data)[0];
  if (!firstEntry) return fallback;

  const [field, messages] = firstEntry;
  const message = Array.isArray(messages) ? messages[0] : String(messages);
  const label = FIELD_LABELS[field];
  return label ? `${label}: ${message}` : message;
}

// Gives the photo a short, unique file name before uploading.
// Django only allows 100 characters for the saved file path, and
// photos from phones or the internet often have very long names.
export function shortPhotoName(file) {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().slice(0, 5);
  return `profile-${Date.now()}.${ext}`;
}

// Returns an error message if the photo can't be used, or '' if it's fine.
export function checkPhoto(file) {
  if (!file.type.startsWith('image/')) {
    return 'Please choose an image file (JPG or PNG).';
  }
  if (file.size > MAX_PHOTO_SIZE_MB * 1024 * 1024) {
    return `Photo is too large. Please choose one under ${MAX_PHOTO_SIZE_MB} MB.`;
  }
  return '';
}

export const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v) => v.length >= 8 },
  { key: 'upper', label: 'At least one uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { key: 'number', label: 'At least one number', test: (v) => /[0-9]/.test(v) },
];