import axios from "axios";

// One shared axios instance so the backend URL lives in a single place.
// withCredentials: true makes the browser send and accept the httpOnly auth cookie.
// VITE_API_URL comes from client/.env (Vite only exposes variables that start with VITE_).
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export default axiosInstance;

// VIVA
// Q: Why withCredentials?  Without it the browser drops cookies on cross-origin requests.
// Q: Why a shared instance? Change the base URL once, not in every file.
