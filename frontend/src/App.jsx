
import { Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext.jsx";

import AppLayout from "./components/layout/AppLayout.jsx";
import ProtectedRoute from "./routes/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import CompanyDetail from "./pages/CompanyDetail.jsx";
import Workers from "./pages/Workers.jsx";
import WorkerProfile from "./pages/WorkerProfile.jsx";
import Timesheets from "./pages/Timesheets.jsx";
import Documents from "./pages/Documents.jsx";
import Settings from "./pages/Settings.jsx";

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route
              path="/companies/:companyId"
              element={<CompanyDetail />}
            />
            <Route path="/workers" element={<Workers />} />
            <Route
              path="/workers/:workerId"
              element={<WorkerProfile />}
            />
            <Route path="/timesheets" element={<Timesheets />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  );
}
