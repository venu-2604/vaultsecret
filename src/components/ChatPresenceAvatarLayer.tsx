import { useEffect, useReducer, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
import toyBoy from '@/assets/toy-boy.png';
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
 * State machine per remote avatar:
 *   hidden -> entering -> running -> slowing -> sitting -> idle
 *   (idle) -> leaving -> hidden
 */

type AvatarGender = 'girl' | 'boy';
const GIRL_NAMES = ['saniya', 'srivalli', 'nisha'] as const;
const BOY_NAMES = ['venu', 'vikram', 'mithesh'] as const;

const PALETTE: Record<string, { img: string; gender: AvatarGender }> = {
  saniya:   { img: toyGirl, gender: 'girl' },
  srivalli: { img: toyGirl, gender: 'girl' },
  nisha:    { img: toyGirl, gender: 'girl' },
  venu:     { img: toyBoy, gender: 'boy' },
  vikram:   { img: toyBoy, gender: 'boy' },
  mithesh:  { img: toyBoy, gender: 'boy' },
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pickAvatar(seed: string | undefined, gender: AvatarGender, exclude?: string): string {
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
}

function AvatarBlob({ name, leaning, small }: AvatarBlobProps) {
  const meta = PALETTE[name] ?? PALETTE.saniya;
  const size = small ? 40 : 44;
  return (
    <motion.div
      // Idle "breathing" via subtle scale loop. Pure GPU transform.
      animate={{ scale: [1, 1.04, 1] }}
      transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width: size, height: size, willChange: 'transform' }}
      className="relative"
    >
      <motion.div
        // Lean forward when typing
        animate={{ rotate: leaning ? -10 : 0, y: leaning ? -2 : 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 14 }}
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '9999px',
          background: meta.bg,
          boxShadow: `0 4px 14px -4px ${meta.ring}80, inset 0 -3px 6px rgba(0,0,0,0.08)`,
          border: `2px solid ${meta.ring}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: small ? 20 : 22,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {/* Blink: vertical scale on a thin overlay simulates blink. */}
        <motion.span
          animate={{ scaleY: [1, 1, 0.05, 1, 1] }}
          transition={{ duration: 4, repeat: Infinity, times: [0, 0.46, 0.5, 0.54, 1], ease: 'easeInOut' }}
          style={{ display: 'inline-block', transformOrigin: 'center' }}
        >
          {meta.emoji}
        </motion.span>
      </motion.div>
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
    </motion.div>
  );
}

type RemoteState =
  | 'hidden'
  | 'entering'
  | 'running'
  | 'slowing'
  | 'sitting'
  | 'idle'
  | 'leaving';

interface Props {
  /** Current user's display name (used to pick own avatar). */
  selfName?: string;
  /** Peer's display name (for stable avatar pick). */
  peerName?: string;
  /** Existing presence boolean — peer is in the room. */
  peerOnline: boolean;
  /** Existing typing boolean — peer is typing. */
  peerTyping?: boolean;
  /** Optional: typing state for self (own avatar leans). */
  selfTyping?: boolean;
}

export default function ChatPresenceAvatarLayer({
  selfName,
  peerName,
  peerOnline,
  peerTyping = false,
  selfTyping = false,
}: Props) {
  // Pick stable avatars. Self deterministic by name; peer different from self.
  const selfAvatar = useMemo(
    () => pickAvatar(selfName, hashString(selfName || 'me') % 2 === 0 ? 'girl' : 'boy'),
    [selfName]
  );
  const peerAvatar = useMemo(
    () => pickAvatar(peerName, hashString(peerName || 'peer') % 2 === 0 ? 'boy' : 'girl', selfAvatar),
    [peerName, selfAvatar]
  );

  // Measure container width to compute seat positions per spec.
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Seat positions (from spec). Right edge anchored.
  const rightSeatX = Math.max(0, width - 90); // self
  const peerSeatX = Math.max(0, width - 150); // beside self (~50px gap from self)
  const spawnX = -80;

  // Isolated state machine for the peer avatar.
  const [remoteState, dispatch] = useReducer(
    (
      _prev: RemoteState,
      action: 'JOIN_SEQUENCE' | 'ARRIVED' | 'SETTLED' | 'USER_LEFT' | 'RESET'
    ): RemoteState => {
      switch (action) {
        case 'JOIN_SEQUENCE': return 'entering';
        case 'ARRIVED':       return 'slowing';
        case 'SETTLED':       return 'sitting';
        case 'USER_LEFT':     return 'leaving';
        case 'RESET':         return 'hidden';
        default:              return _prev;
      }
    },
    'hidden'
  );

  // Map external presence -> animation events (NOT direct binding).
  const lastOnlineRef = useRef<boolean>(peerOnline);
  useEffect(() => {
    if (peerOnline === lastOnlineRef.current) return;
    lastOnlineRef.current = peerOnline;
    if (peerOnline) {
      // If width not measured yet, defer to next paint.
      if (width > 0) dispatch('JOIN_SEQUENCE');
    } else {
      dispatch('USER_LEFT');
    }
  }, [peerOnline, width]);

  // If peer was already online when we mounted but width was 0, kick once width arrives.
  useEffect(() => {
    if (width > 0 && peerOnline && remoteState === 'hidden') {
      dispatch('JOIN_SEQUENCE');
    }
  }, [width, peerOnline, remoteState]);

  // Drive imperative animation for the running peer avatar.
  const peerControls = useAnimationControls();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (remoteState === 'entering') {
        peerControls.set({ x: spawnX, opacity: 0, scale: 0.9 });
        await peerControls.start({
          opacity: 1,
          scale: 1,
          transition: { duration: 0.25, ease: 'easeOut' },
        });
        if (cancelled) return;
        // running phase
        await peerControls.start({
          x: peerSeatX + 60,
          transition: { duration: 0.9, ease: [0.4, 0.0, 0.2, 1] },
        });
        if (cancelled) return;
        dispatch('ARRIVED');
        // slowing
        await peerControls.start({
          x: peerSeatX,
          transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
        });
        if (cancelled) return;
        // tiny landing bounce
        await peerControls.start({
          y: [0, -6, 0, -2, 0],
          transition: { duration: 0.55, ease: 'easeOut' },
        });
        if (cancelled) return;
        dispatch('SETTLED');
      } else if (remoteState === 'leaving') {
        // wave + fade
        await peerControls.start({
          rotate: [0, 14, -10, 14, 0],
          transition: { duration: 0.6, ease: 'easeInOut' },
        });
        if (cancelled) return;
        await peerControls.start({
          opacity: 0,
          y: -10,
          transition: { duration: 0.35, ease: 'easeIn' },
        });
        if (!cancelled) dispatch('RESET');
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteState, peerSeatX]);

  const peerVisible = remoteState !== 'hidden';

  return (
    <div
      ref={containerRef}
      aria-hidden
      // Mounted above the input. Doesn't capture pointer events so the
      // existing UI keeps full interactivity.
      style={{
        position: 'relative',
        width: '100%',
        height: 56,
        marginBottom: -8,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Ground line */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 6,
          height: 1,
          background:
            'linear-gradient(to right, transparent, hsl(var(--border)/0.6), transparent)',
        }}
      />

      {/* Self avatar — always sitting on the right. */}
      <motion.div
        initial={{ y: -20, opacity: 0, scale: 0.7 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16, delay: 0.15 }}
        style={{
          position: 'absolute',
          left: rightSeatX,
          bottom: 8,
          willChange: 'transform',
        }}
      >
        <AvatarBlob name={selfAvatar} leaning={selfTyping} />
      </motion.div>

      {/* Peer avatar — runs in from the left when they join. */}
      <AnimatePresence>
        {peerVisible && (
          <motion.div
            key="peer"
            animate={peerControls}
            initial={{ x: spawnX, opacity: 0, scale: 0.9 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute',
              left: 0,
              bottom: 8,
              willChange: 'transform, opacity',
            }}
          >
            <AvatarBlob name={peerAvatar} leaning={peerTyping} small />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
