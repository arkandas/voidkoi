import { cn } from '@/lib/cn';

/**
 * The koi mark. Below 48 px the small-size build (the favicon); larger, the
 * flat build on light and the glowing one on dark, as the brand kit asks.
 */
export function Mark({ size = 32, className }: { size?: number; className?: string }) {
  if (size < 48) {
    return <img src="/icon.svg" alt="" width={size} height={size} draggable={false} className={cn('shrink-0', className)} />;
  }
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      <img src="/brand/mark-flat.svg" alt="" width={size} height={size} draggable={false} className="dark:hidden" />
      <img src="/brand/mark.svg" alt="" width={size} height={size} draggable={false} className="hidden dark:block" />
    </span>
  );
}

/** An app's own icon, from public/apps. */
export function AppIcon({ app, size = 32, className }: { app: string; size?: number; className?: string }) {
  return <img src={`/apps/${app}.svg`} alt="" width={size} height={size} draggable={false} className={cn('shrink-0', className)} />;
}
