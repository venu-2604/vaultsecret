import { useState, useEffect } from 'react';
import { VSUser, getStoredUserId, getUserById, storeUserId, clearUserId } from '@/lib/user';

export function useUser() {
  const [user, setUser] = useState<VSUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const storedId = getStoredUserId();
      if (storedId) {
        const u = await getUserById(storedId);
        if (u) {
          setUser(u);
        } else {
          clearUserId();
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = (u: VSUser) => {
    storeUserId(u.id);
    setUser(u);
  };

  const logout = () => {
    clearUserId();
    setUser(null);
  };

  return { user, loading, login, logout };
}
