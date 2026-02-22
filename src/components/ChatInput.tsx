import { useState, useRef, KeyboardEvent } from 'react';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  onTyping: () => void;
  disabled?: boolean;
}

export default function ChatInput({ onSend, onTyping, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4"
    >
      <div className="glass-strong glow-border rounded-2xl flex items-end gap-2 p-2">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Type a secret message..."
          rows={1}
          className="flex-1 bg-transparent resize-none outline-none text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 max-h-32 min-h-[40px]"
          style={{ scrollbarWidth: 'none' }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="gradient-primary p-2.5 rounded-xl text-primary-foreground transition-all hover:opacity-90 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
