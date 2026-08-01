import { createContext, useContext, useState, useCallback } from 'react';
import { getToken, setToken, removeToken, isLoggedIn } from '../lib/auth';
import { loginAdmin } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const result = await loginAdmin(username, password);
      setToken(result.access_token);
      setLoggedIn(true);
      return true;
    } catch (err) {
      setError(err.message || 'Login gagal.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    removeToken();
    setLoggedIn(false);
  }, []);

  return (
    <AuthContext.Provider value={{ loggedIn, loading, error, login, logout, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return ctx;
}
