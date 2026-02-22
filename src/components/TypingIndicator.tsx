import { motion } from 'framer-motion';

export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="flex items-center gap-2 px-4 py-2"
    >
      <div className="glass rounded-2xl px-4 py-3 flex items-center gap-1">
        <span className="typing-dot w-2 h-2 rounded-full bg-primary" />
        <span className="typing-dot w-2 h-2 rounded-full bg-primary" />
        <span className="typing-dot w-2 h-2 rounded-full bg-primary" />
      </div>
    </motion.div>
  );
}
