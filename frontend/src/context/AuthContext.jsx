import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import { clearToken, getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

const AUTH_TIMEOUT_MS = 6000;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Auth check timed out')), ms)
    ),
  ]);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await withTimeout(authApi.me(), AUTH_TIMEOUT_MS);
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function login(username, password) {
    const data = await authApi.login(username, password);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  async function register(payload) {
    const data = await authApi.register(payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
} 