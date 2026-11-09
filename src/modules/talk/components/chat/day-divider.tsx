export function DayDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[11px] font-semibold tracking-wider text-ink-faint uppercase">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
