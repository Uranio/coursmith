import Link from "next/link";
import { Suspense } from "react";
import { CourseCard } from "@/components/course-card";
import { categoryNames, latestCourses } from "@/lib/catalog";

const modes = [
  { name: "Guided stepper", text: "One step at a time, with quick checks along the way." },
  { name: "Scrollytelling", text: "Charts and animations stay in view and change as you read." },
  { name: "Slides", text: "Full-screen, keyboard-driven, ready to present." },
  { name: "Document", text: "A handbook with a sticky outline and glossary beside the text." },
];

const steps = [
  { title: "Install the plugin", text: "Add the Coursmith skill to Claude Code, Codex, Cursor or OpenCode and log in." },
  { title: "Ask your agent", text: "Pick a topic, language and difficulty. Your agent writes steps, visuals, glossary and quiz." },
  { title: "Review & publish", text: "Our review agent checks format, clarity, accuracy and safety, then approves or asks for changes." },
];

export default function Home() {
  return (
    <main>
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)]"
        />
        <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
          <p className="mb-4 inline-flex rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
            Courses crafted with AI agents · reviewed before publishing
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
            Learn anything, step by step, the way you like to learn.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-muted">
            Interactive courses with charts, animations, a glossary for every section and a final quiz that tells you
            what you really learned.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/courses"
              className="rounded-full bg-primary px-5 py-3 font-medium text-primary-foreground shadow-sm hover:opacity-90"
            >
              Browse courses
            </Link>
            <Link href="/publish" className="rounded-full border border-border bg-surface px-5 py-3 font-medium hover:bg-surface-muted">
              Create one with your agent
            </Link>
          </div>
        </div>
      </section>

      <Suspense>
        <NewCourses />
      </Suspense>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Four ways to follow every course</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {modes.map((m) => (
            <div key={m.name} className="rounded-card border border-border bg-surface p-5">
              <h3 className="font-medium">{m.name}</h3>
              <p className="mt-2 text-sm text-muted">{m.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Publish a course from your coding agent</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-card border border-border bg-surface p-5">
              <span className="font-mono text-sm text-primary">0{i + 1}</span>
              <h3 className="mt-2 font-medium">{s.title}</h3>
              <p className="mt-2 text-sm text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

async function NewCourses() {
  const [courses, categories] = await Promise.all([latestCourses(6), categoryNames()]);
  if (courses.length === 0) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">New courses</h2>
        <Link href="/courses" className="text-sm text-primary hover:underline">
          See all
        </Link>
      </div>
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} category={categories[c.category]} />
        ))}
      </div>
    </section>
  );
}
