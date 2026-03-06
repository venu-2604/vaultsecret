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
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [joined, setJoined] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // redirect if missing
  useEffect(() => {
    if (!password || !roomId || !userId) navigate('/');
  }, []);

  // derive key
  useEffect(() => {
    if (!password || !roomId) return;
    deriveKey(password, roomId).then(setEncryptionKey);
  }, [password, roomId]);

  // join room
  useEffect(() => {
    if (!roomId || !userId) return;

    joinRoom(roomId, userId).then(r => {
      if (r.ok) setJoined(true);
      else toast.error(r.error);
    });
  }, []);

  // scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // load messages
  useEffect(() => {
    if (!roomId || !encryptionKey) return;

    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at');

      if (!data) return;

      const parsed = await Promise.all(
        data.map(async (m) => {
          const content =
            m.message_type === 'image'
              ? m.encrypted_content
              : await decryptMessage(m.encrypted_content, encryptionKey);

          return {
            id: m.id,
            content,
            isOwn: m.sender_id === userId,
            timestamp: m.created_at,
            seen: false,
            messageType: m.message_type,
            edited: m.edited || false,
            replyToId: m.reply_to_id,
            reactions: [],
          };
        })
      );

      setMessages(parsed);
    };

    load();
  }, [roomId, encryptionKey]);

  // realtime messages
  useEffect(() => {
    if (!roomId || !encryptionKey) return;

    const channel = supabase
      .channel('room')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        async (payload) => {
          if (payload.eventType === 'INSERT') {
            const msg = payload.new as any;

            const content =
              msg.message_type === 'image'
                ? msg.encrypted_content
                : await decryptMessage(msg.encrypted_content, encryptionKey);

            setMessages((prev) => [
              ...prev,
              {
                id: msg.id,
                content,
                isOwn: msg.sender_id === userId,
                timestamp: msg.created_at,
                seen: false,
                messageType: msg.message_type,
                edited: msg.edited,
                reactions: [],
              },
            ]);
          }

          if (payload.eventType === 'UPDATE') {
            const msg = payload.new as any;

            const content =
              msg.message_type === 'image'
                ? msg.encrypted_content
                : await decryptMessage(msg.encrypted_content, encryptionKey);

            setMessages((prev) =>
              prev.map((m) =>
                m.id === msg.id
                  ? { ...m, content, edited: msg.edited }
                  : m
              )
            );
          }

          if (payload.eventType === 'DELETE') {
            const old = payload.old as any;

            setMessages((prev) => prev.filter((m) => m.id !== old.id));
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [roomId, encryptionKey]);

  // send message OR edit message
  const handleSend = async (text: string) => {
    if (!encryptionKey) return;

    if (editingMessage) {
      const encrypted = await encryptMessage(text, encryptionKey);

      await supabase
        .from('messages')
        .update({
          encrypted_content: encrypted,
          edited: true,
        })
        .eq('id', editingMessage.id);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === editingMessage.id
            ? { ...m, content: text, edited: true }
            : m
        )
      );

      setEditingMessage(null);
      return;
    }

    const encrypted = await encryptMessage(text, encryptionKey);

    await supabase.from('messages').insert({
      room_id: roomId,
      sender_id: userId,
      encrypted_content: encrypted,
    });
  };

  // start edit
  const handleEdit = (msg: Message) => {
    setEditingMessage(msg);
  };

  // delete confirm
  const handleDelete = (id: string) => {
    setDeleteTarget(id);
  };

  const handleDeleteChoice = async (type: 'me' | 'everyone') => {
    if (!deleteTarget) return;

    if (type === 'me') {
      setMessages((prev) => prev.filter((m) => m.id !== deleteTarget));
    }

    if (type === 'everyone') {
      await supabase.from('messages').delete().eq('id', deleteTarget);
    }

    setDeleteTarget(null);
  };

  const copyRoomId = () => {
    if (!roomId) return;

    navigator.clipboard.writeText(roomId);
    toast.success('Room ID copied');
  };

  if (!password || !roomId) return null;

  return (
    <div className="h-screen flex flex-col bg-background">

      {/* HEADER */}

      <header className="border-b px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <img src={vsLogo} className="w-8 h-8 rounded" />

          <div>
            <h1 className="text-sm font-semibold">VaultSecret</h1>

            <button
              onClick={copyRoomId}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              {roomId.slice(0, 10)}...
              <Copy size={12} />
            </button>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="p-2 rounded hover:bg-muted"
        >
          <LogOut size={18} />
        </button>
      </header>

      {/* MESSAGES */}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">

        {messages.map((msg) => (
          <ChatMessage
            key={msg.id}
            id={msg.id}
            content={msg.content}
            isOwn={msg.isOwn}
            timestamp={msg.timestamp}
            seen={msg.seen}
            messageType={msg.messageType}
            edited={msg.edited}
            replyTo={null}
            reactions={msg.reactions}
            onReply={() => {}}
            onEdit={() => handleEdit(msg)}
            onDelete={() => handleDelete(msg.id)}
            onReact={() => {}}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* INPUT */}

      <ChatInput
        onSend={handleSend}
        disabled={!joined}
        editingMessage={editingMessage}
        onCancelEdit={() => setEditingMessage(null)}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* DELETE OPTIONS */}

      <AnimatePresence>

        {deleteTarget && (

          <motion.div
            className="fixed inset-0 bg-black/40 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >

            <motion.div
              className="bg-popover p-6 rounded-xl w-[300px]"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
            >

              <h3 className="font-semibold mb-4">
                Delete message
              </h3>

              <div className="space-y-2">

                <button
                  onClick={() => handleDeleteChoice('me')}
                  className="w-full py-2 rounded bg-muted"
                >
                  Delete for me
                </button>

                <button
                  onClick={() => handleDeleteChoice('everyone')}
                  className="w-full py-2 rounded bg-destructive text-white"
                >
                  Delete for everyone
                </button>

                <button
                  onClick={() => setDeleteTarget(null)}
                  className="w-full py-2 rounded border"
                >
                  Cancel
                </button>

              </div>

            </motion.div>

          </motion.div>
        )}

      </AnimatePresence>

    </div>
  );
}
