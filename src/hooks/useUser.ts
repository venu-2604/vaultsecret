import { useState, useEffect } from 'react';
import { VSUser, getStoredUserId, getUserById, storeUserId, clearUserId, linkAuthUid } from '@/lib/user';

export function useUser() {
  const [user, setUser] = useState<VSUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const storedId = getStoredUserId();
      if (storedId) {
        const u = await getUserById(storedId);
        if (u) {
          // Re-link auth_uid on each session restore
          await linkAuthUid(u.id);
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
