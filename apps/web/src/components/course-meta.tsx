const LEVELS = { beginner: 1, intermediate: 2, advanced: 3 } as const;

export function DifficultyMeter({ level }: { level: string }) {
  const n = LEVELS[level as keyof typeof LEVELS] ?? 1;
  return (
    <span aria-hidden className="inline-flex items-end gap-0.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`w-1 rounded-sm ${i <= n ? "bg-primary" : "bg-border"}`} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

export function Stars({ value, count }: { value: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`Rated ${value.toFixed(1)} out of 5`}>
      <svg viewBox="0 0 20 20" className="size-3.5 fill-warning" aria-hidden>
        <path d="M10 1.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L10 14.9l-5.3 2.7 1-5.8L1.5 7.7l5.9-.9z" />
      </svg>
      {value.toFixed(1)}
      {count !== undefined && <span className="text-muted">({count})</span>}
    </span>
  );
}
