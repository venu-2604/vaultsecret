import vsCenter from '@/assets/vs-center.png';
import vsRing from '@/assets/vs-ring.png';

interface VSLoaderProps {
  size?: number;
  overlay?: boolean;
}

export default function VSLoader({ size = 120, overlay = true }: VSLoaderProps) {
  const ringSize = size;
  const centerSize = size * 0.5;

  const loader = (
    <div className="flex items-center justify-center" style={{ width: ringSize, height: ringSize, position: 'relative' }}>
      {/* Rotating ring */}
      <img
        src={vsRing}
        alt=""
        className="absolute inset-0 w-full h-full animate-spin-linear"
        draggable={false}
      />
      {/* Fixed VS center */}
      <img
        src={vsCenter}
        alt="VS"
        style={{ width: centerSize, height: centerSize }}
        className="relative z-10 object-contain"
        draggable={false}
      />
    </div>
  );

  if (!overlay) return loader;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      {loader}
    </div>
  );
}
