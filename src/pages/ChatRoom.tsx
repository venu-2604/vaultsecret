import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, WifiOff } from 'lucide-react';
import vsLogo from '@/assets/vs-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { deriveKey, encryptMessage, decryptMessage } from '@/lib/crypto';
import { joinRoom, markMessagesSeen } from '@/lib/user';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';
import { toast } from 'sonner';
import { format, isToday, isYesterday } from 'date-fns';

const FORCE_INDEX_KEY = 'vaultsecret_force_index';

interface ReplyInfo {
  id: string;
  content: string;
  isOwn: boolean;
  messageType: string;
}

interface Reaction {
  emoji: string;
  count: number;
  reacted: boolean;
}

interface Message {
  id: string;
  content: string;
  isOwn: boolean;
  timestamp: string;
  seen: boolean;
  messageType: string;
  replyToId?: string | null;
  edited?: boolean;
  deletedForEveryone?: boolean;
  reactions: Reaction[];
}

export default function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { password?: string; userId?: string; userName?: string } | null;
  const password = state?.password;
  const userId = state?.userId;
  const userName = state?.userName;

  const [messages, setMessages] = useState<Message[]>([]);
  const [hiddenMessageIds, setHiddenMessageIds] = useState<Set<string>>(() => new Set());
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  // Note: removed "copied" UI because header now shows last-seen text only.
  const [blurred, setBlurred] = useState(false);
  const [headerTop, setHeaderTop] = useState(0);
  const [roomError, setRoomError] = useState('');
  const [joined, setJoined] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [unseenNewCount, setUnseenNewCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const isAtBottomRef = useRef(true);
  const seenByOtherRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const seenQueueRef = useRef<Set<string>>(new Set());
  const seenFlushRef = useRef<ReturnType<typeof setTimeout>>();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Supabase presence track() return type differs between versions; keep ref typed loosely.
  const presenceChannelRef = useRef<{ untrack: () => void; track: (state: object) => Promise<any> } | null>(null);
  const privacyOverlayRef = useRef<HTMLDivElement | null>(null);
  const oldestTimestampRef = useRef<string | null>(null);
  const loadingOlderRef = useRef(false);

  // Room-based Last Seen (per-room, based on room_participants table)
  const [otherParticipant, setOtherParticipant] = useState<{ is_online: boolean; last_active: string | null } | null>(null);
  const [lastSeenLoaded, setLastSeenLoaded] = useState(false);

  const visibleMessages = messages.filter(msg => !hiddenMessageIds.has(msg.id));

  // If a previous mobile session requested a forced index redirect, never show chatroom again on reopen
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
    if (!isMobile) return;
    try {
      const shouldForceIndex = localStorage.getItem(FORCE_INDEX_KEY) === '1';
      if (shouldForceIndex) {
        window.location.replace('/');
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Lock document scroll so the header stays fixed when the virtual keyboard opens (mobile)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyHeight = body.style.minHeight;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    body.style.minHeight = '100dvh';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.minHeight = prevBodyHeight;
    };
  }, []);

  // Keep header at top of visual viewport when keyboard opens (mobile)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const isMobile = window.innerWidth <= 768;
      setHeaderTop(isMobile ? vv.offsetTop : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  // Redirect if missing data
  useEffect(() => {
    if (!password || !roomId || !userId) {
      window.location.replace('/');
    }
  }, [password, roomId, userId, navigate]);

  // Derive encryption key
  useEffect(() => {
    if (!password || !roomId) return;
    deriveKey(password, roomId).then(setEncryptionKey);
  }, [password, roomId]);

  // Room-participants upsert helper (room-based Last Seen writes)
  const upsertRoomParticipant = useCallback(
    async (
      updates: { is_online: boolean; last_active?: string },
      logSuffix: string
    ) => {
      if (!roomId || !userId) return;
      console.log(`[LastSeen] upsert ${logSuffix}`, { roomId, userId });
      const payload: any = {
        room_id: roomId,
        user_id: userId,
        is_online: updates.is_online,
      };
      if (updates.last_active !== undefined) payload.last_active = updates.last_active;

      const { error } = await supabase.from('room_participants').upsert(payload, {
        onConflict: 'room_id,user_id',
      });
      if (error) console.error(`[LastSeen] upsert ${logSuffix} failed`, error.message);
    },
    [roomId, userId]
  );

  // Room-based Last Seen: mark current user online on enter, offline on leave.
  // Does NOT modify last_active on leave.
  useEffect(() => {
    if (!roomId || !userId || !joined) return;

    const markOnline = async () => {
      await upsertRoomParticipant(
        // last_active should represent "when user last left/offlined", so do not update it on enter
        { is_online: true },
        'enter'
      );
    };

    const markOffline = async () => {
      // When user leaves the room, store last_active = now
      await upsertRoomParticipant(
        { is_online: false, last_active: new Date().toISOString() },
        'leave'
      );
    };

    void markOnline();
    return () => {
      void markOffline();
    };
  }, [roomId, userId, joined]);

  // Extra safety: if the user closes/navigates away, try to set is_online=false.
  // (May not always complete on abrupt kills, but improves reliability.)
  useEffect(() => {
    if (!roomId || !userId || !joined) return;
    const markOfflineOnUnload = () => {
      void upsertRoomParticipant(
        { is_online: false, last_active: new Date().toISOString() },
        'unload'
      );
    };
    window.addEventListener('pagehide', markOfflineOnUnload);
    window.addEventListener('beforeunload', markOfflineOnUnload);
    return () => {
      window.removeEventListener('pagehide', markOfflineOnUnload);
      window.removeEventListener('beforeunload', markOfflineOnUnload);
    };
  }, [roomId, userId, joined, upsertRoomParticipant]);

  // Room-based Last Seen: load and realtime subscribe to other participant state.
  useEffect(() => {
    if (!roomId || !userId || !joined) return;

    let cancelled = false;

    setLastSeenLoaded(false);

    const loadParticipants = async () => {
      const { data } = await (supabase as any)
        .from('room_participants')
        .select('user_id, is_online, last_active')
        .eq('room_id', roomId);

      if (cancelled) return;

      const other = (data || []).find((p: any) => p.user_id !== userId) as
        | { user_id: string; is_online: boolean; last_active: string | null }
        | undefined;

      if (!other) setOtherParticipant(null);
      else setOtherParticipant({ is_online: Boolean(other.is_online), last_active: other.last_active ?? null });

      setLastSeenLoaded(true);
    };

    void loadParticipants();

    const channel = supabase
      .channel(`room-participants-last-seen-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_participants',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = (payload.new || payload.old) as any;
          if (!row) return;
          if (row.user_id === userId) return; // only care about other user
          setOtherParticipant({
            is_online: Boolean(row.is_online),
            last_active: row.last_active ?? null,
          });
          setLastSeenLoaded(true);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [roomId, userId, joined]);

  // Join room
  useEffect(() => {
    if (!roomId || !userId) return;
    joinRoom(roomId, userId).then(result => {
      if (result.ok) {
        setJoined(true);
        try {
          // New/valid session: clear any previous forced-index flag
          localStorage.removeItem(FORCE_INDEX_KEY);
        } catch {
          // ignore
        }
      } else {
        setRoomError(result.error || 'Cannot join room');
      }
    });
  }, [roomId, userId]);

  // Privacy (mobile + desktop): when tab/window is hidden, overlay + blur so taskbar/Alt+Tab/recent-apps never show chat.
  // On mobile we also redirect to index when user leaves the browser.
  useEffect(() => {
    const PRIVACY_OVERLAY_ID = 'chat-privacy-overlay';

    const removeOverlay = () => {
      const el = privacyOverlayRef.current || document.getElementById(PRIVACY_OVERLAY_ID);
      if (el?.parentNode) {
        el.parentNode.removeChild(el);
        privacyOverlayRef.current = null;
      }
    };

    const addOverlay = () => {
      if (privacyOverlayRef.current || document.getElementById(PRIVACY_OVERLAY_ID)) return;
      const overlay = document.createElement('div');
      overlay.id = PRIVACY_OVERLAY_ID;
      overlay.setAttribute('aria-hidden', 'true');
      Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '99999',
        backgroundColor: '#f3f3f3',
        backgroundImage: 'radial-gradient(circle at 50% 50%, #e5e5e5 0%, #f3f3f3 100%)',
      });
      document.body.appendChild(overlay);
      privacyOverlayRef.current = overlay;
    };

    const handleVisibility = async () => {
      const isHidden = document.hidden;
      const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;

      if (isHidden) {
        // Cover chat immediately so recent-apps preview never shows messages (same-tick)
        addOverlay();
      } else {
        removeOverlay();
      }

      // When leaving: untrack presence so peer sees "Waiting..." not "Online"
      const presence = presenceChannelRef.current;
      if (presence) {
        if (isHidden) {
          presence.untrack();
        } else {
          presence.track({ online: true });
        }
      }

      // Room-based last seen:
      // - is_online toggles on background/foreground
      // - last_active should represent the time we went offline/left (so update only when hidden/offline)
      if (isHidden) {
        await upsertRoomParticipant(
          { is_online: false, last_active: new Date().toISOString() },
          'visibility_hidden'
        );
      } else {
        await upsertRoomParticipant({ is_online: true }, 'visibility_visible');
      }

      if (isMobile && isHidden) {
        // Mark that next time the browser opens on mobile we should force index instead of restoring chat
        try {
          localStorage.setItem(FORCE_INDEX_KEY, '1');
        } catch {
          // ignore
        }
        // Redirect so when user returns they land on index; overlay already hid the chat for snapshot
        window.location.replace('/');
        return;
      }

      setBlurred(isHidden);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      removeOverlay();
    };
  }, [roomId, userId, upsertRoomParticipant]);

  // Auto-logout after inactivity (5 minutes)
  const resetInactivityTimer = useCallback(() => {
    if (!joined) return;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      window.location.replace('/');
    }, 5 * 60 * 1000);
  }, [joined, navigate]);

  useEffect(() => {
    if (!joined) return;
    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];

    const handleActivity = () => resetInactivityTimer();

    resetInactivityTimer();
    events.forEach(event => window.addEventListener(event, handleActivity));

    return () => {
      events.forEach(event => window.removeEventListener(event, handleActivity));
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [joined, resetInactivityTimer]);

  // Helper to aggregate reactions
  const aggregateReactions = (reactionRows: { emoji: string; user_id: string }[], currentUserId: string): Reaction[] => {
    const map = new Map<string, { count: number; reacted: boolean }>();
    for (const r of reactionRows) {
      const existing = map.get(r.emoji) || { count: 0, reacted: false };
      existing.count++;
      if (r.user_id === currentUserId) existing.reacted = true;
      map.set(r.emoji, existing);
    }
    return Array.from(map.entries()).map(([emoji, data]) => ({ emoji, ...data }));
  };

  // Load messages with pagination (WhatsApp-style: newest first, load older on scroll up)
  useEffect(() => {
    if (!roomId || !encryptionKey || !userId || !joined) return;

    const PAGE_SIZE = 50;
    let cancelled = false;

    // reset room-scoped pagination state
    oldestTimestampRef.current = null;
    loadingOlderRef.current = false;
    setLoadingOlder(false);
    setHasMoreMessages(true);
    initialScrollDoneRef.current = false;
    seenByOtherRef.current = new Set();

    const loadInitial = async () => {
      // Seen by other (for my sent messages)
      const { data: seenData } = await supabase
        .from('message_seen')
        .select('message_id, user_id')
        .eq('room_id', roomId)
        .neq('user_id', userId);
      const seenByOther = new Set<string>();
      (seenData || []).forEach(s => seenByOther.add((s as any).message_id));
      seenByOtherRef.current = seenByOther;

      // Hidden messages for me (used by visibleMessages filter)
      const { data: hiddenData } = await (supabase as any)
        .from('message_hidden')
        .select('message_id')
        .eq('room_id', roomId)
        .eq('user_id', userId);
      if (!cancelled && hiddenData) {
        setHiddenMessageIds(new Set((hiddenData as any[]).map((h: any) => h.message_id)));
      }

      // Most recent page of messages (desc), then reverse for ascending render
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      const rows = (data || []) as any[];
      const ordered = [...rows].reverse();
      oldestTimestampRef.current = ordered[0]?.created_at ?? null;
      setHasMoreMessages(rows.length === PAGE_SIZE);

      // Reactions for this batch
      const msgIds = ordered.map(m => m.id);
      const reactionsMap = new Map<string, { emoji: string; user_id: string }[]>();
      if (msgIds.length > 0) {
        const { data: reactionsData } = await (supabase as any)
          .from('message_reactions')
          .select('message_id, emoji, user_id')
          .in('message_id', msgIds);
        for (const r of (reactionsData || []) as any[]) {
          const existing = reactionsMap.get(r.message_id) || [];
          existing.push({ emoji: r.emoji, user_id: r.user_id });
          reactionsMap.set(r.message_id, existing);
        }
      }

      const decrypted = await Promise.all(
        ordered.map(async (msg: any) => {
          const deletedForEveryone = Boolean(msg.deleted_for_everyone);
          const isMediaUrl = msg.message_type === 'image' || msg.message_type === 'video';
          const content = deletedForEveryone
            ? ''
            : (isMediaUrl ? msg.encrypted_content : await decryptMessage(msg.encrypted_content, encryptionKey));
          return {
            id: msg.id,
            content,
            isOwn: msg.sender_id === userId,
            timestamp: msg.created_at,
            seen: msg.sender_id === userId && seenByOther.has(msg.id),
            messageType: deletedForEveryone ? 'text' : msg.message_type,
            replyToId: msg.reply_to_id || null,
            edited: msg.edited || false,
            deletedForEveryone,
            reactions: aggregateReactions(reactionsMap.get(msg.id) || [], userId),
          } as Message;
        })
      );

      if (!cancelled) {
        setMessages(decrypted);
      }
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [roomId, encryptionKey, userId, joined]);

  const loadOlderMessages = useCallback(async () => {
    if (!roomId || !encryptionKey || !userId || !joined) return;
    if (!hasMoreMessages) return;
    if (loadingOlderRef.current) return;
    const oldest = oldestTimestampRef.current;
    if (!oldest) return;

    const PAGE_SIZE = 50;
    const container = messagesContainerRef.current;
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    loadingOlderRef.current = true;
    setLoadingOlder(true);

    try {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .lt('created_at', oldest)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      const rows = (data || []) as any[];
      const ordered = [...rows].reverse();
      if (ordered.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      oldestTimestampRef.current = ordered[0]?.created_at ?? oldestTimestampRef.current;
      if (rows.length < PAGE_SIZE) setHasMoreMessages(false);

      // Reactions for this batch
      const msgIds = ordered.map(m => m.id);
      const reactionsMap = new Map<string, { emoji: string; user_id: string }[]>();
      if (msgIds.length > 0) {
        const { data: reactionsData } = await (supabase as any)
          .from('message_reactions')
          .select('message_id, emoji, user_id')
          .in('message_id', msgIds);
        for (const r of (reactionsData || []) as any[]) {
          const existing = reactionsMap.get(r.message_id) || [];
          existing.push({ emoji: r.emoji, user_id: r.user_id });
          reactionsMap.set(r.message_id, existing);
        }
      }

      const seenByOther = seenByOtherRef.current;
      const decrypted = await Promise.all(
        ordered.map(async (msg: any) => {
          const deletedForEveryone = Boolean(msg.deleted_for_everyone);
          const isMediaUrl = msg.message_type === 'image' || msg.message_type === 'video';
          const content = deletedForEveryone
            ? ''
            : (isMediaUrl ? msg.encrypted_content : await decryptMessage(msg.encrypted_content, encryptionKey));
          return {
            id: msg.id,
            content,
            isOwn: msg.sender_id === userId,
            timestamp: msg.created_at,
            seen: msg.sender_id === userId && seenByOther.has(msg.id),
            messageType: deletedForEveryone ? 'text' : msg.message_type,
            replyToId: msg.reply_to_id || null,
            edited: msg.edited || false,
            deletedForEveryone,
            reactions: aggregateReactions(reactionsMap.get(msg.id) || [], userId),
          } as Message;
        })
      );

      setMessages(prev => [...decrypted, ...prev]);

      // Preserve scroll position after prepending older messages
      queueMicrotask(() => {
        const el = messagesContainerRef.current;
        if (!el) return;
        const newScrollHeight = el.scrollHeight;
        const delta = newScrollHeight - prevScrollHeight;
        el.scrollTop = prevScrollTop + delta;
      });
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [roomId, encryptionKey, userId, joined, hasMoreMessages, aggregateReactions]);

  // Realtime: new messages + edits + deletes
  useEffect(() => {
    if (!roomId || !encryptionKey || !userId || !joined) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const msg = payload.new as any;
          if (msg.sender_id === userId) return;
          const deletedForEveryone = Boolean(msg.deleted_for_everyone);
          const isMediaUrl = msg.message_type === 'image' || msg.message_type === 'video';
          const content = deletedForEveryone
            ? ''
            : (isMediaUrl ? msg.encrypted_content : await decryptMessage(msg.encrypted_content, encryptionKey));
          setMessages(prev => [...prev, {
            id: msg.id,
            content,
            isOwn: false,
            timestamp: msg.created_at,
            seen: false,
            messageType: deletedForEveryone ? 'text' : msg.message_type,
            replyToId: msg.reply_to_id || null,
            edited: msg.edited || false,
            deletedForEveryone,
            reactions: [],
          }]);

          // If user is reading older messages (not at bottom), show jump button + unseen counter (WhatsApp-style)
          if (!isAtBottomRef.current) {
            setUnseenNewCount(c => c + 1);
            setShowJumpToBottom(true);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const msg = payload.new as any;
          const deletedForEveryone = Boolean(msg.deleted_for_everyone);
          const isMediaUrl = msg.message_type === 'image' || msg.message_type === 'video';
          const content = deletedForEveryone
            ? ''
            : (isMediaUrl ? msg.encrypted_content : await decryptMessage(msg.encrypted_content, encryptionKey));
          setMessages(prev =>
            prev.map(m =>
              m.id === msg.id
                ? {
                    ...m,
                    content,
                    edited: msg.edited || false,
                    timestamp: msg.created_at || m.timestamp,
                    deletedForEveryone,
                    messageType: deletedForEveryone ? 'text' : (msg.message_type || m.messageType),
                  }
                : m
            )
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const old = payload.old as any;
          setMessages(prev =>
            prev.map(m =>
              m.id === old.id ? { ...m, deletedForEveryone: true } : m
            )
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, encryptionKey, userId, joined]);

  // Realtime: seen status
  useEffect(() => {
    if (!roomId || !userId || !joined) return;
    const channel = supabase
      .channel(`seen-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_seen', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const seen = payload.new as { message_id: string; user_id: string };
          if (seen.user_id === userId) return;
          seenByOtherRef.current.add(seen.message_id);
          setMessages(prev => prev.map(m => m.id === seen.message_id ? { ...m, seen: true } : m));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, userId, joined]);

  // Realtime: reactions
  useEffect(() => {
    if (!roomId || !userId || !joined) return;
    const channel = supabase
      .channel(`reactions-${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions' },
        async (payload) => {
          // Reload reactions for the affected message
          const msgId = (payload.new as any)?.message_id || (payload.old as any)?.message_id;
          if (!msgId) return;
          const { data } = await (supabase as any)
            .from('message_reactions')
            .select('emoji, user_id')
            .eq('message_id', msgId);
          const reactions = aggregateReactions(((data || []) as any[]).map((r: any) => ({ emoji: r.emoji, user_id: r.user_id })), userId);
          setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, userId, joined]);

  // Realtime: per-user hidden messages ("Delete for me")
  useEffect(() => {
    if (!roomId || !userId || !joined) return;
    const channel = (supabase as any)
      .channel(`hidden-${roomId}-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_hidden', filter: `room_id=eq.${roomId}` },
        (payload: any) => {
          const hidden = payload.new as { message_id: string; user_id: string };
          if (hidden.user_id !== userId) return;
          setHiddenMessageIds(prev => {
            const next = new Set(prev);
            next.add(hidden.message_id);
            return next;
          });
        }
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [roomId, userId, joined]);

  // Presence
  useEffect(() => {
    if (!roomId || !userId || !joined) return;
    const presence = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: userId } },
    });
    presenceChannelRef.current = presence;
    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState();
        const others = Object.keys(state).filter(k => k !== userId);
        setPeerOnline(others.length > 0);
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.senderId !== userId) {
          setIsTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
        }
      })
      .on('broadcast', { event: 'message_deleted' }, (payload) => {
        const messageId = payload.payload?.messageId;
        if (!messageId) return;
        setMessages(prev =>
          prev.map(m =>
            m.id === messageId ? { ...m, deletedForEveryone: true } : m
          )
        );
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await presence.track({ online: true });
      });
    return () => {
      presenceChannelRef.current = null;
      supabase.removeChannel(presence);
    };
  }, [roomId, userId, joined]);

  // Auto-scroll
  useEffect(() => {
    if (!messagesEndRef.current) return;
    if (loadingOlderRef.current) return;
    if (!isAtBottomRef.current && initialScrollDoneRef.current) return;
    const behavior: ScrollBehavior = initialScrollDoneRef.current ? 'smooth' : 'auto';
    messagesEndRef.current.scrollIntoView({ behavior });
    if (!initialScrollDoneRef.current && visibleMessages.length > 0) {
      initialScrollDoneRef.current = true;
    }
  }, [visibleMessages.length, isTyping]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 80;
    setShowJumpToBottom(!isAtBottomRef.current);
    if (isAtBottomRef.current) setUnseenNewCount(0);

    // Load older when near the top
    if (el.scrollTop < 80 && hasMoreMessages && !loadingOlderRef.current) {
      loadOlderMessages();
    }
  }, [hasMoreMessages, loadOlderMessages]);

  const jumpToBottom = useCallback(() => {
    setUnseenNewCount(0);
    setShowJumpToBottom(false);
    isAtBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Flush seen queue
  const flushSeenQueue = useCallback(() => {
    if (!roomId || !userId || seenQueueRef.current.size === 0) return;
    const ids = Array.from(seenQueueRef.current);
    seenQueueRef.current.clear();
    markMessagesSeen(ids, userId, roomId);
  }, [roomId, userId]);

  const handleMessageVisible = useCallback((messageId: string) => {
    seenQueueRef.current.add(messageId);
    clearTimeout(seenFlushRef.current);
    seenFlushRef.current = setTimeout(flushSeenQueue, 500);
  }, [flushSeenQueue]);

  const getReplyInfo = useCallback((replyToId: string | null | undefined): ReplyInfo | null => {
    if (!replyToId) return null;
    const msg = messages.find(m => m.id === replyToId);
    if (!msg) return null;
    return {
      id: msg.id,
      content: msg.deletedForEveryone ? 'This message was deleted' : msg.content,
      isOwn: msg.isOwn,
      messageType: msg.deletedForEveryone ? 'text' : msg.messageType,
    };
  }, [messages]);

  const handleEdit = useCallback(
    async (messageId: string, newContent: string) => {
      if (!encryptionKey || !roomId) return;
      const encrypted = await encryptMessage(newContent, encryptionKey);
      const editedAt = new Date().toISOString();

      setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? { ...m, content: newContent, edited: true, timestamp: editedAt }
            : m
        )
      );

      await supabase
        .from('messages')
        .update({
          encrypted_content: encrypted,
          edited: true,
          created_at: editedAt,
        } as any)
        .eq('id', messageId);
    },
    [encryptionKey, roomId]
  );

  const handleSend = useCallback(
    async (text: string) => {
      if (!roomId || !userId) return;

      // If we are editing an existing message, update instead of sending a new one
      if (editingMessage) {
        await handleEdit(editingMessage.id, text);
        setEditingMessage(null);
        return;
      }

      if (!encryptionKey) return;
      const encrypted = await encryptMessage(text, encryptionKey);
      const messageId = crypto.randomUUID();
      const currentReplyToId = replyTo?.id || null;
      const createdAt = new Date().toISOString();

      setMessages(prev => [
        ...prev,
        {
          id: messageId,
          content: text,
          isOwn: true,
          timestamp: createdAt,
          seen: false,
          messageType: 'text',
          replyToId: currentReplyToId,
          reactions: [],
        },
      ]);
      setReplyTo(null);

      await supabase.from('messages').insert({
        id: messageId,
        room_id: roomId,
        sender_id: userId,
        encrypted_content: encrypted,
        reply_to_id: currentReplyToId,
        created_at: createdAt,
      } as any);
    },
    [editingMessage, handleEdit, encryptionKey, roomId, userId, replyTo]
  );

  const handleSendMedia = useCallback(async (file: File) => {
    if (!roomId || !userId) return;
    const isVideo = file.type.startsWith('video/');
    const defaultExt = isVideo ? 'mp4' : 'jpg';
    const ext = file.name.split('.').pop() || defaultExt;
    const path = `${roomId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(path, file, { contentType: file.type });

    if (uploadError) { console.error('Upload failed:', uploadError); return; }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    const messageId = crypto.randomUUID();
    const currentReplyToId = replyTo?.id || null;
    const messageType = isVideo ? 'video' : 'image';

    setMessages(prev => [...prev, {
      id: messageId,
      content: publicUrl,
      isOwn: true,
      timestamp: new Date().toISOString(),
      seen: false,
      messageType,
      replyToId: currentReplyToId,
      reactions: [],
    }]);
    setReplyTo(null);

    await supabase.from('messages').insert({
      id: messageId,
      room_id: roomId,
      sender_id: userId,
      encrypted_content: publicUrl,
      message_type: messageType,
      reply_to_id: currentReplyToId,
    } as any);
  }, [roomId, userId, replyTo]);

  const handleTyping = useCallback(() => {
    if (!roomId) return;
    supabase.channel(`presence-${roomId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { senderId: userId },
    });
  }, [roomId, userId]);

  const handleReply = useCallback((msg: ReplyInfo) => {
    setReplyTo(msg);
  }, []);

  const handleStartEdit = useCallback(
    (messageId: string, content: string) => {
      setReplyTo(null);
      setEditingMessage({ id: messageId, content });
    },
    []
  );

  const handleDelete = useCallback(
    async (messageId: string, mode: 'me' | 'everyone') => {
      if (!roomId || !userId) return;

      if (mode === 'me') {
        setHiddenMessageIds(prev => {
          const next = new Set(prev);
          next.add(messageId);
          return next;
        });

        const { error } = await (supabase as any).from('message_hidden').upsert({
          room_id: roomId,
          user_id: userId,
          message_id: messageId,
        });

        if (error) {
          toast.error('Failed to hide message');
          console.error('Hide error:', error);
        }

        return;
      }

      let backup: Message | null = null;
      setMessages(prev =>
        prev.map(m => {
          if (m.id !== messageId) return m;
          backup = m;
          return { ...m, content: '', messageType: 'text', deletedForEveryone: true };
        })
      );

      supabase.channel(`presence-${roomId}`).send({
        type: 'broadcast',
        event: 'message_deleted',
        payload: { messageId },
      });

      // Soft delete like WhatsApp: keep row, mark as deleted
      const { error } = await supabase
        .from('messages')
        .update({
          deleted_for_everyone: true,
          deleted_at: new Date().toISOString(),
        } as any)
        .eq('id', messageId);

      if (error) {
        toast.error('Failed to delete message');
        console.error('Delete error:', error);
        if (backup) {
          setMessages(prev => prev.map(m => (m.id === messageId ? backup! : m)));
        }
      }
    },
    [roomId, userId]
  );

  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    if (!userId) return;
    // Check if already reacted with this emoji - toggle
    const msg = messages.find(m => m.id === messageId);
    const existing = msg?.reactions.find(r => r.emoji === emoji && r.reacted);
    
    if (existing) {
      // Remove reaction
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        return { ...m, reactions: m.reactions.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, reacted: false } : r).filter(r => r.count > 0) };
      }));
      await (supabase as any).from('message_reactions').delete()
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .eq('emoji', emoji);
    } else {
      // Add reaction
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const existingR = m.reactions.find(r => r.emoji === emoji);
        if (existingR) {
          return { ...m, reactions: m.reactions.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, reacted: true } : r) };
        }
        return { ...m, reactions: [...m.reactions, { emoji, count: 1, reacted: true }] };
      }));
      await (supabase as any).from('message_reactions').insert({
        message_id: messageId,
        user_id: userId,
        emoji,
      });
    }
  }, [userId, messages]);

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId.slice(0, 12) + '...');
    }
  };

  const formatLastSeen = (isoTimestamp: string) => {
    const d = new Date(isoTimestamp);
    if (Number.isNaN(d.getTime())) return 'No last seen';

    const time = format(d, 'hh:mm a');
    if (isToday(d)) return `Last seen at ${time}`;
    if (isYesterday(d)) return `Last seen yesterday at ${time}`;
    return `Last seen on ${format(d, 'dd MMM')} at ${time}`;
  };

  const otherIsOnline = otherParticipant?.is_online === true;
  const lastSeenText =
    !lastSeenLoaded
      ? ''
      : otherIsOnline
        ? ''
        : !otherParticipant || !otherParticipant.last_active
          ? 'No last seen'
          : formatLastSeen(otherParticipant.last_active);

  if (!password || !roomId || !userId) return null;

  if (roomError) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center px-6">
          <p className="text-destructive font-semibold mb-2">{roomError}</p>
          <button onClick={() => window.location.replace('/')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

  const getMessageDateLabel = (isoTimestamp: string) => {
    const d = new Date(isoTimestamp);
    if (Number.isNaN(d.getTime())) return '';
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    return format(d, 'MMM d, yyyy');
  };

  const getMessageDayKey = (isoTimestamp: string) => {
    const d = new Date(isoTimestamp);
    if (Number.isNaN(d.getTime())) return isoTimestamp;
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  };

  return (
    <div
      className={`fixed inset-0 h-[100dvh] max-h-[100dvh] flex flex-col overflow-hidden bg-background transition-all duration-300 ${blurred ? 'blur-lg' : ''}`}
    >
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong fixed inset-x-0 top-0 z-30 border-b border-border/30 px-4 py-3 flex items-center justify-between shrink-0 sm:relative sm:inset-auto"
        style={headerTop > 0 ? { top: headerTop } : undefined}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <img src={vsLogo} alt="VaultSecret logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-semibold gradient-text">VaultSecret</h1>
            {lastSeenText ? (
              <button
                onClick={copyRoomId}
                className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                {lastSeenText}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 mr-2">
            <span className="text-xs text-muted-foreground font-medium">{userName}</span>
          </div>
          <div className="flex items-center gap-2">
            {peerOnline ? (
              <>
                <div className="w-2 h-2 rounded-full bg-success pulse-online" />
                <span className="text-xs text-success">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Waiting...</span>
              </>
            )}
          </div>
          <button
            onClick={async () => {
              try {
                localStorage.removeItem(FORCE_INDEX_KEY);
              } catch {
                // ignore
              }

              // Navigate immediately for fast render, update DB in background
              navigate('/', { replace: true });

              // Fire-and-forget: mark offline
              upsertRoomParticipant(
                { is_online: false, last_active: new Date().toISOString() },
                'manual_logout'
              ).catch(() => {});
            }}
            className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </motion.header>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto overscroll-contain pb-4 space-y-2 pt-16 sm:pt-4"
        style={headerTop > 0 ? { paddingTop: 64 + headerTop } : undefined}
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
      >
        {loadingOlder && (
          <div className="flex items-center justify-center py-2">
            <div className="text-[11px] text-muted-foreground">Loading older messages…</div>
          </div>
        )}
        {visibleMessages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-2xl overflow-hidden mb-4">
              <img src={vsLogo} alt="VaultSecret logo" className="w-full h-full object-cover" />
            </div>
            <p className="text-muted-foreground text-sm">End-to-end encrypted</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Messages are encrypted with your shared password</p>
          </motion.div>
        )}

        {visibleMessages.map((msg, idx) => {
          const currentDayKey = getMessageDayKey(msg.timestamp);
          const prevDayKey = idx > 0 ? getMessageDayKey(visibleMessages[idx - 1].timestamp) : null;
          const showDivider = idx === 0 || currentDayKey !== prevDayKey;
          const label = showDivider ? getMessageDateLabel(msg.timestamp) : '';

          return (
            <div key={msg.id}>
              {showDivider && label && <DateDivider label={label} />}
              <ChatMessage
                id={msg.id}
                content={msg.content}
                isOwn={msg.isOwn}
                timestamp={msg.timestamp}
                seen={msg.seen}
                messageType={msg.messageType}
                edited={msg.edited}
                deletedForEveryone={msg.deletedForEveryone}
                replyTo={getReplyInfo(msg.replyToId)}
                reactions={msg.reactions}
                onVisible={!msg.isOwn ? handleMessageVisible : undefined}
                onReply={handleReply}
                onEdit={handleStartEdit}
                onDelete={handleDelete}
                onReact={handleReact}
              />
            </div>
          );
        })}

        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onSendMedia={handleSendMedia}
        onTyping={handleTyping}
        disabled={!encryptionKey || !joined}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
      />

      {showJumpToBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="fixed left-1/2 -translate-x-1/2 z-40 rounded-full shadow-lg border border-border/50 bg-background/95 backdrop-blur px-3 py-2 text-xs text-foreground hover:bg-muted/50 transition"
          style={{ bottom: headerTop > 0 ? 104 : 96 }}
        >
          <span className="flex items-center gap-2">
            <span className="text-sm leading-none">↓</span>
            <span>New messages</span>
            {unseenNewCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-success text-success-foreground text-[11px] flex items-center justify-center font-semibold">
                {unseenNewCount > 99 ? '99+' : unseenNewCount}
              </span>
            )}
          </span>
        </button>
      )}
    </div>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="px-3 py-1 rounded-full bg-muted/60 border border-border/30 text-[11px] font-medium text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
