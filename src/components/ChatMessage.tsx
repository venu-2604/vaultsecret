import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Check, CheckCheck, X, Ban } from 'lucide-react';
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
  deletedForEveryone?: boolean;
  replyTo?: ReplyInfo | null;
  reactions?: Reaction[];
  onVisible?: (id: string) => void;
  onReply?: (msg: { id: string; content: string; isOwn: boolean; messageType: string }) => void;
  onEdit?: (id: string, content: string) => void;
  onDelete?: (id: string, mode: 'me' | 'everyone') => void;
  onReact?: (id: string, emoji: string) => void;
}

export default function ChatMessage({
  id, content, isOwn, timestamp, seen, messageType = 'text', edited,
  deletedForEveryone, replyTo, reactions, onVisible, onReply, onEdit, onDelete, onReact
}: ChatMessageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const x = useMotionValue(0);
  const replyIconOpacity = useTransform(x, [0, 60], [0, 1]);
  const replyIconScale = useTransform(x, [0, 60], [0.5, 1]);

  const canEdit = isOwn && messageType === 'text' && (Date.now() - new Date(timestamp).getTime()) < 10 * 60 * 1000;

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
  const isVideo = messageType === 'video';
  const isMedia = isImage || isVideo;

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (deletedForEveryone) return;
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
    setShowDeleteOptions(true);
  };

  const handleDeleteForMe = () => {
    onDelete?.(id, 'me');
    setShowDeleteOptions(false);
  };

  const handleDeleteForEveryone = () => {
    onDelete?.(id, 'everyone');
    setShowDeleteOptions(false);
  };
  const handleEditClick = () => {
    if (!onEdit) return;
    onEdit(id, content);
  };


  const handleCancelDelete = () => {
    setShowDeleteOptions(false);
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
          drag={deletedForEveryone ? false : 'x'}
          dragConstraints={{ left: 0, right: 80 }}
          dragElastic={{ left: 0, right: 0.5 }}
          dragSnapToOrigin
          onDragEnd={handleDragEnd}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[75%] z-[1] touch-pan-y"
        >
          {deletedForEveryone ? (
            <MessageContextMenu
              isOwn={isOwn}
              canEdit={false}
              messageType="text"
              content=""
              onReply={() => {}}
              onEdit={() => {}}
              onDelete={() => onDelete?.(id, 'me')}
              onCopyText={() => {}}
              onReact={() => {}}
              deletedForEveryone
            >
              <div
                className={`rounded-2xl px-4 py-2.5 bg-muted/50 border border-border/30 ${
                  isOwn ? 'rounded-br-md' : 'rounded-bl-md'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Ban className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                  <span className="text-sm italic text-muted-foreground">
                    This message was deleted
                  </span>
                </div>
                <div className={`flex items-center gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-[10px] opacity-60 font-mono text-muted-foreground">
                    {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                </div>
              </div>
            </MessageContextMenu>
          ) : (
            <>
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
              ) : replyTo.messageType === 'video' ? (
                <span className="italic">🎬 Video</span>
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
            onEdit={handleEditClick}
            onDelete={handleDelete}
            onCopyText={handleCopyText}
            onReact={handleReact}
          >
            <div
              className={`relative rounded-2xl ${
                isMedia ? 'p-1' : 'px-4 py-2.5'
              } ${
                isOwn
                  ? isMedia ? 'rounded-br-md' : 'gradient-primary text-primary-foreground rounded-br-md'
                  : isMedia ? 'rounded-bl-md' : 'glass rounded-bl-md'
              }`}
            >
              {isImage ? (
                <img
                  src={content}
                  alt="Shared photo"
                  onClick={() => setLightbox(true)}
                  className="rounded-xl max-w-[280px] max-h-[320px] object-cover cursor-pointer hover:opacity-90 transition-opacity"
                  loading="lazy"
                />
              ) : isVideo ? (
                <video
                  src={content}
                  controls
                  playsInline
                  className="rounded-xl max-w-[280px] max-h-[320px] bg-black/50"
                  preload="metadata"
                />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{content}</p>
              )}
              <div className={`flex items-center gap-1 mt-1 ${isMedia ? 'px-2 pb-1' : ''} ${isOwn ? 'justify-end' : 'justify-start'}`}>
                {edited && (
                  <span className="text-[9px] opacity-50 italic mr-0.5">edited</span>
                )}
                <span className={`text-[10px] opacity-60 font-mono ${isMedia ? 'text-muted-foreground' : ''}`}>
                  {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
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
            </>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {showDeleteOptions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm flex items-center justify-center px-6"
            onClick={handleCancelDelete}
          >
            <motion.div
              initial={{ scale: 0.9, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="w-full max-w-xs rounded-2xl bg-popover border border-border/40 shadow-2xl p-4 space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-sm font-semibold">Delete message?</h3>
              <p className="text-xs text-muted-foreground">
                Choose how you want to delete this message.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleDeleteForMe}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-muted/60 hover:bg-muted transition-colors text-foreground text-left"
                >
                  Delete for me
                </button>
                <button
                  onClick={handleDeleteForEveryone}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium bg-destructive/10 hover:bg-destructive/15 text-destructive transition-colors text-left"
                >
                  Delete for everyone
                </button>
                <button
                  onClick={handleCancelDelete}
                  className="w-full rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60 transition-colors text-left"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
