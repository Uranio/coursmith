import type { Issue } from "@coursmith/course-schema";

export function IssueList({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {issues.map((i, n) => (
        <li key={n} className="rounded-lg border border-border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                i.severity === "error" ? "bg-danger/15 text-danger" : "bg-warning/20 text-foreground"
              }`}
            >
              {i.severity === "error" ? "Must fix" : "Suggestion"}
            </span>
            <code className="text-xs text-muted">{i.code}</code>
            {i.path && <code className="text-xs text-muted">{i.path}</code>}
          </div>
          <p className="mt-2">{i.message}</p>
          {i.suggestion && <p className="mt-1 text-muted">→ {i.suggestion}</p>}
        </li>
      ))}
    </ul>
  );
}
