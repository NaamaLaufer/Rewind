import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext.jsx";
import ProtectedRoute from "./auth/ProtectedRoute.jsx";
import NavBar from "./components/NavBar.jsx";
import Spinner from "./components/Spinner.jsx";
import About from "./pages/About.jsx";
import ContentView from "./pages/ContentView.jsx";
import History from "./pages/History.jsx";
import Library from "./pages/Library.jsx";
import Login from "./pages/Login.jsx";
import NotFound from "./pages/NotFound.jsx";
import Profile from "./pages/Profile.jsx";
import Register from "./pages/Register.jsx";
import SessionDetail from "./pages/SessionDetail.jsx";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="טוענת..." />;
  return <Navigate to={user ? "/library" : "/login"} replace />;
}

const guard = (el) => <ProtectedRoute>{el}</ProtectedRoute>;

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">דילוג לתוכן הראשי</a>
      <NavBar />
      <main id="main" className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/about" element={<About />} />
          <Route path="/library" element={guard(<Library />)} />
          <Route path="/content/:id" element={guard(<ContentView />)} />
          <Route path="/history" element={guard(<History />)} />
          <Route path="/sessions/:id" element={guard(<SessionDetail />)} />
          <Route path="/profile" element={guard(<Profile />)} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </>
  );
}
