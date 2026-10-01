import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// StrictMode runs effects twice in development only, to help find bugs.
// That is why you may see /auth/me called twice in the Network tab. Production runs once.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
