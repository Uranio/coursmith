import { revalidatePath } from "next/cache";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const REASONS = {
  offensive: "Offensive or inappropriate",
  inaccurate: "Inaccurate or misleading",
  spam: "Spam or advertising",
  copyright: "Copyright infringement",
  other: "Something else",
} as const;

async function report(formData: FormData) {
  "use server";
  const slug = String(formData.get("slug"));
  const user = await requireUser(`/courses/${slug}`);
  const reason = String(formData.get("reason"));
  if (!(reason in REASONS)) return;
  const supabase = await createClient();
  await supabase.from("reports").insert({
    course_id: String(formData.get("courseId")),
    reporter_id: user.id,
    reason,
    details: String(formData.get("details") ?? "").slice(0, 2000) || null,
  });
  revalidatePath(`/courses/${slug}`);
}

/** Reads the session: render inside <Suspense>. */
export async function ReportCourse({ courseId, slug }: { courseId: string; slug: string }) {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: existing } = await supabase.from("reports").select("id").eq("course_id", courseId).eq("reporter_id", user.id).limit(1);
  if (existing?.length) {
    return <p className="text-sm text-muted">Thanks — your report was sent to the moderators.</p>;
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted hover:text-foreground">Report this course</summary>
      <form action={report} className="mt-3 space-y-2 rounded-card border border-border bg-surface p-4">
        <input type="hidden" name="courseId" value={courseId} />
        <input type="hidden" name="slug" value={slug} />
        <select name="reason" required className="h-9 w-full rounded-lg border border-border bg-background px-2">
          {Object.entries(REASONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <textarea
          name="details"
          rows={3}
          maxLength={2000}
          placeholder="What is wrong? (optional)"
          className="w-full rounded-lg border border-border bg-background p-2"
        />
        <button className="h-9 rounded-lg border border-border px-3 hover:bg-surface-muted">Send report</button>
      </form>
    </details>
  );
}
