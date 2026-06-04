import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Silent token refresh: on a 401, call /auth/refresh once and retry the
// original request. Access tokens are short-lived (15 min) but the refresh
// token is valid for 7 days, so the user stays signed in seamlessly.
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const status = error.response?.status;
    const url = original?.url || "";
    const isAuthCall =
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/register");

    if (status === 401 && original && !original._retry && !isAuthCall) {
      original._retry = true;
      try {
        refreshPromise =
          refreshPromise ||
          api.post("/auth/refresh").finally(() => {
            refreshPromise = null;
          });
        await refreshPromise;
        return api(original); // retry with the refreshed cookie
      } catch (e) {
        if (
          typeof window !== "undefined" &&
          !window.location.pathname.startsWith("/login")
        ) {
          window.location.assign("/login");
        }
        return Promise.reject(e);
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
