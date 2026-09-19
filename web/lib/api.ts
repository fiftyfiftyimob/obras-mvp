const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export async function api(path: string, options: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.status === 204 ? null : response.json();
}

export const login = (telefone: string, senha: string) => api('/auth/login', { method: 'POST', body: JSON.stringify({ telefone, senha }) });
export const getTarefas = (data?: string) => api(`/tarefas${data ? `?data=${data}` : ''}`);
