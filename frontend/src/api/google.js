import client from './client';

export async function googleLogin(idToken) {
  const response = await client.post('/accounts/google-login/', { id_token: idToken });
  return response.data;
}