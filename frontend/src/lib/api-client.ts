import axios from 'axios';

export const TOKEN_STORAGE_KEY = 'edip.token';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000',
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/**
 * No redirect-on-401 interceptor here on purpose. Routing lives in
 * ProtectedRoute, which knows whether a session exists; an interceptor that
 * force-navigates on every rejected response turns a single forbidden call
 * into a redirect loop the moment a page renders one widget the current role
 * cannot see.
 */

export function extractErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const message = data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return fallback;
}
