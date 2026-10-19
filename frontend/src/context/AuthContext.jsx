
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";

import { api, ApiError } from "../api/client.js";
import BackendLoadingScreen from "../components/layout/BackendLoadingScreen.jsx";

const AuthContext = createContext(null);

const MAX_SESSION_ATTEMPTS = 4;
const RETRY_DELAY_MS = 2000;

function getHttpStatus(error) {
  return (
    error?.status ??
    error?.statusCode ??
    error?.response?.status ??
    null
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading");
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const loadingTimerRef = useRef(null);
  // loading | authenticated | anonymous | unavailable

  const [connectionError, setConnectionError] = useState("");

  const loadSession = useCallback(async () => {
    setStatus("loading");
    setConnectionError("");

    for (let attempt = 1; attempt <= MAX_SESSION_ATTEMPTS; attempt += 1) {
      try {
        const data = await api.get("/me");

        setUser(data.user);
        setStatus("authenticated");
        setConnectionError("");
        return data.user;
      } catch (error) {
        const httpStatus = getHttpStatus(error);

        // A 401 means the session is missing or expired.
        // It is not a backend-wakeup failure.
        if (httpStatus === 401) {
          setUser(null);
          setStatus("anonymous");
          setConnectionError("");
          return null;
        }

        // Retry temporary connection/server errors.
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

  useEffect(() => {
  if (status !== "loading") {
    setShowLoadingScreen(false);

    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }

    return;
  }

  loadingTimerRef.current = setTimeout(() => {
    setShowLoadingScreen(true);
  }, 100);

  return () => {
    if (loadingTimerRef.current) {
      clearTimeout(loadingTimerRef.current);
      loadingTimerRef.current = null;
    }
  };
}, [status]);

  const login = useCallback(async (email, password) => {
    const data = await api.post("/auth/login", { email, password });

    setUser(data.user);
    setStatus("authenticated");
    setConnectionError("");

    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      setStatus("anonymous");
      setConnectionError("");
    }
  }, []);

  // The same full-screen experience works on login and protected pages.
  if (status === "loading") {
    return showLoadingScreen ? <BackendLoadingScreen /> : null;
  }

  if (status === "unavailable") {
    return (
      <BackendLoadingScreen
        error={connectionError}
        onRetry={loadSession}
      />
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        status,
        login,
        logout,
        refresh: loadSession,
      }}
    >
      {children}
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
