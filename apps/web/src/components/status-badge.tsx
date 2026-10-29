const STYLES: Record<string, { label: string; className: string }> = {
  pending_upload: { label: "Uploading", className: "bg-surface-muted text-muted" },
  validating: { label: "Checking", className: "bg-surface-muted text-muted" },
  in_review: { label: "In review", className: "bg-primary/15 text-primary" },
  needs_revision: { label: "Needs revision", className: "bg-warning/20 text-foreground" },
  approved: { label: "Live", className: "bg-success/15 text-success" },
  rejected: { label: "Rejected", className: "bg-danger/15 text-danger" },
  superseded: { label: "Previous version", className: "bg-surface-muted text-muted" },
  published: { label: "Published", className: "bg-success/15 text-success" },
  draft: { label: "Not published", className: "bg-surface-muted text-muted" },
  removed: { label: "Removed", className: "bg-danger/15 text-danger" },
  queued: { label: "Queued", className: "bg-surface-muted text-muted" },
  running: { label: "Running", className: "bg-primary/15 text-primary" },
  done: { label: "Done", className: "bg-success/15 text-success" },
  failed: { label: "Failed", className: "bg-danger/15 text-danger" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STYLES[status] ?? { label: status, className: "bg-surface-muted text-muted" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.className}`}>
      {s.label}
    </span>
  );
}
