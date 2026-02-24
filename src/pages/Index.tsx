import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, ArrowRight } from 'lucide-react';
import ParticleBackground from '@/components/ParticleBackground';
import vsLogo from '@/assets/vs-logo.png';
import { hashPassword } from '@/lib/crypto';
import { useUser } from '@/hooks/useUser';
import LoginForm from '@/components/LoginForm';

export default function Index() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, loading: userLoading, login, logout } = useUser();

  const handleJoin = async () => {
    if (!password.trim() || !user) return;
    setLoading(true);
    const roomId = await hashPassword(password);
    navigate(`/chat/${roomId}`, { state: { password, userId: user.id, userName: user.full_name } });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleJoin();
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden">
      <ParticleBackground />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-accent/5 blur-[100px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md px-6"
      >
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex justify-center mb-8"
        >
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg shadow-primary/20">
            <img src={vsLogo} alt="VaultSecret logo" className="w-full h-full object-cover" />
          </div>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center mb-10"
        >
          <h1 className="text-5xl font-bold tracking-tight mb-3">
            <span className="gradient-text text-glow">VaultSecret</span>
          </h1>
          <p className="text-muted-foreground text-lg font-light">
            No Accounts. Just Secrets.
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="glass-strong rounded-3xl p-8 glow-border"
        >
          {!user ? (
            <LoginForm onLogin={login} />
          ) : (
            <div className="space-y-6">
              {/* Logged in user badge */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-xs font-bold text-primary-foreground">
                    {user.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-foreground">{user.full_name}</span>
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Switch
                </button>
              </div>

              <div>
                <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-2 block">
                  Room Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Enter shared password..."
                    className="w-full bg-muted/50 border border-border/50 rounded-xl py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:glow-border transition-all"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                  Share this password with someone to join the same encrypted room.
                </p>
              </div>

              <button
                onClick={handleJoin}
                disabled={!password.trim() || loading}
                className="w-full gradient-primary text-primary-foreground font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
                ) : (
                  <>
                    Enter Room
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 text-center"
        >
          <p className="text-xs text-muted-foreground/60 font-mono">
            AES-256 · End-to-End Encrypted · Zero Knowledge
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
