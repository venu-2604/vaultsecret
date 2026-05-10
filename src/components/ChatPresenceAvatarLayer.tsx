import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toyBoy from '@/assets/toy_boy.png';
import toyGirl from '@/assets/toy-girl.png';

/**
 * ChatPresenceAvatarLayer
 * -----------------------
 * Snapchat-style realtime avatar presence overlay.
 *
 * Plug-and-play: mount ABOVE the chat input. Uses absolute positioning,
 * isolated state machine, GPU-accelerated transforms only. Does NOT
 * subscribe to or modify any websocket / messages / store. It only reads
 * the booleans the parent already computes (peerOnline, isTyping).
 *
 * Behavior:
 * - Self avatar stays fixed at top-right above the input bar.
 * - Peer avatar appears/disappears instantly beside self based on peerOnline.
 */

type AvatarGender = 'girl' | 'boy';
const GIRL_NAMES = ['saniya', 'srivalli', 'valli'] as const;
const BOY_NAMES = ['venu', 'vikram', 'mithesh'] as const;

const PALETTE: Record<string, { img: string; gender: AvatarGender }> = {
  saniya:   { img: toyGirl, gender: 'girl' },
  srivalli: { img: toyGirl, gender: 'girl' },
  valli:    { img: toyGirl, gender: 'girl' },
  venu:     { img: toyBoy, gender: 'boy' },
  vikram:   { img: toyBoy, gender: 'boy' },
  mithesh:  { img: toyBoy, gender: 'boy' },
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Detect gender from the user's actual display name (first token, case-insensitive). */
function detectGender(name: string | undefined): AvatarGender {
  if (!name) return 'boy';
  const first = name.trim().toLowerCase().split(/\s+/)[0];
  if ((GIRL_NAMES as readonly string[]).includes(first)) return 'girl';
  if ((BOY_NAMES as readonly string[]).includes(first)) return 'boy';
  // Fallback: stable hash so unknown names get a consistent toy.
  return hashString(first) % 2 === 0 ? 'girl' : 'boy';
}

function pickAvatar(seed: string | undefined, gender: AvatarGender, exclude?: string): string {
  if (seed) {
    const first = seed.trim().toLowerCase().split(/\s+/)[0];
    if (PALETTE[first] && PALETTE[first].gender === gender) return first;
  }
  const pool = gender === 'girl' ? GIRL_NAMES : BOY_NAMES;
  const filtered = exclude ? pool.filter(n => n !== exclude) : pool;
  const arr = filtered.length ? filtered : pool;
  const h = hashString(seed || Math.random().toString());
  return arr[h % arr.length];
}


interface AvatarBlobProps {
  name: string;
  leaning?: boolean;
  small?: boolean;
  sizeOverride?: number;
}

function AvatarBlob({ name, leaning, small, sizeOverride }: AvatarBlobProps) {
  const meta = PALETTE[name] ?? PALETTE.saniya;
  const size = sizeOverride ?? (small ? 64 : 72);
  return (
    <div
      style={{ width: size, height: size, willChange: 'transform' }}
      className="relative"
    >
      <motion.img
        src={meta.img}
        alt=""
        draggable={false}
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.45))',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
      {/* Soft ground shadow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -6,
          transform: 'translateX(-50%)',
          width: size * 0.7,
          height: 5,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.25), rgba(0,0,0,0))',
          filter: 'blur(1px)',
        }}
      />
    </div>
  );
}

interface Props {
  selfName?: string;
  peerName?: string;
  peerOnline: boolean;
  peerTyping?: boolean;
  selfTyping?: boolean;
  /** Explicit avatar type for self — overrides name-based detection. */
  selfAvatarType?: AvatarGender | null;
  /** Explicit avatar type for peer — overrides name-based detection. */
  peerAvatarType?: AvatarGender | null;
}

export default function ChatPresenceAvatarLayer({
  selfName,
  peerName,
  peerOnline,
  peerTyping = false,
  selfTyping = false,
  selfAvatarType,
  peerAvatarType,
}: Props) {
  const selfGender: AvatarGender = selfAvatarType ?? detectGender(selfName);
  const peerGender: AvatarGender = peerAvatarType ?? detectGender(peerName);
  const selfAvatar = useMemo(
    () => pickAvatar(selfName, selfGender),
    [selfName, selfGender]
  );
  const peerAvatar = useMemo(
    () => pickAvatar(peerName, peerGender, selfAvatar),
    [peerName, peerGender, selfAvatar]
  );

  const girlSlotStyle = {
    position: 'absolute' as const,
    right: 78,
    bottom: -14,
    willChange: 'transform, opacity',
  };
  const boySlotStyle = {
    position: 'absolute' as const,
    right: 36,
    bottom: -19,
    willChange: 'transform, opacity',
  };

  return (
    <div
      aria-hidden
      style={{
        position: 'relative',
        width: '100%',
        height: 92,
        marginBottom: -24,
        zIndex: 60,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {/* Self avatar keeps the same slot even when peer is offline. */}
      <motion.div
        key="self-slot"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        style={selfGender === 'girl' ? girlSlotStyle : boySlotStyle}
      >
        <AvatarBlob
          name={selfAvatar}
          leaning={selfTyping}
          sizeOverride={selfGender === 'boy' ? 78 : undefined}
        />
      </motion.div>

      {/* Peer appears in the other fixed slot when online. */}
      <AnimatePresence>
        {peerOnline && (
          <motion.div
            key="peer-slot"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={peerGender === 'girl' ? girlSlotStyle : boySlotStyle}
          >
            <AvatarBlob
              name={peerAvatar}
              leaning={peerTyping}
              sizeOverride={peerGender === 'boy' ? 78 : undefined}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
