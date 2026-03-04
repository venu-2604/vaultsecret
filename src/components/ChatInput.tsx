import { useState, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send, ImagePlus, X, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onSendImage: (file: File) => Promise<void>;
  onTyping: () => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onSendImage, onTyping, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [imagePreview, setImagePreview] = useState<{ file: File; url: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = async () => {
    if (uploading) return;

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

    // Validate: images only, max 10MB
    if (!file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;

    const url = URL.createObjectURL(file);
    setImagePreview({ file, url });

    // Reset input
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
      {/* Image Preview */}
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
          disabled={disabled || uploading}
          className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground transition-all hover:bg-muted/50 disabled:opacity-30 shrink-0"
        >
          <ImagePlus className="w-4 h-4" />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || uploading}
          placeholder={imagePreview ? "Send photo..." : "Type a secret message..."}
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 max-h-32 min-h-[40px]"
          style={{ scrollbarWidth: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={!canSend || disabled || uploading}
          className="gradient-primary p-2.5 rounded-xl text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </motion.div>
  );
}
