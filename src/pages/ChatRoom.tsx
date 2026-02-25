import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, Copy, Check, WifiOff } from 'lucide-react';
// import vsLogo from '@/assets/vs-logo.png';
import { supabase } from '@/integrations/supabase/client';
import { deriveKey, encryptMessage, decryptMessage } from '@/lib/crypto';
import { joinRoom, markMessagesSeen } from '@/lib/user';
import ChatMessage from '@/components/ChatMessage';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';

interface Message {
  id: string;
  content: string;
  isOwn: boolean;
  timestamp: string;
  seen: boolean;
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
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [peerOnline, setPeerOnline] = useState(false);
  const [copied, setCopied] = useState(false);
  const [blurred, setBlurred] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [joined, setJoined] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const seenQueueRef = useRef<Set<string>>(new Set());
  const seenFlushRef = useRef<ReturnType<typeof setTimeout>>();

  // Redirect if missing data
  useEffect(() => {
    if (!password || !roomId || !userId) {
      navigate('/', { replace: true });
    }
  }, [password, roomId, userId, navigate]);

  // Derive encryption key
  useEffect(() => {
    if (!password || !roomId) return;
    deriveKey(password, roomId).then(setEncryptionKey);
  }, [password, roomId]);

  // Join room (max 2 participants)
  useEffect(() => {
    if (!roomId || !userId) return;
    joinRoom(roomId, userId).then(result => {
      if (result.ok) {
        setJoined(true);
      } else {
        setRoomError(result.error || 'Cannot join room');
      }
    });
  }, [roomId, userId]);

  // Privacy: blur on tab switch
  useEffect(() => {
    const handleVisibility = () => setBlurred(document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Load existing messages + seen status
  useEffect(() => {
    if (!roomId || !encryptionKey || !userId || !joined) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(200);

      // Load seen statuses
      const { data: seenData } = await supabase
        .from('message_seen')
        .select('message_id, user_id')
        .eq('room_id', roomId);

      const seenMap = new Set<string>();
      (seenData || []).forEach(s => {
        if (s.user_id !== userId) return; // We care about OTHER user seeing OUR messages
        // Actually, we want to know if the OTHER user saw each message
      });
      // Build map: messageId -> seen by someone other than sender
      const seenByOther = new Map<string, boolean>();
      (seenData || []).forEach(s => {
        seenByOther.set(s.message_id, true);
      });

      if (data) {
        const decrypted = await Promise.all(
          data.map(async (msg) => ({
            id: msg.id,
            content: await decryptMessage(msg.encrypted_content, encryptionKey),
            isOwn: msg.sender_id === userId,
            timestamp: msg.created_at,
            seen: seenByOther.has(msg.id) && msg.sender_id === userId,
          }))
        );
        setMessages(decrypted);
      }
    };

    loadMessages();
  }, [roomId, encryptionKey, userId, joined]);

  // Realtime: new messages
  useEffect(() => {
    if (!roomId || !encryptionKey || !userId || !joined) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const msg = payload.new as { id: string; sender_id: string; encrypted_content: string; created_at: string };
          if (msg.sender_id === userId) return;
          const content = await decryptMessage(msg.encrypted_content, encryptionKey);
          setMessages(prev => [...prev, { id: msg.id, content, isOwn: false, timestamp: msg.created_at, seen: false }]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, encryptionKey, userId, joined]);

  // Realtime: seen status updates
  useEffect(() => {
    if (!roomId || !userId || !joined) return;

    const channel = supabase
      .channel(`seen-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_seen', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const seen = payload.new as { message_id: string; user_id: string };
          if (seen.user_id === userId) return; // Ignore own seen events
          setMessages(prev => prev.map(m => m.id === seen.message_id ? { ...m, seen: true } : m));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, userId, joined]);

  // Presence channel for typing & online
  useEffect(() => {
    if (!roomId || !userId || !joined) return;

    const presence = supabase.channel(`presence-${roomId}`, {
      config: { presence: { key: userId } },
    });

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
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presence.track({ online: true });
        }
      });

    return () => { supabase.removeChannel(presence); };
  }, [roomId, userId, joined]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

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

  const handleSend = useCallback(async (text: string) => {
    if (!encryptionKey || !roomId || !userId) return;
    const encrypted = await encryptMessage(text, encryptionKey);
    const tempId = crypto.randomUUID();

    setMessages(prev => [...prev, { id: tempId, content: text, isOwn: true, timestamp: new Date().toISOString(), seen: false }]);

    await supabase.from('messages').insert({
      room_id: roomId,
      sender_id: userId,
      encrypted_content: encrypted,
    });
  }, [encryptionKey, roomId, userId]);

  const handleTyping = useCallback(() => {
    if (!roomId) return;
    supabase.channel(`presence-${roomId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { senderId: userId },
    });
  }, [roomId, userId]);

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
          <button onClick={() => navigate('/')} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Home
          </button>
        </motion.div>
      </div>
    );
  }

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
          <button onClick={() => navigate('/')} className="p-2 rounded-xl hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-all">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </motion.header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-2">
        {messages.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 rounded-2xl overflow-hidden mb-4">
              <img src="https://vsimage1.s3.us-east-1.amazonaws.com/vs-logo.png" alt="VaultSecret logo" className="w-full h-full object-cover" />
            </div>
            <p className="text-muted-foreground text-sm">End-to-end encrypted</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Messages are encrypted with your shared password</p>
          </motion.div>
        )}

        {messages.map(msg => (
          <ChatMessage
            key={msg.id}
            id={msg.id}
            content={msg.content}
            isOwn={msg.isOwn}
            timestamp={msg.timestamp}
            seen={msg.seen}
            onVisible={!msg.isOwn ? handleMessageVisible : undefined}
          />
        ))}

        <AnimatePresence>
          {isTyping && <TypingIndicator />}
        </AnimatePresence>

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onTyping={handleTyping} disabled={!encryptionKey || !joined} />
    </div>
  );
}
