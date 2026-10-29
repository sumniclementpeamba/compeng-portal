import { api } from './client';

export const authApi = {
  login: (username, password) => api.post('/auth/login/', { username, password }),
  register: (payload) => api.post('/auth/register/', payload),
  me: () => api.get('/me/'),
};