import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, WifiOff } from 'lucide-react';
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
  const [copied, setCopied] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [headerTop, setHeaderTop] = useState(0);
  const [roomError, setRoomError] = useState('');
  const [joined, setJoined] = useState(false);
  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const seenQueueRef = useRef<Set<string>>(new Set());
  const seenFlushRef = useRef<ReturnType<typeof setTimeout>>();
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const presenceChannelRef = useRef<{ untrack: () => void; track: (state: object) => Promise<void> } | null>(null);
  const privacyOverlayRef = useRef<HTMLDivElement | null>(null);

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

    const handleVisibility = () => {
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
  }, []);

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

  // Load existing messages
  useEffect(() => {
    if (!roomId || !encryptionKey || !userId || !joined) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);

      const { data: seenData } = await supabase
        .from('message_seen')
        .select('message_id, user_id')
        .eq('room_id', roomId)
        .neq('user_id', userId);

      const { data: hiddenData } = await (supabase as any)
        .from('message_hidden')
        .select('message_id')
        .eq('room_id', roomId)
        .eq('user_id', userId);

      // Load all reactions for this room's messages
      const msgIds = (data || []).map(m => m.id);
      let reactionsMap = new Map<string, { emoji: string; user_id: string }[]>();
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

      const seenByOther = new Set<string>();
      (seenData || []).forEach(s => seenByOther.add(s.message_id));

      if (data) {
        const decrypted = await Promise.all(
          data.map(async (msg) => {
            const deletedForEveryone = Boolean((msg as any).deleted_for_everyone);
            const isImage = msg.message_type === 'image';
            const content = deletedForEveryone
              ? ''
              : (isImage
                ? msg.encrypted_content
                : await decryptMessage(msg.encrypted_content, encryptionKey));
            return {
              id: msg.id,
              content,
              isOwn: msg.sender_id === userId,
              timestamp: msg.created_at,
              seen: msg.sender_id === userId && seenByOther.has(msg.id),
              messageType: deletedForEveryone ? 'text' : msg.message_type,
              replyToId: (msg as any).reply_to_id || null,
              edited: (msg as any).edited || false,
              deletedForEveryone,
              reactions: aggregateReactions(reactionsMap.get(msg.id) || [], userId),
            };
          })
        );
        setMessages(decrypted);
      }

      if (hiddenData) {
        setHiddenMessageIds(new Set((hiddenData as any[]).map((h: any) => h.message_id)));
      }
    };

    loadMessages();
  }, [roomId, encryptionKey, userId, joined]);

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
          const isImage = msg.message_type === 'image';
          const content = deletedForEveryone
            ? ''
            : (isImage ? msg.encrypted_content : await decryptMessage(msg.encrypted_content, encryptionKey));
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
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const msg = payload.new as any;
          const deletedForEveryone = Boolean(msg.deleted_for_everyone);
          const isImage = msg.message_type === 'image';
          const content = deletedForEveryone
            ? ''
            : (isImage ? msg.encrypted_content : await decryptMessage(msg.encrypted_content, encryptionKey));
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
    const behavior: ScrollBehavior = initialScrollDoneRef.current ? 'smooth' : 'auto';
    messagesEndRef.current.scrollIntoView({ behavior });
    if (!initialScrollDoneRef.current && visibleMessages.length > 0) {
      initialScrollDoneRef.current = true;
    }
  }, [visibleMessages.length, isTyping]);

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

  const handleSendImage = useCallback(async (file: File) => {
    if (!roomId || !userId) return;
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${roomId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(path, file, { contentType: file.type });

    if (uploadError) { console.error('Upload failed:', uploadError); return; }

    const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    const messageId = crypto.randomUUID();
    const currentReplyToId = replyTo?.id || null;

    setMessages(prev => [...prev, {
      id: messageId,
      content: publicUrl,
      isOwn: true,
      timestamp: new Date().toISOString(),
      seen: false,
      messageType: 'image',
      replyToId: currentReplyToId,
      reactions: [],
    }]);
    setReplyTo(null);

    await supabase.from('messages').insert({
      id: messageId,
      room_id: roomId,
      sender_id: userId,
      encrypted_content: publicUrl,
      message_type: 'image',
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
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
            <button onClick={copyRoomId} className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors">
              {roomId.slice(0, 16)}...
              {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
            </button>
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
            onClick={() => {
              try {
                localStorage.removeItem(FORCE_INDEX_KEY);
              } catch {
                // ignore
              }
              window.location.replace('/');
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
      >
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
        onSendImage={handleSendImage}
        onTyping={handleTyping}
        disabled={!encryptionKey || !joined}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
      />
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
