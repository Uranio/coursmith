import type { Issue } from "@coursmith/course-schema";
import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { Suspense } from "react";
import { IssueList } from "@/components/issue-list";
import { StatusBadge } from "@/components/status-badge";
import {
  overrideDecision,
  requireAdmin,
  resolveReport,
  retryModeration,
  setCourseRemoved,
  setReviewVisibility,
  type OverrideDecision,
} from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Moderation", robots: { index: false } };

async function act(formData: FormData) {
  "use server";
  const admin = await requireAdmin();
  const action = String(formData.get("action"));
  const versionId = String(formData.get("versionId") ?? "");
  const courseId = String(formData.get("courseId") ?? "");
  const note = String(formData.get("note") ?? "");
  if (action === "retry") await retryModeration(versionId);
  else if (action === "resolve" || action === "dismiss") {
    await resolveReport(admin.id, String(formData.get("reportId")), action === "resolve" ? "resolved" : "dismissed");
  } else if (action === "show-review" || action === "hide-review") {
    await setReviewVisibility(String(formData.get("reviewId")), action === "show-review");
  }
  else if (action === "remove" || action === "restore") await setCourseRemoved(courseId, action === "remove");
  else if (["approved", "needs_revision", "rejected"].includes(action)) {
    await overrideDecision(admin.id, versionId, action as OverrideDecision, note);
  }
  revalidatePath("/admin");
}

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Moderation</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <Reports />
        <Queue />
      </Suspense>
    </main>
  );
}

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" });
const usd = (n: number) => `$${n.toFixed(3)}`;

async function Queue() {
  await requireAdmin();
  const db = createAdminClient();
  const { data: versions } = await db
    .from("course_versions")
    .select("id, course_id, version_no, status, created_at, submitted_by, title:content->meta->>title, language:content->meta->>language")
    .neq("status", "pending_upload")
    .order("created_at", { ascending: false })
    .limit(50);
  const ids = (versions ?? []).map((v) => v.id);
  const courseIds = [...new Set((versions ?? []).map((v) => v.course_id))];
  const authorIds = [...new Set((versions ?? []).map((v) => v.submitted_by))];

  const [{ data: reviews }, { data: jobs }, { data: courses }, { data: authors }, { data: spend }] = await Promise.all([
    db.from("moderation_reviews").select("version_id, decision, summary, issues, cost_usd, overridden_by, created_at").in("version_id", ids).order("created_at", { ascending: false }),
    db.from("moderation_jobs").select("version_id, status, attempts, last_error").in("version_id", ids),
    db.from("courses").select("id, status, slug").in("id", courseIds),
    db.from("profiles").select("id, username").in("id", authorIds),
    db.from("moderation_reviews").select("cost_usd").gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString()),
  ]);

  const review = new Map<string, { decision: string; summary: string; issues: Issue[]; cost_usd: number; overridden_by: string | null }>();
  for (const r of reviews ?? []) if (!review.has(r.version_id)) review.set(r.version_id, r);
  const job = new Map((jobs ?? []).map((j) => [j.version_id, j]));
  const course = new Map((courses ?? []).map((c) => [c.id, c]));
  const author = new Map((authors ?? []).map((a) => [a.id, a.username]));
  const monthCost = (spend ?? []).reduce((n, r) => n + Number(r.cost_usd), 0);

  return (
    <>
      <p className="mt-2 text-sm text-muted">Moderation spend, last 30 days: {usd(monthCost)}</p>
      <div className="mt-6 space-y-3">
        {(versions ?? []).map((v) => {
          const r = review.get(v.id);
          const j = job.get(v.id);
          const c = course.get(v.course_id);
          return (
            <details key={v.id} className="rounded-card border border-border bg-surface p-4">
              <summary className="flex cursor-pointer flex-wrap items-center gap-3">
                <span className="font-medium">{v.title}</span>
                <span className="text-sm text-muted">
                  v{v.version_no} · {v.language} · @{author.get(v.submitted_by)} · {dateFmt.format(new Date(v.created_at))}
                </span>
                <StatusBadge status={v.status} />
                {c?.status === "removed" && <StatusBadge status="removed" />}
                {j && j.status !== "done" && <StatusBadge status={j.status} />}
                {r && <span className="ml-auto text-xs text-muted">{usd(Number(r.cost_usd))}{r.overridden_by ? " · admin" : ""}</span>}
              </summary>
              {j?.last_error && <p className="mt-3 rounded-lg bg-danger/10 p-3 font-mono text-xs text-danger">{j.last_error}</p>}
              {r && (
                <>
                  <p className="mt-3 text-sm">{r.summary}</p>
                  <IssueList issues={r.issues} />
                </>
              )}
              <form action={act} className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="versionId" value={v.id} />
                <input type="hidden" name="courseId" value={v.course_id} />
                <input name="note" placeholder="Note to the author (optional)" className="h-9 min-w-64 flex-1 rounded-lg border border-border bg-background px-3" />
                <button name="action" value="approved" className="h-9 rounded-lg bg-success px-3 font-medium text-white">Approve</button>
                <button name="action" value="needs_revision" className="h-9 rounded-lg border border-border px-3">Request revision</button>
                <button name="action" value="rejected" className="h-9 rounded-lg border border-danger px-3 text-danger">Reject</button>
                <button name="action" value="retry" className="h-9 rounded-lg border border-border px-3">Re-run agent</button>
                {c && (
                  <button name="action" value={c.status === "removed" ? "restore" : "remove"} className="h-9 rounded-lg border border-border px-3">
                    {c.status === "removed" ? "Restore course" : "Remove course"}
                  </button>
                )}
              </form>
            </details>
          );
        })}
      </div>
    </>
  );
}

async function Reports() {
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: reports }, { data: reviews }] = await Promise.all([
    db.from("reports").select("id, course_id, reason, details, created_at").eq("status", "open").order("created_at"),
    db.from("course_reviews").select("id, course_id, rating, body, created_at").eq("status", "hidden").order("created_at"),
  ]);
  const ids = [...new Set([...(reports ?? []), ...(reviews ?? [])].map((r) => r.course_id))];
  const { data: courses } = ids.length ? await db.from("courses").select("id, title, slug").in("id", ids) : { data: [] };
  const course = new Map((courses ?? []).map((c) => [c.id, c]));
  if (!reports?.length && !reviews?.length) return null;
  return (
    <section className="mt-6 space-y-3">
      {(reports ?? []).map((r) => (
        <form key={r.id} action={act} className="flex flex-wrap items-center gap-3 rounded-card border border-warning/50 bg-warning/10 p-4 text-sm">
          <input type="hidden" name="reportId" value={r.id} />
          <input type="hidden" name="courseId" value={r.course_id} />
          <span className="font-medium">Report: {r.reason}</span>
          <a href={`/courses/${course.get(r.course_id)?.slug}`} className="text-primary hover:underline">
            {course.get(r.course_id)?.title}
          </a>
          {r.details && <span className="w-full text-muted">{r.details}</span>}
          <button name="action" value="remove" className="h-8 rounded-lg border border-danger px-3 text-danger">Remove course</button>
          <button name="action" value="resolve" className="h-8 rounded-lg border border-border px-3">Mark resolved</button>
          <button name="action" value="dismiss" className="h-8 rounded-lg border border-border px-3">Dismiss</button>
        </form>
      ))}
      {(reviews ?? []).map((r) => (
        <form key={r.id} action={act} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 text-sm">
          <input type="hidden" name="reviewId" value={r.id} />
          <span className="font-medium">Review held for checking ({r.rating}★)</span>
          <span className="text-muted">{course.get(r.course_id)?.title}</span>
          <span className="w-full">{r.body}</span>
          <button name="action" value="show-review" className="h-8 rounded-lg border border-border px-3">Publish</button>
          <button name="action" value="hide-review" className="h-8 rounded-lg border border-border px-3">Keep hidden</button>
        </form>
      ))}
    </section>
  );
}
