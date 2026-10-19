import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import "./index.css";

function getInitialTheme() {
  try {
    return localStorage.getItem("workforce-theme") === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

const initialTheme = getInitialTheme();

document.documentElement.classList.toggle(
  "dark",
  initialTheme === "dark"
);
document.documentElement.style.colorScheme = initialTheme;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter  future={{ v7_relativeSplatPath: true }}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
