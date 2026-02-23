import { useState } from 'react';
import { motion } from 'framer-motion';
import { User, ArrowRight, UserPlus } from 'lucide-react';
import { VSUser, sanitizeName, validateName, findUserByName, createUser } from '@/lib/user';

interface LoginFormProps {
  onLogin: (user: VSUser) => void;
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLookup = async () => {
    const sanitized = sanitizeName(name);
    const validationError = validateName(sanitized);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError('');
    setNotFound(false);

    const user = await findUserByName(sanitized);
    if (user) {
      onLogin(user);
    } else {
      setNotFound(true);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    const sanitized = sanitizeName(name);
    setLoading(true);
    setError('');
    try {
      const user = await createUser(sanitized);
      onLogin(user);
    } catch {
      setError('Failed to create account. Try again.');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !notFound) handleLookup();
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="text-xs text-muted-foreground uppercase tracking-widest font-medium mb-2 block">
          Your Name
        </label>
        <div className="relative">
          <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setNotFound(false); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="Enter your full name..."
            maxLength={50}
            className="w-full bg-muted/50 border border-border/50 rounded-xl py-3.5 pl-11 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:glow-border transition-all"
            autoFocus
          />
        </div>
        {error && (
          <p className="text-[11px] text-destructive mt-2">{error}</p>
        )}
        {notFound && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[11px] text-muted-foreground mt-2"
          >
            User not found. Create a new account?
          </motion.p>
        )}
      </div>

      {notFound ? (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleCreate}
          disabled={loading}
          className="w-full gradient-primary text-primary-foreground font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40"
        >
          {loading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Create Account
            </>
          )}
        </motion.button>
      ) : (
        <button
          onClick={handleLookup}
          disabled={!name.trim() || loading}
          className="w-full gradient-primary text-primary-foreground font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full" />
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}
