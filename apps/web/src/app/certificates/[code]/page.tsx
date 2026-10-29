import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cacheLife } from "next/cache";
import { dateFormat, DIFFICULTY_LABEL } from "@/lib/format";
import { createPublicClient } from "@/lib/supabase/public";
import { PrintButton } from "./print-button";

async function getCertificate(code: string) {
  "use cache";
  cacheLife("hours");
  if (!/^[A-Z0-9]{10}$/.test(code)) return null;
  const db = createPublicClient();
  const { data: cert } = await db
    .from("certificates")
    .select("code, user_id, course_id, score_percent, issued_at")
    .eq("code", code)
    .maybeSingle();
  if (!cert) return null;
  const [{ data: learner }, { data: course }] = await Promise.all([
    db.from("profiles").select("display_name, username").eq("id", cert.user_id).single(),
    db.from("courses").select("title, slug, difficulty, estimated_minutes, author_id, status").eq("id", cert.course_id).single(),
  ]);
  const { data: author } = course
    ? await db.from("profiles").select("display_name, username").eq("id", course.author_id).single()
    : { data: null };
  return { cert, learner, course, author };
}

export async function generateMetadata({ params }: PageProps<"/certificates/[code]">): Promise<Metadata> {
  const data = await getCertificate((await params).code);
  return {
    title: data ? `Certificate · ${data.course?.title ?? "Course"}` : "Certificate not found",
    robots: { index: false },
  };
}

export default function CertificatePage({ params }: PageProps<"/certificates/[code]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 print:max-w-none print:p-0">
      <Suspense fallback={<div className="aspect-[1.414] animate-pulse rounded-card bg-surface-muted" />}>
        <Certificate params={params} />
      </Suspense>
    </main>
  );
}

async function Certificate({ params }: Pick<PageProps<"/certificates/[code]">, "params">) {
  const { code } = await params;
  const data = await getCertificate(code);
  if (!data) notFound();
  const { cert, learner, course, author } = data;

  return (
    <>
      <article className="relative aspect-[1.414] overflow-hidden rounded-card border-2 border-primary/30 bg-surface p-[6%] text-center shadow-xl print:rounded-none print:border-0 print:shadow-none">
        <div aria-hidden className="pointer-events-none absolute inset-3 rounded-[calc(var(--radius)-4px)] border border-primary/20" />
        <div className="flex h-full flex-col items-center justify-center">
          <p className="text-sm font-semibold tracking-[0.3em] text-primary uppercase">Certificate of completion</p>
          <p className="mt-[4%] text-sm text-muted sm:text-base">This certifies that</p>
          <p className="mt-2 font-serif text-3xl sm:text-5xl">{learner?.display_name}</p>
          <p className="mt-[3%] text-sm text-muted sm:text-base">has completed the course</p>
          <p className="mt-2 max-w-xl text-xl font-semibold text-balance sm:text-2xl">{course?.title}</p>
          <p className="mt-2 text-sm text-muted">
            {course && DIFFICULTY_LABEL[course.difficulty]} · final quiz score {Number(cert.score_percent)}%
          </p>
          <div className="mt-auto grid w-full grid-cols-3 items-end gap-4 text-xs text-muted sm:text-sm">
            <div>
              <p className="font-medium text-foreground">{dateFormat.format(new Date(cert.issued_at))}</p>
              <p>Date</p>
            </div>
            <div>
              <p className="font-mono font-medium text-foreground">{cert.code}</p>
              <p>Verification code</p>
            </div>
            <div>
              <p className="font-medium text-foreground">{author?.display_name}</p>
              <p>Course author</p>
            </div>
          </div>
        </div>
      </article>
      <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden">
        <PrintButton />
        {course?.status === "published" && (
          <Link href={`/courses/${course.slug}`} className="rounded-full border border-border px-5 py-2.5 font-medium hover:bg-surface-muted">
            View the course
          </Link>
        )}
        <p className="text-sm text-muted">
          Anyone can verify this certificate at this address. Issued by Coursmith to @{learner?.username}.
        </p>
      </div>
    </>
  );
}
