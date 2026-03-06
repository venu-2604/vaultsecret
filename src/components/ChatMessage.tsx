import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Check, CheckCheck, X } from 'lucide-react';
import MessageContextMenu from './MessageContextMenu';
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

interface ChatMessageProps {
  id: string;
  content: string;
  isOwn: boolean;
  timestamp: string;
  seen?: boolean;
  messageType?: string;
  edited?: boolean;
  replyTo?: ReplyInfo | null;
  reactions?: Reaction[];
  onVisible?: (id: string) => void;
  onReply?: (msg: { id: string; content: string; isOwn: boolean; messageType: string }) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string) => void;
  onReact?: (id: string, emoji: string) => void;
}

export default function ChatMessage({
  id, content, isOwn, timestamp, seen, messageType = 'text', edited,
  replyTo, reactions, onVisible, onReply, onEdit, onDelete, onReact
}: ChatMessageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(content);
  const x = useMotionValue(0);
  const replyIconOpacity = useTransform(x, [0, 60], [0, 1]);
  const replyIconScale = useTransform(x, [0, 60], [0.5, 1]);

  const canEdit = isOwn && messageType === 'text' && (Date.now() - new Date(timestamp).getTime()) < 10 * 60 * 1000;

  const startEditing = () => {
    setEditText(content);
    setIsEditing(true);
  };

  const submitEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== content && onEdit) {
      onEdit(id, trimmed);
    }
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditText(content);
  };

  useEffect(() => {
    if (isOwn || !onVisible || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onVisible(id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [id, isOwn, onVisible]);

  const isImage = messageType === 'image';

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x > 60 && onReply) {
      onReply({ id, content, isOwn, messageType });
    }
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(content);
    toast.success('Copied to clipboard');
  };

  const handleReply = () => {
    onReply?.({ id, content, isOwn, messageType });
  };

  const handleDelete = () => {
    onDelete?.(id);
  };

  const handleReact = (emoji: string) => {
    onReact?.(id, emoji);
  };

  return (
    <>
      <div ref={ref} className={`relative flex ${isOwn ? 'justify-end' : 'justify-start'} px-4`}>
        {/* Reply icon on swipe */}
        <motion.div
          style={{ opacity: replyIconOpacity, scale: replyIconScale }}
          className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center z-0"
        >
          <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
        </motion.div>

        <motion.div
          style={{ x }}
          drag="x"
          dragConstraints={{ left: 0, right: 80 }}
          dragElastic={{ left: 0, right: 0.5 }}
          dragSnapToOrigin
          onDragEnd={handleDragEnd}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[75%] z-[1] touch-pan-y"
        >
          {/* Quoted reply bubble */}
          {replyTo && (
            <div
              className={`mb-1 px-3 py-1.5 rounded-xl text-[11px] border-l-2 ${
                isOwn
                  ? 'bg-primary/10 border-primary/40 text-primary/80'
                  : 'bg-muted/60 border-accent/40 text-muted-foreground'
              }`}
            >
              <span className="font-semibold text-[10px] block mb-0.5">
                {replyTo.isOwn ? 'You' : 'Them'}
              </span>
              {replyTo.messageType === 'image' ? (
                <span className="italic">📷 Photo</span>
              ) : (
                <span className="line-clamp-2">{replyTo.content}</span>
              )}
            </div>
          )}

          <MessageContextMenu
            isOwn={isOwn}
            canEdit={canEdit}
            messageType={messageType}
            content={content}
            onReply={handleReply}
            onEdit={startEditing}
            onDelete={handleDelete}
            onCopyText={handleCopyText}
            onReact={handleReact}
          >
            <div
              className={`relative rounded-2xl ${
                isImage ? 'p-1' : 'px-4 py-2.5'
              } ${
                isOwn
                  ? isImage ? 'rounded-br-md' : 'gradient-primary text-primary-foreground rounded-br-md'
                  : isImage ? 'rounded-bl-md' : 'glass rounded-bl-md'
              }`}
            >
              {isEditing ? (
                <div className="flex flex-col gap-1.5 min-w-[180px]">
                  <textarea
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitEdit(); } if (e.key === 'Escape') cancelEdit(); }}
                    className="bg-background/20 text-sm rounded-lg px-2 py-1.5 outline-none resize-none text-inherit"
                    rows={2}
                  />
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={cancelEdit} className="p-1 rounded-lg hover:bg-background/20 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={submitEdit} className="p-1 rounded-lg hover:bg-background/20 transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : isImage ? (
                <img
                  src={content}
                  alt="Shared photo"
                  onClick={() => setLightbox(true)}
                  className="rounded-xl max-w-[280px] max-h-[320px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
              )}
              <div className={`flex items-center gap-1 mt-1 ${isImage ? 'px-2 pb-1' : ''} ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {edited && (
                  <span className="text-[9px] opacity-50 italic mr-0.5">edited</span>
                )}
                <span className={`text-[10px] opacity-60 font-mono ${isImage ? 'text-muted-foreground' : ''}`}>
                  {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {isOwn && (
                  seen
                    ? <CheckCheck className="w-3.5 h-3.5 text-primary" />
                    : <CheckCheck className="w-3 h-3 opacity-50" />
                )}
              </div>
            </div>
          </MessageContextMenu>

          {/* Emoji reactions display */}
          {reactions && reactions.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
              {reactions.map(r => (
                <button
                  key={r.emoji}
                  onClick={() => handleReact(r.emoji)}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all ${
                    r.reacted
                      ? 'bg-primary/15 border-primary/30 text-primary'
                      : 'bg-muted/40 border-border/30 text-muted-foreground hover:bg-muted/60'
                  }`}
                >
                  <span className="text-sm">{r.emoji}</span>
                  {r.count > 1 && <span className="text-[10px] font-medium">{r.count}</span>}
                </button>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && isImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(false)}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-xl flex items-center justify-center p-4"
          >
            <button
              onClick={() => setLightbox(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-muted/50 text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={content}
              alt="Full size photo"
              className="max-w-full max-h-[90vh] object-contain rounded-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
