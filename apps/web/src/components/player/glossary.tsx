"use client";

import { normalizeTerm, type GlossaryEntry, type PlayerCourse } from "@coursmith/course-schema";
import { Popover } from "radix-ui";
import { createContext, useContext, useMemo, useState } from "react";

interface Entry extends GlossaryEntry {
  sectionIndex: number;
  sectionTitle: string;
}

const GlossaryContext = createContext<Map<string, Entry>>(new Map());

/** Indexes every term and alias of the course, so [[term]] references resolve anywhere. */
export function GlossaryProvider({ course, children }: { course: PlayerCourse; children: React.ReactNode }) {
  const index = useMemo(() => {
    const map = new Map<string, Entry>();
    course.sections.forEach((s, si) => {
      for (const g of s.glossary) {
        const entry = { ...g, sectionIndex: si, sectionTitle: s.title };
        for (const key of [g.term, ...(g.aliases ?? [])].map(normalizeTerm)) if (!map.has(key)) map.set(key, entry);
      }
    });
    return map;
  }, [course]);
  return <GlossaryContext.Provider value={index}>{children}</GlossaryContext.Provider>;
}

/** An inline glossary term: dotted underline, definition on hover, focus or tap. */
export function GlossaryTerm({ term, children }: { term: string; children: React.ReactNode }) {
  const entry = useContext(GlossaryContext).get(normalizeTerm(term));
  const [open, setOpen] = useState(false);
  if (!entry) return <>{children}</>;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="cursor-help rounded-sm font-medium text-inherit underline decoration-primary decoration-dotted decoration-2 underline-offset-4 hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {children}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          sideOffset={6}
          collisionPadding={12}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-[70] max-w-xs rounded-xl border border-border bg-surface p-4 text-sm shadow-xl"
        >
          <p className="font-semibold">{entry.term}</p>
          <p className="mt-1 text-muted">{entry.definition}</p>
          <Popover.Arrow className="fill-surface" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SectionGlossary({ glossary, title }: { glossary: GlossaryEntry[]; title?: string }) {
  return (
    <section aria-label="Section glossary" className="rounded-card border border-border bg-surface p-6">
      <p className="text-xs font-semibold tracking-wider text-primary uppercase">Glossary</p>
      {title && <h3 className="mt-1 text-lg font-semibold">{title}</h3>}
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {[...glossary]
          .sort((a, b) => a.term.localeCompare(b.term))
          .map((g) => (
            <div key={g.term} className="rounded-lg bg-surface-muted/60 p-3">
              <dt className="font-medium">{g.term}</dt>
              <dd className="mt-1 text-sm text-muted">{g.definition}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}

/** Course-wide glossary in a side drawer, searchable. */
export function GlossaryDrawer({ course, open, onClose }: { course: PlayerCourse; open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const entries = useMemo(
    () =>
      course.sections
        .flatMap((s) => s.glossary.map((g) => ({ ...g, section: s.title })))
        .sort((a, b) => a.term.localeCompare(b.term)),
    [course],
  );
  const filtered = entries.filter(
    (e) => !q || e.term.toLowerCase().includes(q.toLowerCase()) || e.definition.toLowerCase().includes(q.toLowerCase()),
  );
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Course glossary"
        className="flex h-full w-full max-w-md flex-col bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      >
        <div className="flex items-center gap-3 border-b border-border p-4">
          <h2 className="text-lg font-semibold">Glossary</h2>
          <span className="text-sm text-muted">{entries.length} terms</span>
          <button onClick={onClose} className="ml-auto rounded-lg px-2 py-1 text-muted hover:bg-surface-muted" aria-label="Close glossary">
            ✕
          </button>
        </div>
        <div className="p-4">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search terms…"
            className="h-10 w-full rounded-lg border border-border bg-surface px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <dl className="flex-1 space-y-4 overflow-y-auto px-4 pb-8">
          {filtered.map((e) => (
            <div key={`${e.section}:${e.term}`}>
              <dt className="font-medium">{e.term}</dt>
              <dd className="mt-0.5 text-sm text-muted">{e.definition}</dd>
              <dd className="mt-0.5 text-xs text-muted/70">{e.section}</dd>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-muted">No terms match.</p>}
        </dl>
      </aside>
    </div>
  );
}
