import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | authenticated | anonymous

  const loadSession = useCallback(async () => {
    try {
      const data = await api.get("/me");
      setUser(data.user);
      setStatus("authenticated");
    } catch (err) {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    setUser(data.user);
    setStatus("authenticated");
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      setStatus("anonymous");
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, refresh: loadSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };
