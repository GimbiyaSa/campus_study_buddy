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

  const fetchUser = async () => {
    setLoading(true);
    try {
      // Try to get current user first
      const res = await fetch(buildApiUrl('/api/v1/users/me'));
      if (res.ok) {
        const userData = await res.json();
        setCurrentUser(userData);
      } else {
        // Fallback - get first user for demo
        const usersRes = await fetch(buildApiUrl('/api/v1/users'));
        if (usersRes.ok) {
          const usersData = await usersRes.json();
          if (usersData.length > 0) {
            setCurrentUser(usersData[0]);
          }
        }
      }
    } catch (err) {
      console.error('Error fetching user:', err);
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

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}