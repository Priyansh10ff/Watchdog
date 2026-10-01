import { createContext, useContext, useState, useEffect } from "react";
import axiosInstance from "../services/api";

// Context lets any component read the logged-in user without passing props down.
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we know if a session exists

  // Runs once when the app loads. The browser sends the cookie automatically,
  // so if it is valid the server returns the user. This is what keeps you
  // logged in after a page refresh.
  useEffect(() => {
    axiosInstance
      .get("/auth/me")
      .then((res) => {
        setUser(res.data.user);
      })
      .catch(() => {
        setUser(null); // 401 just means "not logged in", not a real error
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// VIVA
// Q: Why do we need `loading`?  Without it, a logged-in user would flash the login page on refresh.
// Q: Where is the token stored? In an httpOnly cookie. JavaScript here never sees it.
// Q: What does Context solve?   Prop drilling: sharing state between distant components.
