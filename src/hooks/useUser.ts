import { useState, useEffect } from 'react';
import { VSUser, getStoredUserId, getUserById, storeUserId, clearUserId, ensureAnonSession, linkUserToSession } from '@/lib/user';

export function useUser() {
  const [user, setUser] = useState<VSUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        // Ensure anonymous session exists first
        await ensureAnonSession();

        const storedId = getStoredUserId();
        if (storedId) {
          // Link session to this user (no-op if already linked)
          await linkUserToSession(storedId);
          const u = await getUserById(storedId);
          if (u) {
            setUser(u);
          } else {
            clearUserId();
          }
        }
      } catch (e) {
        console.error('User init failed:', e);
        clearUserId();
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = async (u: VSUser) => {
    try {
      await ensureAnonSession();
      await linkUserToSession(u.id);
      storeUserId(u.id);
      setUser(u);
    } catch (e) {
      console.error('Login link failed:', e);
      storeUserId(u.id);
      setUser(u);
    }
  };

  const logout = () => {
    clearUserId();
    setUser(null);
  };

  return { user, loading, login, logout };
}
