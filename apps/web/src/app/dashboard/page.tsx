import type { Issue } from "@coursmith/course-schema";
import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Suspense } from "react";
import { IssueList } from "@/components/issue-list";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard" };

async function revokeToken(formData: FormData) {
  "use server";
  const user = await requireUser("/dashboard");
  const id = String(formData.get("id") ?? "");
  // api_tokens has no update policy for users; ownership is enforced by the user_id filter.
  await createAdminClient()
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null);
  revalidatePath("/dashboard");
}

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <Suspense fallback={<p className="text-muted">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

interface VersionRow {
  id: string;
  course_id: string;
  version_no: number;
  status: string;
  created_at: string;
  title: string;
}

interface ReviewRow {
  version_id: string;
  decision: string;
  summary: string;
  issues: Issue[];
  created_at: string;
}

const dateFmt = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

async function Dashboard() {
  const user = await requireUser("/dashboard");
  const supabase = await createClient();

  const [{ data: courses }, { data: versions }, { data: reviews }, { data: tokens }, { data: learning }, { data: certs }] = await Promise.all([
    supabase.from("courses").select("id, slug, status, title").eq("author_id", user.id),
    supabase
      .from("course_versions")
      .select("id, course_id, version_no, status, created_at, title:content->meta->>title")
      .eq("submitted_by", user.id)
      .neq("status", "pending_upload")
      .order("version_no", { ascending: false }),
    supabase
      .from("moderation_reviews")
      .select("version_id, decision, summary, issues, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("api_tokens")
      .select("id, name, token_prefix, created_at, last_used_at, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("enrollments")
      .select("course_id, version_id, completed_steps, completed_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase.from("certificates").select("code, course_id, score_percent").eq("user_id", user.id),
  ]);
  const learningIds = (learning ?? []).map((e) => e.course_id);
  const { data: learningCourses } = learningIds.length
    ? await supabase.from("courses").select("id, slug, title, cover_url, outline").in("id", learningIds)
    : { data: [] };
  const learningCourse = new Map((learningCourses ?? []).map((c) => [c.id, c]));
  const certificate = new Map((certs ?? []).map((c) => [c.course_id, c]));

  const latestReview = new Map<string, ReviewRow>();
  for (const r of (reviews ?? []) as ReviewRow[]) if (!latestReview.has(r.version_id)) latestReview.set(r.version_id, r);
  const versionsByCourse = new Map<string, VersionRow[]>();
  for (const v of (versions ?? []) as VersionRow[]) {
    versionsByCourse.set(v.course_id, [...(versionsByCourse.get(v.course_id) ?? []), v]);
  }
  const authored = (courses ?? []).filter((c) => versionsByCourse.has(c.id));

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Hi, {user.displayName}</h1>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">Learning</h2>
        {(learning ?? []).length === 0 ? (
          <p className="mt-4 rounded-card border border-dashed border-border p-6 text-muted">
            You have not started a course yet.{" "}
            <Link href="/courses" className="text-primary hover:underline">
              Browse the catalog
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {(learning ?? []).map((e) => {
              const c = learningCourse.get(e.course_id);
              if (!c?.slug) return null;
              const total = (c.outline?.sections ?? []).reduce((n: number, s: { steps: unknown[] }) => n + s.steps.length, 0) || 1;
              const pct = Math.min(100, Math.round(((e.completed_steps?.length ?? 0) / total) * 100));
              const cert = certificate.get(e.course_id);
              return (
                <li key={e.course_id} className="flex gap-4 rounded-card border border-border bg-surface p-4">
                  {c.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.cover_url} alt="" className="aspect-[1200/630] w-28 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <Link href={`/learn/${c.slug}`} className="font-medium hover:underline">
                      {c.title}
                    </Link>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {pct}% of steps{cert ? ` · passed with ${Number(cert.score_percent)}%` : ""}
                    </p>
                    {cert && (
                      <Link href={`/certificates/${cert.code}`} className="mt-1 inline-block text-sm text-primary hover:underline">
                        Certificate
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Your courses</h2>
          <Link href="/publish" className="text-sm text-primary hover:underline">
            How to publish
          </Link>
        </div>
        {authored.length === 0 && (
          <p className="mt-4 rounded-card border border-dashed border-border p-6 text-muted">
            No courses yet. Install the Coursmith skill in your agent and ask it to create a course.
          </p>
        )}
        <div className="mt-4 space-y-4">
          {authored.map((c) => {
            const vs = versionsByCourse.get(c.id)!;
            const latest = vs[0]!;
            const review = latestReview.get(latest.id);
            return (
              <article key={c.id} className="rounded-card border border-border bg-surface p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-lg font-medium">{c.title ?? latest.title}</h3>
                  <StatusBadge status={c.status} />
                  {c.status === "published" && c.slug && (
                    <Link href={`/courses/${c.slug}`} className="ml-auto text-sm text-primary hover:underline">
                      View course
                    </Link>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">
                  Latest: version {latest.version_no} · {dateFmt.format(new Date(latest.created_at))} ·{" "}
                  <StatusBadge status={latest.status} />
                </p>
                {review && (
                  <details className="mt-3" open={latest.status === "needs_revision" || latest.status === "rejected"}>
                    <summary className="cursor-pointer text-sm font-medium">{review.summary}</summary>
                    <IssueList issues={review.issues} />
                  </details>
                )}
                {vs.length > 1 && (
                  <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                    {vs.slice(1).map((v) => (
                      <li key={v.id} className="flex items-center gap-1">
                        v{v.version_no} <StatusBadge status={v.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">Connected agents</h2>
        <p className="mt-1 text-sm text-muted">
          Connect an agent with <code className="font-mono">npx coursmith login</code>. Revoke access you no longer use.
        </p>
        <ul className="mt-4 divide-y divide-border rounded-card border border-border bg-surface">
          {(tokens ?? []).length === 0 && <li className="p-4 text-sm text-muted">No connected agents.</li>}
          {(tokens ?? []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-muted">
                  <code className="font-mono">{t.token_prefix}…</code> · connected {dateFmt.format(new Date(t.created_at))}
                  {t.last_used_at ? ` · last used ${dateFmt.format(new Date(t.last_used_at))}` : ""}
                </p>
              </div>
              <form action={revokeToken} className="ml-auto">
                <input type="hidden" name="id" value={t.id} />
                <button className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-muted">Revoke</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
