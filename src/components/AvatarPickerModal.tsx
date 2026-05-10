import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';
import toyBoy from '@/assets/toy-boy-1-standing.png';
import toyGirl from '@/assets/toy-girl-1-standing.png';
import type { AvatarType } from '@/lib/user';

interface Props {
  open: boolean;
  onSelect: (type: AvatarType) => void | Promise<void>;
  onClose?: () => void;
  /** When true, hides the close button — selection is required. */
  required?: boolean;
}

/**
 * Snapchat-style avatar selection modal.
 * Mirrors the reference screenshot: dark glass panel, two avatar cards,
 * neon-purple selected ring, gradient "Continue" CTA.
 */
export default function AvatarPickerModal({ open, onSelect, onClose, required = true }: Props) {
  const [choice, setChoice] = useState<AvatarType | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!choice || saving) return;
    setSaving(true);
    try {
      await onSelect(choice);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
            onClick={() => !required && onClose?.()}
          />

          {/* Panel */}
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
            className="relative w-full max-w-sm rounded-2xl border border-border/40 bg-card/95 backdrop-blur-xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4">
              <button
                type="button"
                disabled={required}
                onClick={onClose}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base font-semibold text-foreground">Select Your Avatar</h2>
              <button
                type="button"
                disabled={required}
                onClick={onClose}
                className="p-1 rounded-full text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="px-6 pt-1 pb-5 text-center text-xs text-muted-foreground">
              Choose the avatar that represents you
            </p>

            {/* Cards */}
            <div className="grid grid-cols-2 gap-3 px-5 pb-4">
              {(['girl', 'boy'] as const).map((t) => {
                const active = choice === t;
                const img = t === 'girl' ? toyGirl : toyBoy;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setChoice(t)}
                    className={[
                      'group relative flex flex-col items-center gap-2 rounded-xl p-3 transition-all',
                      'bg-background/60 border-2',
                      active
                        ? 'border-primary shadow-[0_0_20px_hsl(var(--primary)/0.45)]'
                        : 'border-border/40 hover:border-border',
                    ].join(' ')}
                  >
                    <div className="w-full aspect-square rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-muted/40 to-background">
                      <img
                        src={img}
                        alt={t === 'girl' ? 'Girl avatar' : 'Boy avatar'}
                        className="w-[88%] h-[88%] object-contain drop-shadow-lg select-none pointer-events-none"
                        draggable={false}
                      />
                    </div>
                    <span
                      className={[
                        'text-sm font-medium capitalize',
                        active ? 'text-primary' : 'text-foreground/90',
                      ].join(' ')}
                    >
                      {t}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* CTA */}
            <div className="px-5 pb-5 pt-1">
              <button
                type="button"
                onClick={handleContinue}
                disabled={!choice || saving}
                className={[
                  'w-full rounded-full py-3 text-sm font-semibold text-white',
                  'bg-gradient-to-r from-[hsl(265_85%_60%)] to-[hsl(220_90%_60%)]',
                  'shadow-[0_8px_24px_hsl(var(--primary)/0.35)]',
                  'transition-all active:scale-[0.98]',
                  (!choice || saving) && 'opacity-50 cursor-not-allowed active:scale-100',
                ].filter(Boolean).join(' ')}
              >
                {saving ? 'Saving...' : 'Continue'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
