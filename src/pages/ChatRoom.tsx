import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, WifiOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { deriveKey, encryptMessage, decryptMessage, generateSenderId } from '@/lib/crypto';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';
import {
  type VSUser,
  markMessagesSeen,
  getPeerUserId,
  getSeenMessageIds,
} from '@/lib/user';

interface Message {
  id: string;
  content: string;
  isOwn: boolean;
  timestamp: string;
}

interface ChatLocationState {
  password?: string;
  user?: VSUser;
}

export default function ChatRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as ChatLocationState | null;
  const password = state?.password;
  const user = state?.user;

  const [messages, setMessages] = useState<Message[]>([]);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [senderId] = useState(() => user?.id ?? generateSenderId());
  const [isTyping, setIsTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [peerUserId, setPeerUserId] = useState<string | null>(null);
  const [seenByPeerIds, setSeenByPeerIds] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const markedSeenIdsRef = useRef<Set<string>>(new Set());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Redirect if no password
  useEffect(() => {
    if (!password || !roomId) {
      navigate('/', { replace: true });
    }
  }, [password, roomId, navigate]);

  // Derive encryption key
  useEffect(() => {
    if (!password || !roomId) return;
    deriveKey(password, roomId).then(setEncryptionKey);
  }, [password, roomId]);

  // Privacy: blur on tab switch
  useEffect(() => {
    const handleVisibility = () => setBlurred(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Disable right-click except on inputs
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        e.preventDefault();
      }
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // Load existing messages
  useEffect(() => {
    if (!roomId || !encryptionKey) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);

      if (data) {
        const decrypted = await Promise.all(
          data.map(async (msg) => ({
            id: msg.id,
            content: await decryptMessage(msg.encrypted_content, encryptionKey),
            isOwn: msg.sender_id === senderId,
            timestamp: msg.created_at,
          }))
        );
        setMessages(decrypted);
      }
    };

    loadMessages();
  }, [roomId, encryptionKey, senderId]);

  // Realtime subscription for new messages
  useEffect(() => {
    if (!roomId || !encryptionKey) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const msg = payload.new as { id: string; sender_id: string; encrypted_content: string; created_at: string };
          if (msg.sender_id === senderId) return; // Skip own messages (already added)
          const content = await decryptMessage(msg.encrypted_content, encryptionKey);
          setMessages(prev => [...prev, {
            id: msg.id,
            content,
            isOwn: false,
            timestamp: msg.created_at,
          }]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, encryptionKey, senderId]);

  // Presence channel for typing & online
  useEffect(() => {
    if (!roomId) return;

    const presence = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: senderId } },
    });

    presence
      .on('presence', { event: 'sync' }, () => {
        const state = presence.presenceState();
        const others = Object.keys(state).filter(k => k !== senderId);
        setPeerOnline(others.length > 0);
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.senderId !== senderId) {
          setIsTyping(true);
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 2000);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presence.track({ online: true });
        }
      });

    return () => {
      supabase.removeChannel(presence);
    };
  }, [roomId, senderId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Fetch peer user id (for "seen by peer" and RLS)
  useEffect(() => {
    if (!roomId || !user?.id) return;
    getPeerUserId(roomId, user.id).then(setPeerUserId);
  }, [roomId, user?.id]);

  // Fetch initial "seen by peer" and subscribe to message_seen for this room
  useEffect(() => {
    if (!roomId || !peerUserId) return;
    getSeenMessageIds(roomId, peerUserId).then(setSeenByPeerIds);
    const channel = supabase
      .channel(`message_seen:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_seen',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as { message_id: string; user_id: string };
          if (row.user_id === peerUserId) {
            setSeenByPeerIds((prev) => new Set(prev).add(row.message_id));
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, peerUserId]);

  // Mark peer messages as seen when they enter the viewport
  useEffect(() => {
    if (!user?.id || !roomId) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const toMark: string[] = [];
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLDivElement;
          const id = el.dataset.messageId;
          const isOwn = el.dataset.isOwn === 'true';
          if (id && !isOwn && !markedSeenIdsRef.current.has(id)) {
            markedSeenIdsRef.current.add(id);
            toMark.push(id);
          }
        });
        if (toMark.length) {
          markMessagesSeen(toMark, user.id, roomId).catch(() => {});
        }
      },
      { root: container, threshold: 0.5 }
    );
    messages.forEach((msg) => {
      if (msg.isOwn) return;
      const el = messageElsRef.current.get(msg.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [messages, user?.id, roomId]);

  const handleSend = useCallback(async (text: string) => {
    if (!encryptionKey || !roomId) return;

    const encrypted = await encryptMessage(text, encryptionKey);
    const tempId = crypto.randomUUID();

    // Optimistic add
    setMessages(prev => [...prev, {
      id: tempId,
      content: text,
      isOwn: true,
      timestamp: new Date().toISOString(),
    }]);

    const { data: inserted } = await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        sender_id: senderId,
        encrypted_content: encrypted,
        message_type: 'text',
      })
      .select('id, created_at')
      .single();

    if (inserted) {
      setMessages(prev =>
        prev.map((m) =>
          m.id === tempId
            ? { ...m, id: inserted.id, timestamp: inserted.created_at }
            : m
        )
      );
    }
  }, [encryptionKey, roomId, senderId]);

  const handleTyping = useCallback(() => {
    if (!roomId) return;
    supabase.channel(`presence-${roomId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { senderId },
    });
  }, [roomId, senderId]);

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId.slice(0, 12) + '...');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!password || !roomId) return null;

  return (
    <div className={`h-screen flex flex-col bg-background transition-all duration-300 ${blurred ? 'blur-lg' : ''}`}>
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-strong border-b border-border/30 px-4 py-3 flex items-center justify-between shrink-0 z-10"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <img src="https://vsimage1.s3.us-east-1.amazonaws.com/vs-logo.png" alt="VaultSecret logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-sm font-semibold gradient-text">VaultSecret</h1>
            <button
              onClick={copyRoomId}
              className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              {roomId.slice(0, 16)}...
              {copied ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
            </button>
            {user && (
              <p className="text-[10px] text-muted-foreground mt-0.5">as {user.full_name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online indicator */}
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
            onClick={() => navigate('/')}
            className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all"
            title="Leave room"
            aria-label="Leave room"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </motion.header>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto py-4 space-y-2"
      >
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col items-center justify-center h-full text-center px-6"
          >
            <div className="w-12 h-12 rounded-2xl overflow-hidden mb-4">
              <img src="https://vsimage1.s3.us-east-1.amazonaws.com/vs-logo.png" alt="VaultSecret logo" className="w-full h-full object-cover" />
            </div>
            <p className="text-muted-foreground text-sm">End-to-end encrypted</p>
            <p className="text-muted-foreground/60 text-xs mt-1">
              Messages are encrypted with your shared password
            </p>
          </motion.div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            ref={(el) => {
              if (el) messageElsRef.current.set(msg.id, el);
              else messageElsRef.current.delete(msg.id);
            }}
            data-message-id={msg.id}
            data-is-own={String(msg.isOwn)}
          >
            <ChatMessage
              content={msg.content}
              isOwn={msg.isOwn}
              timestamp={msg.timestamp}
              seen={msg.isOwn ? seenByPeerIds.has(msg.id) : undefined}
            />
          </div>
        ))}

        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        onTyping={handleTyping}
        disabled={!encryptionKey}
      />
    </div>
  );
}
