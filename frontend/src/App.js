import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./context/AuthContext";
import { ContentProvider } from "./context/ContentContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BracingEngine from "./pages/BracingEngine";
import Estimator from "./pages/Estimator";
import Calculator from "./pages/Calculator";
import Equipment from "./pages/Equipment";
import Rentals from "./pages/Rentals";
import Bookings from "./pages/Bookings";
import Capacity from "./pages/Capacity";
import Calendar from "./pages/Calendar";
import Maintenance from "./pages/Maintenance";
import Vendors from "./pages/Vendors";
import Quotes from "./pages/Quotes";
import Leads from "./pages/Leads";
import Admin from "./pages/Admin";
import "@/App.css";

export default function App() {
  return (
    <AuthProvider>
      <ContentProvider>
        <BrowserRouter>
          <Toaster richColors position="top-right" />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="bracing" element={<BracingEngine />} />
              <Route path="estimator" element={<Estimator />} />
              <Route path="calculator" element={<Calculator />} />
              <Route path="equipment" element={<Equipment />} />
              <Route path="rentals" element={<Rentals />} />
              <Route path="bookings" element={<Bookings />} />
              <Route path="capacity" element={<Capacity />} />
              <Route path="calendar" element={<Calendar />} />
              <Route path="maintenance" element={<Maintenance />} />
              <Route path="vendors" element={<Vendors />} />
              <Route path="quotes" element={<Quotes />} />
              <Route path="leads" element={<Leads />} />
              <Route path="admin" element={<Admin />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ContentProvider>
    </AuthProvider>
  );
}
