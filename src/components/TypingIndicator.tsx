import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import {
  motion,
  AnimatePresence,
  useAnimationControls,
} from 'framer-motion';

import toyBoy from '@/assets/toy-boy.png';
import toyGirl from '@/assets/toy-girl.png';

/**
 * =========================================================
 * ChatPresenceAvatarLayer
 * =========================================================
 *
 * EXACT FLOW IMPLEMENTATION
 *
 * FLOW:
 *
 * 1. First user enters room
 *    → sits immediately on RIGHT
 *
 * 2. Second user enters room
 *    → appears from LEFT
 *    → runs toward waiting user
 *    → slows down
 *    → sits beside waiting user
 *
 * IMPORTANT:
 * - join order decides animation role
 * - reconnects DO NOT replay animation
 * - isolated overlay only
 * - no message rerenders
 * - no websocket modifications
 * - GPU transform only
 *
 * =========================================================
 */

type AvatarGender = 'girl' | 'boy';

const GIRL_NAMES = ['saniya', 'srivalli', 'valli'] as const;
const BOY_NAMES = ['venu', 'vikram', 'mithesh'] as const;

const PALETTE: Record<
  string,
  {
    img: string;
    gender: AvatarGender;
  }
> = {
  saniya: {
    img: toyGirl,
    gender: 'girl',
  },

  srivalli: {
    img: toyGirl,
    gender: 'girl',
  },

  valli: {
    img: toyGirl,
    gender: 'girl',
  },

  venu: {
    img: toyBoy,
    gender: 'boy',
  },

  vikram: {
    img: toyBoy,
    gender: 'boy',
  },

  mithesh: {
    img: toyBoy,
    gender: 'boy',
  },
};

function hashString(s: string): number {
  let h = 0;

  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }

  return h;
}

function detectGender(name?: string): AvatarGender {
  if (!name) return 'boy';

  const first = name
    .trim()
    .toLowerCase()
    .split(/\s+/)[0];

  if ((GIRL_NAMES as readonly string[]).includes(first)) {
    return 'girl';
  }

  if ((BOY_NAMES as readonly string[]).includes(first)) {
    return 'boy';
  }

  return hashString(first) % 2 === 0
    ? 'girl'
    : 'boy';
}

function pickAvatar(
  seed?: string,
  gender?: AvatarGender,
  exclude?: string
): string {
  if (seed) {
    const first = seed
      .trim()
      .toLowerCase()
      .split(/\s+/)[0];

    if (
      PALETTE[first] &&
      PALETTE[first].gender === gender
    ) {
      return first;
    }
  }

  const pool =
    gender === 'girl'
      ? GIRL_NAMES
      : BOY_NAMES;

  const filtered = exclude
    ? pool.filter(x => x !== exclude)
    : pool;

  const arr =
    filtered.length > 0
      ? filtered
      : pool;

  const h = hashString(
    seed || Math.random().toString()
  );

  return arr[h % arr.length];
}

/**
 * =========================================================
 * Avatar Component
 * =========================================================
 */

function AvatarBlob({
  avatar,
  leaning,
  small,
}: {
  avatar: string;
  leaning?: boolean;
  small?: boolean;
}) {
  const meta =
    PALETTE[avatar] ?? PALETTE.saniya;

  const size = small ? 64 : 74;

  return (
    <motion.div
      animate={{
        y: [0, -2, 0],
      }}
      transition={{
        duration: 2.6,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
      style={{
        width: size,
        height: size,
        willChange: 'transform',
      }}
      className="relative"
    >
      <motion.img
        src={meta.img}
        alt=""
        draggable={false}
        loading="lazy"
        animate={{
          rotate: leaning ? -8 : 0,
          y: leaning ? -2 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 200,
          damping: 14,
        }}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          pointerEvents: 'none',
          userSelect: 'none',
          filter:
            'drop-shadow(0 6px 8px rgba(0,0,0,0.45))',
        }}
      />

      {/* shadow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          bottom: -5,
          transform: 'translateX(-50%)',
          width: size * 0.7,
          height: 5,
          borderRadius: '50%',
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.22), rgba(0,0,0,0))',
          filter: 'blur(1px)',
        }}
      />
    </motion.div>
  );
}

/**
 * =========================================================
 * TYPES
 * =========================================================
 */

type PresenceState =
  | 'hidden'
  | 'running'
  | 'sitting'
  | 'leaving';

interface Props {
  selfUserId: string;
  selfName?: string;

  peerUserId: string;
  peerName?: string;

  /**
   * Computed in parent
   */
  waitingUserId?: string;
  joiningUserId?: string;

  /**
   * unique sequence id from server
   * prevents replay on reconnect
   */
  sequenceId?: string;

  peerTyping?: boolean;
  selfTyping?: boolean;

  peerOnline?: boolean;
}

/**
 * =========================================================
 * MAIN COMPONENT
 * =========================================================
 */

export default function ChatPresenceAvatarLayer({
  selfUserId,
  selfName,

  peerUserId,
  peerName,

  waitingUserId,
  joiningUserId,

  sequenceId,

  peerTyping = false,
  selfTyping = false,

  peerOnline = false,
}: Props) {
  /**
   * =========================================================
   * AVATARS
   * =========================================================
   */

  const selfAvatar = useMemo(() => {
    return pickAvatar(
      selfName,
      detectGender(selfName)
    );
  }, [selfName]);

  const peerAvatar = useMemo(() => {
    return pickAvatar(
      peerName,
      detectGender(peerName),
      selfAvatar
    );
  }, [peerName, selfAvatar]);

  /**
   * =========================================================
   * WHO IS WAITING?
   * =========================================================
   */

  const selfIsWaiting =
    selfUserId === waitingUserId;

  const selfIsJoining =
    selfUserId === joiningUserId;

  /**
   * =========================================================
   * RESPONSIVE POSITIONS
   * =========================================================
   */

  const containerRef =
    useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current;

    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setWidth(e.contentRect.width);
      }
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, []);

  /**
   * seat positions
   */

  const waitingSeatX = Math.max(
    0,
    width - 110
  );

  const joiningSeatX = Math.max(
    0,
    width - 190
  );

  const spawnX = -120;

  /**
   * =========================================================
   * WHICH AVATAR IS STATIC?
   * =========================================================
   */

  const waitingAvatar =
    selfIsWaiting
      ? selfAvatar
      : peerAvatar;

  const joiningAvatar =
    selfIsJoining
      ? selfAvatar
      : peerAvatar;

  const waitingLeaning =
    selfIsWaiting
      ? selfTyping
      : peerTyping;

  const joiningLeaning =
    selfIsJoining
      ? selfTyping
      : peerTyping;

  /**
   * =========================================================
   * STATE MACHINE
   * =========================================================
   */

  const [state, dispatch] = useReducer(
    (
      _prev: PresenceState,
      action:
        | 'JOIN'
        | 'SETTLED'
        | 'LEAVE'
        | 'RESET'
    ): PresenceState => {
      switch (action) {
        case 'JOIN':
          return 'running';

        case 'SETTLED':
          return 'sitting';

        case 'LEAVE':
          return 'leaving';

        case 'RESET':
          return 'hidden';

        default:
          return _prev;
      }
    },
    'hidden'
  );

  /**
   * =========================================================
   * PREVENT DUPLICATE PLAY
   * =========================================================
   */

  const lastSequenceRef =
    useRef<string>();

  useEffect(() => {
    if (!sequenceId) return;

    if (
      lastSequenceRef.current === sequenceId
    ) {
      return;
    }

    lastSequenceRef.current =
      sequenceId;

    /**
     * only animate if room has 2 users
     */

    if (
      waitingUserId &&
      joiningUserId
    ) {
      dispatch('JOIN');
    }
  }, [
    sequenceId,
    waitingUserId,
    joiningUserId,
  ]);

  /**
   * leave animation
   */

  useEffect(() => {
    if (!peerOnline) {
      dispatch('LEAVE');
    }
  }, [peerOnline]);

  /**
   * =========================================================
   * RUNNING CONTROLS
   * =========================================================
   */

  const controls =
    useAnimationControls();

  useEffect(() => {
    let cancelled = false;

    async function animate() {
      /**
       * JOIN FLOW
       */

      if (state === 'running') {
        controls.set({
          x: spawnX,
          opacity: 0,
          scale: 0.85,
        });

        /**
         * spawn
         */

        await controls.start({
          opacity: 1,
          scale: 1,
          transition: {
            duration: 0.25,
          },
        });

        if (cancelled) return;

        /**
         * run
         */

        await controls.start({
          x: joiningSeatX + 60,
          transition: {
            duration: 0.9,
            ease: [0.4, 0, 0.2, 1],
          },
        });

        if (cancelled) return;

        /**
         * slowdown
         */

        await controls.start({
          x: joiningSeatX,
          transition: {
            duration: 0.45,
            ease: [0.16, 1, 0.3, 1],
          },
        });

        if (cancelled) return;

        /**
         * landing bounce
         */

        await controls.start({
          y: [0, -6, 0, -2, 0],
          transition: {
            duration: 0.5,
          },
        });

        if (cancelled) return;

        dispatch('SETTLED');
      }

      /**
       * LEAVE FLOW
       */

      if (state === 'leaving') {
        await controls.start({
          rotate: [0, 14, -10, 14, 0],
          transition: {
            duration: 0.6,
          },
        });

        if (cancelled) return;

        await controls.start({
          opacity: 0,
          y: -12,
          transition: {
            duration: 0.35,
          },
        });

        if (cancelled) return;

        dispatch('RESET');
      }
    }

    animate();

    return () => {
      cancelled = true;
    };
  }, [
    state,
    joiningSeatX,
    controls,
  ]);

  /**
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div
      ref={containerRef}
      aria-hidden
      style={{
        position: 'relative',
        width: '100%',
        height: 84,
        overflow: 'hidden',
        pointerEvents: 'none',
        marginBottom: -16,
      }}
    >
      {/* subtle ground line */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: 8,
          height: 1,
          background:
            'linear-gradient(to right, transparent, rgba(255,255,255,0.15), transparent)',
        }}
      />

      {/* ========================================================= */}
      {/* WAITING USER */}
      {/* ========================================================= */}

      <motion.div
        initial={{
          opacity: 0,
          y: -20,
          scale: 0.7,
        }}
        animate={{
          opacity: 1,
          y: 0,
          scale: 1,
        }}
        transition={{
          type: 'spring',
          stiffness: 220,
          damping: 16,
        }}
        style={{
          position: 'absolute',
          left: waitingSeatX,
          bottom: 8,
          willChange: 'transform',
        }}
      >
        <AvatarBlob
          avatar={waitingAvatar}
          leaning={waitingLeaning}
        />
      </motion.div>

      {/* ========================================================= */}
      {/* JOINING USER */}
      {/* ========================================================= */}

      <AnimatePresence>
        {state !== 'hidden' && (
          <motion.div
            key="joining-user"
            animate={controls}
            initial={{
              x: spawnX,
              opacity: 0,
              scale: 0.85,
            }}
            exit={{
              opacity: 0,
            }}
            style={{
              position: 'absolute',
              left: 0,
              bottom: 8,
              willChange:
                'transform, opacity',
            }}
          >
            <AvatarBlob
              avatar={joiningAvatar}
              leaning={joiningLeaning}
              small
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
