import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MoreVertical, Reply, Pencil, Trash2, Copy, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

interface MessageContextMenuProps {
  isOwn: boolean;
  canEdit: boolean;
  messageType: string;
  content: string;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyText: () => void;
  onReact: (emoji: string) => void;
  deletedForEveryone?: boolean;
  children: React.ReactNode;
}

export default function MessageContextMenu({
  isOwn,
  canEdit,
  messageType,
  content,
  onReply,
  onEdit,
  onDelete,
  onCopyText,
  onReact,
  deletedForEveryone,
  children,
}: MessageContextMenuProps) {
  const [open, setOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const isMobile = useIsMobile();
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback(() => setOpen(true), []);
  const closeMenu = useCallback(() => {
    setOpen(false);
    setShowEmojiPicker(false);
  }, []);

  // Long press for mobile
  const handlePointerDown = useCallback(() => {
    if (!isMobile) return;
    longPressTimer.current = setTimeout(() => {
      openMenu();
    }, 500);
  }, [isMobile, openMenu]);

  const handlePointerUp = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handleAction = (action: () => void) => {
    closeMenu();
    action();
  };

  const handleReact = (emoji: string) => {
    closeMenu();
    onReact(emoji);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, closeMenu]);

  const ALL_EMOJIS = [...QUICK_EMOJIS, '🔥', '👏', '💯', '🎉', '😍', '🤔', '😭', '🥳', '💀', '✨'];

  return (
    <div className="relative group" ref={menuRef}>
      {/* 3-dot button for desktop - appears on hover */}
      {!isMobile && (
        <button
          onClick={openMenu}
          className={`absolute top-1 ${isOwn ? '-left-8' : '-right-8'} z-10 p-1 rounded-lg bg-muted/60 backdrop-blur-sm border border-border/30 text-muted-foreground hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover:opacity-100 focus:opacity-100`}
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      )}

      {/* Message content with long-press for mobile */}
      <div
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={(e) => { e.preventDefault(); openMenu(); }}
      >
        {children}
      </div>

      {/* Menu overlay + popup */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop for mobile */}
            {isMobile && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
                onClick={closeMenu}
              />
            )}

            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 8 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className={`z-50 ${
                isMobile
                  ? 'absolute left-0 right-0 bottom-full mb-2'
                  : `absolute ${isOwn ? 'right-0' : 'left-0'} bottom-full mb-2`
              }`}
            >
              <div className={`bg-popover border border-border/50 shadow-2xl overflow-hidden ${
                isMobile ? 'rounded-2xl' : 'rounded-xl min-w-[180px]'
              }`}>
                {!deletedForEveryone && (
                  <>
                {/* Emoji reactions row */}
                <div className="px-3 py-2.5 border-b border-border/30">
                  {!showEmojiPicker ? (
                    <div className="flex items-center gap-1">
                      {QUICK_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(emoji)}
                          className="text-xl p-1.5 rounded-xl hover:bg-muted/60 active:scale-90 transition-all"
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setShowEmojiPicker(true)}
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all text-sm font-bold"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {ALL_EMOJIS.map(emoji => (
                        <button
                          key={emoji}
                          onClick={() => handleReact(emoji)}
                          className="text-xl p-1.5 rounded-xl hover:bg-muted/60 active:scale-90 transition-all"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action options */}
                <div className={`py-1 ${isMobile ? 'pb-2' : ''}`}>
                  <MenuOption icon={<Reply className="w-4 h-4" />} label="Reply" onClick={() => handleAction(onReply)} />
                  
                  {messageType === 'text' && (
                    <MenuOption icon={<Copy className="w-4 h-4" />} label="Copy" onClick={() => handleAction(onCopyText)} />
                  )}

                  {canEdit && (
                    <MenuOption icon={<Pencil className="w-4 h-4" />} label="Edit" onClick={() => handleAction(onEdit)} />
                  )}

                  {isOwn && (
                    <MenuOption
                      icon={<Trash2 className="w-4 h-4" />}
                      label="Delete"
                      onClick={() => handleAction(onDelete)}
                      destructive
                    />
                  )}
                </div>
                  </>
                )}

                {deletedForEveryone && (
                  <div className="py-1">
                    <MenuOption
                      icon={<Trash2 className="w-4 h-4" />}
                      label="Delete for me"
                      onClick={() => handleAction(onDelete)}
                      destructive
                    />
                  </div>
                )}

                {/* Close button for mobile */}
                {isMobile && (
                  <button
                    onClick={closeMenu}
                    className="w-full py-3 text-sm font-medium text-muted-foreground border-t border-border/30 hover:bg-muted/50 transition-colors"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuOption({ icon, label, onClick, destructive }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-popover-foreground hover:bg-muted/50'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
