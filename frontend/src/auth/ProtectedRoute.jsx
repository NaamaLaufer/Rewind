import { Navigate, useLocation } from "react-router-dom";
import Spinner from "../components/Spinner.jsx";
import { useAuth } from "./AuthContext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label="טוענת..." />;
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname, message: "כדי להמשיך צריך להתחבר." }} />
    );
  }
  return children;
}
