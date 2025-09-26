// App.tsx
import { useEffect, useState } from 'react';
import { getRouteFromPathname } from './router';
import Home from './pages/Home';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Partners from './pages/Partners';
import Groups from './pages/Groups';
import CoursesPage from './pages/CoursesPage';
import Progress from './pages/Progress';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import { useUser } from './contexts/UserContext';

export default function App() {
  const { currentUser, loading } = useUser();
  const getRouteFromPath = () => getRouteFromPathname();
  const [route, setRoute] = useState<string>(getRouteFromPath);

  useEffect(() => {
    const onPop = () => setRoute(getRouteFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Routes that don't require authentication
  const publicRoutes = new Set(['home', 'register', 'forgot-password', 'forgot-username']);

  // Routes that need chrome (header/sidebar) when authenticated
  const chromeRoutes = new Set([
    'dashboard',
    'partners',
    'groups',
    'courses',
    'progress',
    'sessions',
    'settings',
    'profile',
  ]);

  const renderPage = () => {
    switch (route) {
      case 'home':
        return <Home />;
      case 'register':
        return <Register />;
      case 'forgot-password':
        return <ForgotPassword />;
      case 'dashboard':
        return <Dashboard />;
      case 'partners':
        return <Partners />;
      case 'groups':
        return <Groups />;
      case 'courses':
        return <CoursesPage />;
      case 'progress':
        return <Progress />;
      case 'sessions':
        return <Sessions />;
      case 'settings':
        return <Settings />;
      case 'profile':
        return <Profile />;
      default:
        return <Home />;
    }
  };

  // Show loading state while checking user
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
      </div>
    );
  }

  // If user is not logged in and trying to access protected route, redirect to home
  if (!currentUser && !publicRoutes.has(route)) {
    // Redirect to home page
    window.history.replaceState({}, '', '/');
    setRoute('home');
    return (
      <main className="p-6 md:p-10">
        <Home />
      </main>
    );
  }

  // Determine if we should show chrome (header/sidebar)
  const shouldShowChrome = currentUser && chromeRoutes.has(route);

  return (
    <div className="min-h-screen relative">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,#E9FAF1_0%,transparent_50%),radial-gradient(1200px_600px_at_100%_0%,transparent_40%)]" />

      {shouldShowChrome ? (
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="p-6 md:p-8">{renderPage()}</main>
          </div>
        </div>
      ) : (
        <main className="p-6 md:p-10">{renderPage()}</main>
      )}
    </div>
  );
}
