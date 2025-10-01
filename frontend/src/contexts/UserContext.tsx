import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { buildApiUrl } from '../utils/url';

type User = {
  user_id: number;
  email: string;
  first_name: string;
  last_name: string;
  university: string;
  course: string;
  year_of_study: number;
  profile_image_url?: string;
  is_active: boolean;
};

type UserContextType = {
  currentUser: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (updatedData: Partial<User>) => void;
  refreshUser: () => Promise<void>;
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const cleanBearerFromLocalStorage = (): Record<string, string> => {
  const keys = ['google_id_token', 'last_google_id_token', 'token'];
  for (const k of keys) {
    const raw = localStorage.getItem(k);
    if (!raw) continue;

    let t = raw;
    // If it was stored as a JSON string, parse it back
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'string') t = parsed;
    } catch {
      // ignore parse errors – raw is fine
    }

    // Remove surrounding quotes and any leading "Bearer "
    t = t.replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
    if (t) return { Authorization: `Bearer ${t}` };
  }
  return {};
};

  const fetchUser = async (token?: string) => {
    setLoading(true);
    try {
      let headers: Record<string, string> = {};

      if (token) {
        // If caller passed a token, sanitize it too
        const sanitized = token.replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
        if (sanitized) headers['Authorization'] = `Bearer ${sanitized}`;
      } else {
        headers = { ...cleanBearerFromLocalStorage() };
      }

      const res = await fetch(buildApiUrl('/api/v1/users/me'), {
        headers,
        credentials: 'include', // optional, but harmless if you use cookies
      });

      if (res.ok) {
        const userData = await res.json();
        setCurrentUser(userData);
      } else if (res.status === 401) {
        // only clear token on auth failure
        setCurrentUser(null);
        localStorage.removeItem('google_id_token');
        localStorage.removeItem('last_google_id_token');
        localStorage.removeItem('token');
      } else {
        // log the server-side problem but don't throw away the token on 5xx
        console.error('users/me failed:', res.status, res.statusText, await res.text().catch(() => ''));
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('Error fetching user:', err);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchUser();
  }, []);

  const login = (user: User) => {
    setCurrentUser(user);
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('google_id_token');
  };

  const updateUser = (updatedData: Partial<User>) => {
    if (currentUser) {
      setCurrentUser({ ...currentUser, ...updatedData });
    }
  };

  const refreshUser = async () => {
    await fetchUser();
  };

  const value: UserContextType = {
    currentUser,
    loading,
    login,
    logout,
    updateUser,
    refreshUser,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
