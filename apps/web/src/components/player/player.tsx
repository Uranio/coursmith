"use client";

import type { PlayerCourse, Section, Step } from "@coursmith/course-schema";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { savePreferredMode, saveProgress, startQuiz, switchToLatestVersion } from "@/app/learn/[slug]/actions";
import type { PlayerData, PlayerMode } from "@/lib/player";
import { BlockView, InlineCheck, type MediaContext } from "./blocks";
import { GlossaryDrawer, GlossaryProvider, SectionGlossary } from "./glossary";

export type Frame =
  | { kind: "section"; si: number; section: Section }
  | { kind: "step"; si: number; ti: number; section: Section; step: Step }
  | { kind: "glossary"; si: number; section: Section }
  | { kind: "finish" };

function buildFrames(course: PlayerCourse): Frame[] {
  const frames: Frame[] = [];
  course.sections.forEach((section, si) => {
    frames.push({ kind: "section", si, section });
    section.steps.forEach((step, ti) => frames.push({ kind: "step", si, ti, section, step }));
    frames.push({ kind: "glossary", si, section });
  });
  frames.push({ kind: "finish" });
  return frames;
}

const MODES: { id: PlayerMode; label: string; icon: string }[] = [
  { id: "stepper", label: "Stepper", icon: "▤" },
  { id: "scrolly", label: "Scroll", icon: "⇅" },
  { id: "slides", label: "Slides", icon: "▭" },
  { id: "document", label: "Document", icon: "☰" },
];

export function Player({ data }: { data: PlayerData }) {
  const { course } = data;
  const frames = useMemo(() => buildFrames(course), [course]);
  const stepIds = useMemo(() => course.sections.flatMap((s) => s.steps.map((st) => st.id)), [course]);
  const media: MediaContext = useMemo(() => ({ assets: data.assets, svgMarkup: data.svgMarkup }), [data.assets, data.svgMarkup]);

  const [mode, setMode] = useState<PlayerMode>(data.mode);
  const [index, setIndex] = useState(() => {
    const i = frames.findIndex((f) => f.kind === "step" && f.step.id === data.lastStepId);
    return i >= 0 ? i : 0;
  });
  const [viewed, setViewed] = useState(() => new Set(data.completedSteps));
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const pending = useRef(new Set<string>());
  const lastStep = useRef<string | null>(data.lastStepId);

  const markViewed = useCallback((stepId: string) => {
    lastStep.current = stepId;
    setViewed((v) => {
      if (v.has(stepId)) return v;
      pending.current.add(stepId);
      return new Set(v).add(stepId);
    });
  }, []);

  // Progress is saved in small batches, and once more when the tab is hidden.
  useEffect(() => {
    const flush = () => {
      if (!pending.current.size && !lastStep.current) return;
      const ids = [...pending.current];
      pending.current.clear();
      saveProgress(data.courseId, ids, lastStep.current).catch(() => ids.forEach((id) => pending.current.add(id)));
    };
    const t = setInterval(flush, 4000);
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [data.courseId]);

  const current = frames[index]!;
  useEffect(() => {
    if ((mode === "stepper" || mode === "slides") && current.kind === "step") markViewed(current.step.id);
  }, [mode, current, markViewed]);

  const changeMode = (m: PlayerMode) => {
    setMode(m);
    savePreferredMode(data.courseId, m).catch(() => undefined);
    if (m === "scrolly" || m === "document") {
      const id = current.kind === "step" ? current.step.id : null;
      requestAnimationFrame(() => id && document.getElementById(`step-${id}`)?.scrollIntoView({ block: "start" }));
    }
  };

  const progress = Math.round((stepIds.filter((id) => viewed.has(id)).length / stepIds.length) * 100);
  const remaining = stepIds.filter((id) => !viewed.has(id));
  const accent = course.meta.accentColor ? ({ "--primary": course.meta.accentColor } as React.CSSProperties) : undefined;

  const finish = (
    <FinishPanel
      data={data}
      remaining={remaining}
      onJump={(id) => {
        const i = frames.findIndex((f) => f.kind === "step" && f.step.id === id);
        if (mode === "stepper" || mode === "slides") setIndex(i);
        else document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: "smooth" });
      }}
      titleOf={(id) => frames.find((f): f is Extract<Frame, { kind: "step" }> => f.kind === "step" && f.step.id === id)?.step.title ?? id}
    />
  );

  return (
    <GlossaryProvider course={course}>
      <div className="fixed inset-0 z-50 flex flex-col bg-background" style={accent}>
        <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur">
          <Link href={`/courses/${data.slug}`} className="rounded-lg px-2 py-1 text-muted hover:bg-surface-muted hover:text-foreground" aria-label="Exit course">
            ←
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{course.meta.title}</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Course progress">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-muted tabular-nums">{progress}%</span>
            </div>
          </div>
          <div role="radiogroup" aria-label="Presentation mode" className="flex rounded-xl border border-border bg-surface p-0.5 text-sm">
            {MODES.map((m) => (
              <button
                key={m.id}
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => changeMode(m.id)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition ${mode === m.id ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"}`}
              >
                <span aria-hidden>{m.icon}</span>
                <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setGlossaryOpen(true)} className="rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-surface-muted">
            Glossary
          </button>
        </header>

        {data.versionId !== data.latestVersionId && (
          <form action={switchToLatestVersion} className="flex flex-wrap items-center gap-3 bg-primary/10 px-4 py-2 text-sm">
            <input type="hidden" name="slug" value={data.slug} />
            <span>The author published an updated version of this course.</span>
            <button className="font-medium text-primary hover:underline">Switch to the new version</button>
          </form>
        )}

        <div className="min-h-0 flex-1">
          {mode === "stepper" && <Stepper frames={frames} index={index} setIndex={setIndex} media={media} viewed={viewed} finish={finish} />}
          {mode === "slides" && <Slides frames={frames} index={index} setIndex={setIndex} media={media} finish={finish} />}
          {mode === "scrolly" && <Scrolly course={course} media={media} onView={markViewed} finish={finish} />}
          {mode === "document" && <DocumentView course={course} media={media} onView={markViewed} viewed={viewed} finish={finish} />}
        </div>
      </div>
      <GlossaryDrawer course={course} open={glossaryOpen} onClose={() => setGlossaryOpen(false)} />
    </GlossaryProvider>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces

function StepBody({ step, media, split }: { step: Step; media: MediaContext; split?: boolean }) {
  const blocks = (
    <div className="space-y-5">
      {step.blocks.map((b, i) => (
        <BlockView key={i} block={b} media={media} />
      ))}
      {step.check && <InlineCheck key={step.id} question={step.check} />}
    </div>
  );
  if (!step.visual) return blocks;
  return (
    <div className={split ? "grid items-start gap-8 lg:grid-cols-2" : "space-y-6"}>
      <div className={split ? "lg:sticky lg:top-4 lg:order-2" : ""}>
        <div className="rounded-card border border-border bg-surface p-4 sm:p-5">
          <BlockView block={step.visual} media={media} />
        </div>
      </div>
      {blocks}
    </div>
  );
}

function SectionIntro({ section, si }: { section: Section; si: number }) {
  return (
    <div className="py-6">
      <p className="font-mono text-sm text-primary">Section {si + 1}</p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{section.title}</h2>
      <p className="mt-4 max-w-2xl text-lg text-muted">{section.summary}</p>
      <ol className="mt-8 space-y-2">
        {section.steps.map((st, i) => (
          <li key={st.id} className="flex gap-3">
            <span className="font-mono text-sm text-muted">
              {si + 1}.{i + 1}
            </span>
            {st.title}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepHeading({ frame }: { frame: Extract<Frame, { kind: "step" }> }) {
  return (
    <div className="mb-6">
      <p className="text-sm text-muted">
        {frame.section.title} · {frame.si + 1}.{frame.ti + 1}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{frame.step.title}</h2>
    </div>
  );
}

function FrameView({ frame, media, finish, split }: { frame: Frame; media: MediaContext; finish: React.ReactNode; split?: boolean }) {
  switch (frame.kind) {
    case "section":
      return <SectionIntro section={frame.section} si={frame.si} />;
    case "step":
      return (
        <>
          <StepHeading frame={frame} />
          <StepBody step={frame.step} media={media} split={split} />
        </>
      );
    case "glossary":
      return <SectionGlossary glossary={frame.section.glossary} title={frame.section.title} />;
    case "finish":
      return <>{finish}</>;
  }
}

function useArrowKeys(onPrev: () => void, onNext: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !target.closest("button"))) {
        e.preventDefault();
        onNext();
      }
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onPrev, onNext]);
}

// ---------------------------------------------------------------------------
// Stepper: one frame per screen, Brilliant-style.

function Stepper({
  frames,
  index,
  setIndex,
  media,
  viewed,
  finish,
}: {
  frames: Frame[];
  index: number;
  setIndex: (i: number) => void;
  media: MediaContext;
  viewed: Set<string>;
  finish: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const go = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(frames.length - 1, i)));
      scroller.current?.scrollTo({ top: 0 });
    },
    [frames.length, setIndex],
  );
  const prev = useCallback(() => go(index - 1), [go, index]);
  const next = useCallback(() => go(index + 1), [go, index]);
  useArrowKeys(prev, next);
  const frame = frames[index]!;

  return (
    <div className="flex h-full flex-col">
      <div ref={scroller} className="flex-1 overflow-y-auto">
        <div key={index} className="animate-[fadein_.35s_ease-out] mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
          <FrameView frame={frame} media={media} finish={finish} />
        </div>
      </div>
      <nav className="flex shrink-0 items-center gap-3 border-t border-border bg-background px-4 py-3" aria-label="Step navigation">
        <button onClick={prev} disabled={index === 0} className="h-10 rounded-lg border border-border px-4 disabled:opacity-40">
          ← Back
        </button>
        <ol className="hidden flex-1 items-center justify-center gap-1 md:flex" aria-label="Steps">
          {frames.map((f, i) => (
            <li key={i}>
              <button
                onClick={() => go(i)}
                aria-label={f.kind === "step" ? f.step.title : f.kind}
                aria-current={i === index ? "step" : undefined}
                className={`block rounded-full transition ${
                  i === index ? "h-2 w-6 bg-primary" : f.kind === "step" && viewed.has(f.step.id) ? "size-2 bg-primary/50" : f.kind === "step" ? "size-2 bg-border" : "size-1.5 bg-border/60"
                }`}
              />
            </li>
          ))}
        </ol>
        <span className="flex-1 text-center text-sm text-muted md:hidden">
          {index + 1} / {frames.length}
        </span>
        <button
          onClick={next}
          disabled={index === frames.length - 1}
          className="h-10 rounded-lg bg-primary px-5 font-medium text-primary-foreground disabled:opacity-40"
        >
          {frame.kind === "section" ? "Start" : "Continue"} →
        </button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slides: large type, full screen, keyboard driven.

function Slides({
  frames,
  index,
  setIndex,
  media,
  finish,
}: {
  frames: Frame[];
  index: number;
  setIndex: (i: number) => void;
  media: MediaContext;
  finish: React.ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const prev = useCallback(() => setIndex(Math.max(0, index - 1)), [index, setIndex]);
  const next = useCallback(() => setIndex(Math.min(frames.length - 1, index + 1)), [index, frames.length, setIndex]);
  useArrowKeys(prev, next);
  const frame = frames[index]!;
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : stage.current?.requestFullscreen());

  return (
    <div ref={stage} className="flex h-full flex-col bg-surface-muted/40">
      <div className="flex flex-1 items-center justify-center overflow-hidden p-3 sm:p-8">
        <div className="flex aspect-video max-h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div key={index} className="animate-[fadein_.3s_ease-out] flex-1 overflow-y-auto p-6 text-[1.05rem] sm:p-12 lg:text-xl">
            {frame.kind === "section" ? (
              <div className="flex h-full flex-col justify-center">
                <p className="font-mono text-primary">Section {frame.si + 1}</p>
                <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">{frame.section.title}</h2>
                <p className="mt-6 max-w-3xl text-xl text-muted">{frame.section.summary}</p>
              </div>
            ) : (
              <FrameView frame={frame} media={media} finish={finish} split />
            )}
          </div>
          <div className="h-1 bg-surface-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${((index + 1) / frames.length) * 100}%` }} />
          </div>
        </div>
      </div>
      <nav className="flex shrink-0 items-center justify-center gap-3 pb-4 text-sm" aria-label="Slide navigation">
        <button onClick={prev} disabled={index === 0} className="size-10 rounded-full border border-border bg-background disabled:opacity-40" aria-label="Previous slide">
          ←
        </button>
        <span className="w-20 text-center text-muted tabular-nums">
          {index + 1} / {frames.length}
        </span>
        <button onClick={next} disabled={index === frames.length - 1} className="size-10 rounded-full border border-border bg-background disabled:opacity-40" aria-label="Next slide">
          →
        </button>
        <button onClick={fullscreen} className="ml-4 rounded-lg border border-border bg-background px-3 py-2">
          ⛶ Full screen
        </button>
      </nav>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scrollytelling: the visual stays pinned and follows the step being read.

function useStepObserver(onActive: (stepId: string) => void, deps: unknown[]) {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-step-id]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) onActive(e.target.getAttribute("data-step-id")!);
      },
      { rootMargin: "-40% 0px -45% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Scrolly({ course, media, onView, finish }: { course: PlayerCourse; media: MediaContext; onView: (id: string) => void; finish: React.ReactNode }) {
  const [active, setActive] = useState(course.sections[0]?.steps[0]?.id);
  useStepObserver(
    (id) => {
      setActive(id);
      onView(id);
    },
    [course],
  );

  return (
    <div className="h-full overflow-y-auto">
      {course.sections.map((section, si) => {
        // Steps without a visual keep showing the last one, so the pinned panel never goes blank.
        let carried: Step["visual"];
        const visualFor = new Map(
          section.steps.map((st) => {
            carried = st.visual ?? carried;
            return [st.id, carried];
          }),
        );
        const activeVisual = visualFor.get(active ?? "") ?? section.steps.find((s) => s.visual)?.visual;
        return (
          <section key={section.id} className="mx-auto max-w-6xl px-4 sm:px-8">
            <div className="py-16">
              <SectionIntro section={section} si={si} />
            </div>
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr]">
              <div>
                {section.steps.map((st, ti) => (
                  <article key={st.id} id={`step-${st.id}`} data-step-id={st.id} className="flex min-h-[75vh] flex-col justify-center py-10">
                    <p className="text-sm text-muted">
                      {si + 1}.{ti + 1}
                    </p>
                    <h3 className="mt-1 text-2xl font-semibold tracking-tight">{st.title}</h3>
                    {st.visual && (
                      <div className="mt-6 rounded-card border border-border bg-surface p-4 lg:hidden">
                        <BlockView block={st.visual} media={media} />
                      </div>
                    )}
                    <div
                      className={`mt-6 space-y-5 rounded-card p-1 transition-opacity duration-300 ${active === st.id ? "opacity-100" : "lg:opacity-40"}`}
                    >
                      {st.blocks.map((b, i) => (
                        <BlockView key={i} block={b} media={media} />
                      ))}
                      {st.check && <InlineCheck question={st.check} />}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden lg:block">
                <div className="sticky top-[15vh] flex min-h-[70vh] items-center">
                  {activeVisual && (
                    <div key={active} className="animate-[fadein_.4s_ease-out] w-full rounded-card border border-border bg-surface p-6 shadow-sm">
                      <BlockView block={activeVisual} media={media} />
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="py-16">
              <SectionGlossary glossary={section.glossary} title={section.title} />
            </div>
          </section>
        );
      })}
      <div className="mx-auto max-w-3xl px-4 pb-24">{finish}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Document: handbook layout with a sticky outline and the current section's glossary.

function DocumentView({
  course,
  media,
  onView,
  viewed,
  finish,
}: {
  course: PlayerCourse;
  media: MediaContext;
  onView: (id: string) => void;
  viewed: Set<string>;
  finish: React.ReactNode;
}) {
  const [activeSection, setActiveSection] = useState(0);
  const sectionOf = useMemo(() => {
    const m = new Map<string, number>();
    course.sections.forEach((s, si) => s.steps.forEach((st) => m.set(st.id, si)));
    return m;
  }, [course]);
  useStepObserver(
    (id) => {
      onView(id);
      setActiveSection(sectionOf.get(id) ?? 0);
    },
    [course],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_260px]">
        <nav className="hidden lg:block" aria-label="Course outline">
          <div className="sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto text-sm">
            <p className="mb-3 font-semibold">Contents</p>
            <ol className="space-y-4">
              {course.sections.map((s, si) => (
                <li key={s.id}>
                  <a href={`#section-${s.id}`} className={`font-medium ${si === activeSection ? "text-primary" : ""}`}>
                    {si + 1}. {s.title}
                  </a>
                  <ol className="mt-1.5 space-y-1 border-l border-border pl-3">
                    {s.steps.map((st) => (
                      <li key={st.id}>
                        <a href={`#step-${st.id}`} className="flex gap-1.5 text-muted hover:text-foreground">
                          <span className={viewed.has(st.id) ? "text-success" : "text-border"} aria-hidden>
                            ●
                          </span>
                          {st.title}
                        </a>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{course.meta.title}</h1>
          {course.meta.subtitle && <p className="mt-2 text-lg text-muted">{course.meta.subtitle}</p>}
          {course.sections.map((s, si) => (
            <section key={s.id} id={`section-${s.id}`} className="mt-14 scroll-mt-6">
              <p className="font-mono text-sm text-primary">Section {si + 1}</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight">{s.title}</h2>
              <p className="mt-2 text-muted">{s.summary}</p>
              {s.steps.map((st, ti) => (
                <div key={st.id} id={`step-${st.id}`} data-step-id={st.id} className="mt-10 scroll-mt-6">
                  <h3 className="text-xl font-semibold">
                    <span className="mr-2 font-mono text-sm text-muted">
                      {si + 1}.{ti + 1}
                    </span>
                    {st.title}
                  </h3>
                  <div className="mt-4">
                    <StepBody step={st} media={media} />
                  </div>
                </div>
              ))}
              <div className="mt-10 xl:hidden">
                <SectionGlossary glossary={s.glossary} title={s.title} />
              </div>
            </section>
          ))}
          <div className="mt-16">{finish}</div>
        </article>

        <aside className="hidden xl:block" aria-label="Section glossary">
          <div className="sticky top-6 max-h-[calc(100vh-8rem)] overflow-y-auto">
            <p className="text-xs font-semibold tracking-wider text-primary uppercase">Glossary</p>
            <p className="mt-1 text-sm font-medium">{course.sections[activeSection]?.title}</p>
            <dl className="mt-4 space-y-3 text-sm">
              {course.sections[activeSection]?.glossary.map((g) => (
                <div key={g.term}>
                  <dt className="font-medium">{g.term}</dt>
                  <dd className="text-muted">{g.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FinishPanel({
  data,
  remaining,
  onJump,
  titleOf,
}: {
  data: PlayerData;
  remaining: string[];
  onJump: (stepId: string) => void;
  titleOf: (stepId: string) => string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-8 text-center">
      <p className="text-4xl" aria-hidden>
        {remaining.length ? "📘" : "🎯"}
      </p>
      <h2 className="mt-3 text-2xl font-semibold">{remaining.length ? "Almost there" : "Ready for the final quiz"}</h2>
      {remaining.length > 0 ? (
        <>
          <p className="mt-2 text-muted">
            Go through every step to unlock the quiz. {remaining.length} step{remaining.length === 1 ? "" : "s"} left:
          </p>
          <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-sm">
            {remaining.slice(0, 6).map((id) => (
              <li key={id}>
                <button onClick={() => onJump(id)} className="text-primary hover:underline">
                  {titleOf(id)}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mx-auto mt-2 max-w-md text-muted">
          {data.course.quizQuestionCount} questions on the whole course. Score 70% or more to pass and earn your
          certificate. You can retry as many times as you like.
        </p>
      )}
      <form action={startQuiz} className="mt-6">
        <input type="hidden" name="slug" value={data.slug} />
        <QuizButton locked={remaining.length > 0} label={data.passed ? "Retake the quiz" : "Start the quiz"} />
      </form>
      {data.certificateCode && (
        <Link href={`/certificates/${data.certificateCode}`} className="mt-4 inline-block text-sm text-primary hover:underline">
          View your certificate
        </Link>
      )}
    </section>
  );
}

function QuizButton({ locked, label }: { locked: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={locked || pending}
      className="h-12 rounded-full bg-primary px-8 font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-40"
    >
      {pending ? "Preparing…" : label}
    </button>
  );
}
