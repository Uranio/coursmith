import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DifficultyMeter, Stars } from "@/components/course-meta";
import { getCurrentUser } from "@/lib/auth";
import { categoryNames, getCourseBySlug } from "@/lib/catalog";
import { dateFormat, DIFFICULTY_LABEL, duration, languageName } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ReportCourse } from "./report-course";

export async function generateMetadata({ params }: PageProps<"/courses/[slug]">): Promise<Metadata> {
  const data = await getCourseBySlug((await params).slug);
  if (!data) return { title: "Course not found" };
  return {
    title: data.course.title,
    description: data.course.subtitle ?? data.course.description.slice(0, 160),
    openGraph: { images: data.course.cover_url ? [data.course.cover_url] : [] },
  };
}

export default function CoursePage({ params }: PageProps<"/courses/[slug]">) {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-6xl animate-pulse px-4 py-12" />}>
      <Course params={params} />
    </Suspense>
  );
}

async function Course({ params }: Pick<PageProps<"/courses/[slug]">, "params">) {
  const { slug } = await params;
  const [data, categories] = await Promise.all([getCourseBySlug(slug), categoryNames()]);
  if (!data) notFound();
  const { course, author, reviews } = data;
  const outline = course.outline;
  const steps = outline.sections.reduce((n, s) => n + s.steps.length, 0);

  return (
    <main style={course.accent_color ? ({ "--primary": course.accent_color } as React.CSSProperties) : undefined}>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-14">
          <div className="flex flex-col">
            <Link href={`/courses?category=${course.category}`} className="text-sm font-medium text-primary hover:underline">
              {categories[course.category] ?? course.category}
            </Link>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{course.title}</h1>
            {course.subtitle && <p className="mt-3 text-lg text-muted">{course.subtitle}</p>}
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <Fact label="Level">
                <span className="flex items-center gap-1.5">
                  <DifficultyMeter level={course.difficulty} /> {DIFFICULTY_LABEL[course.difficulty]}
                </span>
              </Fact>
              <Fact label="Language">{languageName(course.language)}</Fact>
              <Fact label="Duration">{duration(course.estimated_minutes)}</Fact>
              <Fact label="Content">
                {outline.sections.length} sections · {steps} steps · {outline.quizQuestions}-question quiz
              </Fact>
              {course.rating_count > 0 && (
                <Fact label="Rating">
                  <Stars value={Number(course.rating_avg)} count={course.rating_count} />
                </Fact>
              )}
            </dl>
            <p className="mt-6 text-sm text-muted">
              By{" "}
              <Link href={`/u/${author.username}`} className="font-medium text-foreground hover:underline">
                {author.display_name}
              </Link>{" "}
              · published {dateFormat.format(new Date(course.published_at))}
              {course.learner_count > 0 && ` · ${course.learner_count} learner${course.learner_count === 1 ? "" : "s"}`}
            </p>
            <div className="mt-8">
              <Suspense fallback={<StartLink href={`/login?next=/learn/${course.slug}`} label="Log in to start" />}>
                <StartButton slug={course.slug} courseId={course.id} />
              </Suspense>
            </div>
          </div>
          {course.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.cover_url}
              alt=""
              className="aspect-[1200/630] w-full rounded-card border border-border object-cover shadow-xl shadow-primary/10"
            />
          )}
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="text-xl font-semibold">About this course</h2>
          <p className="mt-3 whitespace-pre-line text-pretty">{course.description}</p>

          <h2 className="mt-10 text-xl font-semibold">What you will learn</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {outline.learningObjectives.map((o) => (
              <li key={o} className="flex gap-2">
                <span aria-hidden className="mt-1 text-success">✓</span>
                {o}
              </li>
            ))}
          </ul>

          <h2 className="mt-10 text-xl font-semibold">Course outline</h2>
          <ol className="mt-4 space-y-3">
            {outline.sections.map((s, i) => (
              <li key={s.id}>
                <details className="group rounded-card border border-border bg-surface" open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 font-mono text-sm text-primary">
                      {i + 1}
                    </span>
                    <span className="flex-1">
                      <span className="block font-medium">{s.title}</span>
                      <span className="block text-sm text-muted">{s.summary}</span>
                    </span>
                    <span className="text-xs text-muted">{s.steps.length} steps</span>
                  </summary>
                  <ol className="border-t border-border px-4 py-3 text-sm">
                    {s.steps.map((st, j) => (
                      <li key={st.id} className="flex gap-3 py-1.5">
                        <span className="w-8 shrink-0 text-right font-mono text-muted">
                          {i + 1}.{j + 1}
                        </span>
                        {st.title}
                      </li>
                    ))}
                    <li className="flex gap-3 py-1.5 text-muted">
                      <span className="w-8 shrink-0" />
                      Section glossary
                    </li>
                  </ol>
                </details>
              </li>
            ))}
            <li className="flex items-center gap-3 rounded-card border border-dashed border-border p-4">
              <span className="grid size-8 place-items-center rounded-full bg-success/15 text-success">★</span>
              <span>
                <span className="block font-medium">Final quiz</span>
                <span className="block text-sm text-muted">
                  {outline.quizQuestions} questions · pass with 70% to earn a certificate
                </span>
              </span>
            </li>
          </ol>

          <h2 className="mt-12 text-xl font-semibold">Reviews</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-muted">No reviews yet. Learners can review a course after passing its quiz.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-card border border-border bg-surface p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Stars value={r.rating} />
                    <span className="font-medium">{r.author}</span>
                    <span className="text-muted">{dateFormat.format(new Date(r.created_at))}</span>
                  </div>
                  {r.body && <p className="mt-2 whitespace-pre-line">{r.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {outline.prerequisites.length > 0 && (
            <div className="rounded-card border border-border bg-surface p-5">
              <h2 className="font-semibold">Prerequisites</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                {outline.prerequisites.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-card border border-border bg-surface p-5 text-sm">
            <h2 className="font-semibold">Learn your way</h2>
            <p className="mt-2 text-muted">
              Switch any time between a guided stepper, scrollytelling, slides and a document view. Every section ends
              with a glossary of the terms it introduces.
            </p>
          </div>
          {course.tags.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {course.tags.map((t) => (
                <li key={t}>
                  <Link href={`/courses?q=${encodeURIComponent(t)}`} className="rounded-full bg-surface-muted px-3 py-1 text-xs hover:bg-border">
                    #{t}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Suspense>
            <ReportCourse courseId={course.id} slug={course.slug} />
          </Suspense>
        </aside>
      </div>
    </main>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium">{children}</dd>
    </div>
  );
}

function StartLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-medium text-primary-foreground shadow-sm hover:opacity-90"
    >
      {label} →
    </Link>
  );
}

async function StartButton({ slug, courseId }: { slug: string; courseId: string }) {
  const user = await getCurrentUser();
  if (!user) return <StartLink href={`/login?next=/learn/${slug}`} label="Log in to start" />;
  const supabase = await createClient();
  const { data: enrollment } = await supabase
    .from("enrollments")
    .select("completed_steps, completed_at")
    .eq("course_id", courseId)
    .maybeSingle();
  const label = enrollment?.completed_at ? "Review course" : enrollment ? "Continue" : "Start course";
  return <StartLink href={`/learn/${slug}`} label={label} />;
}
