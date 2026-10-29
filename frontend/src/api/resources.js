import { api } from './client';

export const resourcesApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const q = qs.toString();
    return api.get(`/resources/${q ? '?' + q : ''}`);
  },
  get: (id) => api.get(`/resources/${id}/`),
  create: (formData) => api.post('/resources/', formData),
  review: (id, decision, note = '') =>
    api.post(`/resources/${id}/review/`, { decision, note }),

  // Versioning
  versions: (id) => api.get(`/resources/${id}/versions/`),
  uploadVersion: (id, formData) =>
    api.post(`/resources/versions/upload/${id}/`, formData),
};

export const announcementsApi = {
  list: () => api.get('/announcements/'),
  create: (payload) => api.post('/announcements/', payload),
}; 