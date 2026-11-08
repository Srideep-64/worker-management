import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { api, ApiError, clearCache } from "../api/client.js";
import BackendLoadingScreen from "../components/layout/BackendLoadingScreen.jsx";

const AuthContext = createContext(null);

const MAX_SESSION_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2000;

function getHttpStatus(error) {
  return error?.status ?? error?.statusCode ?? error?.response?.status ?? null;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // loading | authenticated | anonymous | unavailable
  const [status, setStatus] = useState("loading");
  const [connectionError, setConnectionError] = useState("");

  const loadSession = useCallback(async () => {
    setStatus("loading");
    setConnectionError("");

    for (let attempt = 1; attempt <= MAX_SESSION_ATTEMPTS; attempt += 1) {
      try {
        const data = await api.get("/me", { force: true });

        if (!data?.user) {
          // Do not treat a malformed successful response as authentication.
          setUser(null);
          setStatus("anonymous");
          return null;
        }

        setUser(data.user);
        setStatus("authenticated");
        setConnectionError("");
        return data.user;
      } catch (error) {
        const httpStatus = getHttpStatus(error);

        // No session is normal before login.
        if (httpStatus === 401) {
          setUser(null);
          setStatus("anonymous");
          setConnectionError("");
          return null;
        }

        if (attempt < MAX_SESSION_ATTEMPTS) {
          await wait(RETRY_DELAY_MS);
          continue;
        }

        setUser(null);
        setConnectionError(
          error instanceof ApiError
            ? error.message
            : "The server could not be reached."
        );
        setStatus("unavailable");
        return null;
      }
    }

    return null;
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });
    clearCache();
    setUser(data.user);
    setStatus("authenticated");
    setConnectionError("");
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      clearCache();
      setUser(null);
      setStatus("anonymous");
      setConnectionError("");
    }
  }, []);

  const contextValue = {
    user,
    status,
    login,
    logout,
    refresh: loadSession,
  };

  // CRITICAL: Keep the tour AND its Login modal inside the context provider.
  // Anonymous users remain on the tour after /me resolves; the tour only
  // disappears following successful login (or if a session already exists).
  return (
    <AuthContext.Provider value={contextValue}>
      {status === "authenticated" ? (
        children
      ) : (
        <BackendLoadingScreen
          mode="tour"
          ready={status === "anonymous"}
          error={status === "unavailable" ? connectionError : ""}
          onRetry={loadSession}
        />
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export { ApiError };