import client from './client';

export async function login(usernameOrEmail, password) {
  const response = await client.post('/accounts/login/', {
    username: usernameOrEmail,
    password,
  });
  return response.data;
}

// Sign-up now has 3 steps. No account is made until BOTH codes are right.
//   1. registerStart  - sends the form; the server emails the email code first
//   2. registerVerify - sends one code at a time (email first, then the text code);
//                       the account is made when both are right
//   3. registerResend - asks for a new code ('email' or 'phone')
export async function registerStart(formData) {
  const response = await client.post('/accounts/register/start/', formData);
  return response.data;
}

export async function registerVerify(registrationToken, emailCode, phoneCode) {
  const response = await client.post('/accounts/register/verify/', {
    registration_token: registrationToken,
    email_code: emailCode,
    phone_code: phoneCode,
  });
  return response.data;
}

export async function registerResend(registrationToken, channel) {
  const response = await client.post('/accounts/register/resend/', {
    registration_token: registrationToken,
    channel,
  });
  return response.data;
}

// Old name, kept so nothing else that imports it breaks. It only starts the
// sign-up now - it no longer makes an account by itself.
export const register = registerStart;

// Forgot password, by text message
//   1. passwordResetStart   - email or mobile number; a code is texted
//   2. passwordResetConfirm - the code and the new password
//   3. passwordResetResend  - asks for a new code
export async function passwordResetStart(identifier) {
  const response = await client.post('/accounts/password-reset/start/', { identifier });
  return response.data;
}

export async function passwordResetConfirm(resetToken, code, newPassword, confirmPassword) {
  const response = await client.post('/accounts/password-reset/confirm/', {
    reset_token: resetToken,
    code,
    new_password: newPassword,
    confirm_password: confirmPassword,
  });
  return response.data;
}

export async function passwordResetResend(resetToken) {
  const response = await client.post('/accounts/password-reset/resend/', { reset_token: resetToken });
  return response.data;
}