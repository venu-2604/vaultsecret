import { motion } from 'framer-motion';

/**
 * Simple "peer is typing" dots indicator shown in the message stream.
 */
export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-1 px-3 py-2 w-fit rounded-2xl bg-muted/40 backdrop-blur-sm"
      aria-label="Peer is typing"
    >
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          className="block w-1.5 h-1.5 rounded-full bg-foreground/60"
          animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.15,
          }}
        />
      ))}
    </motion.div>
  );
}
