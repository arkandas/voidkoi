import { Card, type CardProps } from '@/components/ui';
import { cn } from '@/lib/cn';

/** The card at the foot of a tool with its reference: formats, syntax, what each option does. */
export function GuideCard({ className, ...props }: CardProps) {
  return <Card className={cn('border-accent/30 bg-accent-soft/50 dark:border-line-strong dark:bg-card', className)} {...props} />;
}
