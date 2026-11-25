import client from './client';

export async function login(usernameOrEmail, password) {
  const response = await client.post('/accounts/login/', {
    username: usernameOrEmail,
    password,
  });
  return response.data;
}

// Sign-up now has 3 steps. No account is made until BOTH codes are right.
//   1. registerStart  - sends the form; the server texts one code and emails one code
//   2. registerVerify - sends the two codes; the account is made if both are right
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