import { useState, useEffect } from 'react';
import { Home, Users, Calendar, BookOpen, TrendingUp, MessageSquare } from 'lucide-react';
import { useUser } from '../contexts/UserContext';
import { navigate, getRouteFromPathname } from '../router';

type NavigationItem = {
  id: string;
  label: string;
  icon: React.ComponentType<any>;
  path: string;
  active: boolean;
};

export default function Sidebar() {
  const { currentUser, loading } = useUser();
  const [currentRoute, setCurrentRoute] = useState(getRouteFromPathname());

  const navigationItems: NavigationItem[] = [
    {
      id: '1',
      label: 'Dashboard',
      icon: Home,
      path: '/dashboard',
      active: currentRoute === 'dashboard',
    },
    {
      id: '2',
      label: 'Find Buddies',
      icon: Users,
      path: '/partners',
      active: currentRoute === 'partners',
    },
    {
      id: '3',
      label: 'Study Groups',
      icon: Users,
      path: '/groups',
      active: currentRoute === 'groups',
    },
    {
      id: '4',
      label: 'Sessions',
      icon: Calendar,
      path: '/sessions',
      active: currentRoute === 'sessions',
    },
    {
      id: '5',
      label: 'Courses',
      icon: BookOpen,
      path: '/courses',
      active: currentRoute === 'courses',
    },
    {
      id: '6',
      label: 'Progress',
      icon: TrendingUp,
      path: '/progress',
      active: currentRoute === 'progress',
    },
    {
      id: '7',
      label: 'Chat',
      icon: MessageSquare,
      path: '/chat',
      active: currentRoute === 'chat',
    },
    {
      id: '8',
      label: 'Profile',
      icon: Users,
      path: '/profile',
      active: currentRoute === 'profile',
    },
  ];

  // Listen for route changes
  useEffect(() => {
    const handlePopState = () => {
      setCurrentRoute(getRouteFromPathname());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigation = (path: string) => {
    navigate(path);
    setCurrentRoute(getRouteFromPathname(path));
  };

  // If no user is logged in, don't show the sidebar
  if (!currentUser && !loading) {
    return null;
  }

  if (loading) {
    return (
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
        </div>
        <div className="p-6">
          <div className="animate-pulse h-16 bg-gray-200 rounded"></div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header - aligned with main header */}
      <div className="h-16 px-6 border-b border-gray-200 flex items-center">
        <h1 className="text-lg font-extrabold leading-tight">
          <span className="text-emerald-600">Campus </span>
          <span className="text-slate-900">Study Buddy</span>
        </h1>
      </div>

      {/* Navigation - takes up full space now */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {navigationItems.map((item) => {
            const IconComponent = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavigation(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                    item.active
                      ? 'bg-brand-50 text-brand-700 border border-brand-200'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <IconComponent className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
