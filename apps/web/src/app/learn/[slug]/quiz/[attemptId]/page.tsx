import type { Course, QuizAnswer, QuizQuestion, QuizResult } from "@coursmith/course-schema";
import { PASSING_SCORE_PERCENT } from "@coursmith/course-schema";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { QuizForm } from "@/components/quiz/quiz-form";
import { ReviewForm } from "@/components/quiz/review-form";
import { requireUser } from "@/lib/auth";
import { loadAttempt } from "@/lib/quiz-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { startQuiz } from "../../actions";

export const metadata: Metadata = { title: "Final quiz", robots: { index: false } };

export default function QuizPage({ params }: PageProps<"/learn/[slug]/quiz/[attemptId]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading quiz…</p>}>
        <Quiz params={params} />
      </Suspense>
    </main>
  );
}

async function Quiz({ params }: Pick<PageProps<"/learn/[slug]/quiz/[attemptId]">, "params">) {
  const { slug, attemptId } = await params;
  const user = await requireUser(`/learn/${slug}/quiz/${attemptId}`);
  const data = await loadAttempt(attemptId, user.id);
  if (!data) notFound();
  const { attempt, content, paper } = data;

  if (!attempt.submitted_at || !attempt.result) {
    return (
      <>
        <Link href={`/learn/${slug}`} className="text-sm text-muted hover:text-foreground">
          ← Back to the course
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">Final quiz</h1>
        <p className="mt-2 text-muted">
          {content.meta.title} · {paper.length} questions · {PASSING_SCORE_PERCENT}% to pass
        </p>
        <div className="mt-8">
          <QuizForm attemptId={attemptId} paper={paper} />
        </div>
      </>
    );
  }

  const db = createAdminClient();
  const [{ data: cert }, { data: review }] = await Promise.all([
    db.from("certificates").select("code").eq("user_id", user.id).eq("course_id", attempt.course_id).maybeSingle(),
    db.from("course_reviews").select("id").eq("user_id", user.id).eq("course_id", attempt.course_id).maybeSingle(),
  ]);
  return (
    <Result
      slug={slug}
      courseId={attempt.course_id}
      content={content}
      result={attempt.result}
      certificateCode={attempt.passed ? (cert?.code ?? null) : null}
      canReview={Boolean(cert) && !review}
    />
  );
}

function answerText(q: QuizQuestion, a: QuizAnswer | null): string {
  if (a === null || a === undefined || (Array.isArray(a) && a.length === 0)) return "No answer";
  switch (q.type) {
    case "true_false":
      return a ? "True" : "False";
    case "single":
      return q.options.find((o) => o.id === a)?.text ?? "—";
    case "multiple":
      return (a as string[]).map((id) => q.options.find((o) => o.id === id)?.text ?? id).join(" · ");
    case "ordering":
      return (a as string[]).map((id, i) => `${i + 1}. ${q.items.find((o) => o.id === id)?.text ?? id}`).join("  ");
  }
}

function ScoreRing({ percent, passed }: { percent: number; passed: boolean }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className="size-36" role="img" aria-label={`Score ${percent}%`}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke={passed ? "var(--success)" : "var(--danger)"}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * c} ${c}`}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="66" textAnchor="middle" fontSize="26" fontWeight="600" fill="var(--foreground)">
        {Math.round(percent)}%
      </text>
    </svg>
  );
}

function Result({
  slug,
  courseId,
  content,
  result,
  certificateCode,
  canReview,
}: {
  slug: string;
  courseId: string;
  content: Course;
  result: QuizResult;
  certificateCode: string | null;
  canReview: boolean;
}) {
  const byId = new Map(content.finalQuiz.questions.map((q) => [q.id, q]));
  const sectionTitle = new Map(content.sections.map((s) => [s.id, s.title]));
  return (
    <>
      <section className="flex flex-col items-center rounded-card border border-border bg-surface p-8 text-center">
        <ScoreRing percent={result.percent} passed={result.passed} />
        <h1 className="mt-4 text-3xl font-semibold tracking-tight">{result.passed ? "You passed! 🎉" : "Not quite yet"}</h1>
        <p className="mt-2 text-muted">
          {result.correctCount} of {result.total} correct · {PASSING_SCORE_PERCENT}% needed to pass
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {certificateCode && (
            <Link href={`/certificates/${certificateCode}`} className="h-11 rounded-full bg-primary px-6 leading-[2.75rem] font-medium text-primary-foreground">
              View certificate
            </Link>
          )}
          <form action={startQuiz}>
            <input type="hidden" name="slug" value={slug} />
            <button className="h-11 rounded-full border border-border px-6 font-medium hover:bg-surface-muted">
              {result.passed ? "Try again for a better score" : "Retry the quiz"}
            </button>
          </form>
          <Link href={`/learn/${slug}`} className="h-11 rounded-full border border-border px-6 leading-[2.75rem] font-medium hover:bg-surface-muted">
            Back to the course
          </Link>
        </div>
      </section>

      {result.sectionsToReview.length > 0 && (
        <section className="mt-8 rounded-card border border-warning/40 bg-warning/10 p-5">
          <h2 className="font-semibold">Sections to review</h2>
          <ul className="mt-2 list-disc pl-5">
            {result.sectionsToReview.map((id) => (
              <li key={id}>{sectionTitle.get(id) ?? id}</li>
            ))}
          </ul>
        </section>
      )}

      {canReview && (
        <section className="mt-8">
          <ReviewForm courseId={courseId} />
        </section>
      )}

      <h2 className="mt-10 text-xl font-semibold">Your answers</h2>
      <ol className="mt-4 space-y-4">
        {result.results.map((r, i) => {
          const q = byId.get(r.id);
          if (!q) return null;
          return (
            <li key={r.id} className={`rounded-card border p-5 ${r.correct ? "border-success/40" : "border-danger/40"}`}>
              <p className="flex items-start gap-2 font-medium">
                <span className={r.correct ? "text-success" : "text-danger"} aria-label={r.correct ? "Correct" : "Wrong"}>
                  {r.correct ? "✓" : "✗"}
                </span>
                <span>
                  {i + 1}. {q.prompt}
                </span>
              </p>
              <dl className="mt-3 space-y-1 pl-6 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted">Your answer:</dt>
                  <dd>{answerText(q, r.given)}</dd>
                </div>
                {!r.correct && (
                  <div className="flex gap-2">
                    <dt className="text-muted">Correct answer:</dt>
                    <dd className="font-medium">{answerText(q, r.expected)}</dd>
                  </div>
                )}
              </dl>
              <p className="mt-3 pl-6 text-sm text-muted">{r.explanation}</p>
            </li>
          );
        })}
      </ol>
    </>
  );
}
