// App.tsx — global layout and minimal hash router
import { useEffect, useState } from 'react';
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
  const getRouteFromPath = () => {
    const path = window.location.pathname || '/dashboard';
    // strip leading slash and possible trailing slash
    const cleaned = path.replace(/^\//, '').replace(/\/$/, '');
    return cleaned === '' ? 'dashboard' : cleaned;
  };

  const [route, setRoute] = useState<string>(getRouteFromPath);

  useEffect(() => {
    const onPop = () => setRoute(getRouteFromPath());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const renderPage = () => {
    switch (route) {
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
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_600px_at_20%_0%,#E9FAF1_0%,transparent_50%),radial-gradient(1200px_600px_at_100%_0%,transparent_40%)]" />
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col">
          <Header />

          <main className="p-6 md:p-8">{renderPage()}</main>
        </div>
      </div>
    </div>
  );
}
