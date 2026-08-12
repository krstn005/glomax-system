import client from './client';

export async function login(usernameOrEmail, password) {
  const response = await client.post('/accounts/login/', {
    username: usernameOrEmail,
    password,
  });
  return response.data;
}

export async function register(formData) {
  const response = await client.post('/accounts/register/', formData);
  return response.data;
}