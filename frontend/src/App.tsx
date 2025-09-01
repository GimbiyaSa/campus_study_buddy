// App.tsx
import { useEffect, useState } from 'react';
import { getRouteFromPathname } from './router';
import Home from './pages/Home';
import Register from './pages/Register';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Partners from './pages/Partners';
import CoursesPage from './pages/CoursesPage';
import Progress from './pages/Progress';
import Sessions from './pages/Sessions';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

export default function App() {
  const getRouteFromPath = () => getRouteFromPathname(); // <-- use helper
  const [route, setRoute] = useState<string>(getRouteFromPath);

  // BEFORE rendering, detect homepage route
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  // If no token and route is "dashboard", you could redirect:
  if (!token && route === 'dashboard') {
    window.history.replaceState({}, '', '/landing');
  }

  useEffect(() => {
    const onPop = () => setRoute(getRouteFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const renderPage = () => {
    switch (route) {
      case 'home':
      default:
        return <Home />;
      case 'register':
        return <Register />;
      case 'partners':
        return <Partners />;
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
      case 'dashboard':
        return <Dashboard />;
    }
  };

  // Hide chrome on these routes
  const noChromeRoutes = new Set(['home', 'register', 'forgot-password', 'forgot-username']);
  const chromeVisible = !noChromeRoutes.has(route);

  return (
    <div className="min-h-screen relative">
      {/* same green background as dashboard */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,#E9FAF1_0%,transparent_50%),radial-gradient(1200px_600px_at_100%_0%,transparent_40%)]" />

      {chromeVisible ? (
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Header />
            <main className="p-6 md:p-8">{renderPage()}</main>
          </div>
        </div>
      ) : (
        // Auth/marketing pages: full-bleed, no sidebar/header
        <main className="p-6 md:p-10">{renderPage()}</main>
      )}
    </div>
  );
}
