import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, ImagePlus, X, Loader2, Pencil } from 'lucide-react';

interface ReplyInfo {
  id: string;
  content: string;
  isOwn: boolean;
  messageType: string;
}

interface EditingMessage {
  id: string;
  content: string;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  onSendImage: (file: File) => Promise<void>;
  onTyping: () => void;
  disabled?: boolean;

  replyTo?: ReplyInfo | null;
  onCancelReply?: () => void;

  editingMessage?: EditingMessage | null;
  onCancelEdit?: () => void;
}

export default function ChatInput({
  onSend,
  onSendImage,
  onTyping,
  disabled,
  replyTo,
  onCancelReply,
  editingMessage,
  onCancelEdit,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Focus when replying
  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  // Load text when editing
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      inputRef.current?.focus();
    }
  }, [editingMessage]);

  const handleSend = async () => {
    if (uploading) return;

    // Send image
    if (imagePreview) {
      setUploading(true);
      try {
        await onSendImage(imagePreview.file);
        URL.revokeObjectURL(imagePreview.url);
        setImagePreview(null);
      } finally {
        setUploading(false);
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed);
    setText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (val: string) => {
    setText(val);
    onTyping();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;

    const url = URL.createObjectURL(file);
    setImagePreview({ file, url });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearPreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview.url);
      setImagePreview(null);
    }
  };

  const canSend = imagePreview || text.trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >

      {/* EDIT MODE */}
      <AnimatePresence>
        {editingMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-yellow-500/10 border-l-2 border-yellow-500/50">
              <Pencil className="w-3.5 h-3.5 text-yellow-500" />

              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold text-yellow-500 block">
                  Editing message
                </span>

                <p className="text-xs text-muted-foreground truncate">
                  {editingMessage.content}
                </p>
              </div>

              <button
                onClick={onCancelEdit}
                className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* REPLY MODE */}
      <AnimatePresence>
        {replyTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 overflow-hidden"
          >
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border-l-2 border-primary/50">
              <div className="flex-1 min-w-0">
                <span className="text-[10px] font-semibold text-primary block">
                  Replying to {replyTo.isOwn ? 'yourself' : 'them'}
                </span>

                {replyTo.messageType === 'image' ? (
                  <span className="text-xs text-muted-foreground italic">
                    📷 Photo
                  </span>
                ) : (
                  <p className="text-xs text-muted-foreground truncate">
                    {replyTo.content}
                  </p>
                )}
              </div>

              <button
                onClick={onCancelReply}
                className="p-1 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* IMAGE PREVIEW */}
      {imagePreview && (
        <div className="mb-2 relative inline-block">
          <img
            src={imagePreview.url}
            alt="Preview"
            className="h-24 w-24 object-cover rounded-xl border border-border/50"
          />

          <button
            onClick={clearPreview}
            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* INPUT BAR */}
      <div className="glass-strong glow-border rounded-2xl flex items-end gap-2 p-2">

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || editingMessage !== null}
          className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground transition-all hover:bg-muted/50 disabled:opacity-30"
        >
          <ImagePlus className="w-4 h-4" />
        </button>

        <textarea
          ref={inputRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || uploading}
          placeholder={
            editingMessage
              ? "Edit message..."
              : imagePreview
              ? "Send photo..."
              : "Type a secret message..."
          }
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 max-h-32 min-h-[40px]"
          style={{ scrollbarWidth: 'none' }}
        />

        <button
          onClick={handleSend}
          disabled={!canSend || disabled || uploading}
          className="gradient-primary p-2.5 rounded-xl text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-30"
        >
          {uploading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />}
        </button>

      </div>
    </motion.div>
  );
}
