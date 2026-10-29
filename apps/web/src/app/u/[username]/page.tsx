import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CourseCard } from "@/components/course-card";
import { categoryNames, getAuthorProfile } from "@/lib/catalog";
import { dateFormat } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const data = await getAuthorProfile((await params).username);
  return { title: data ? data.author.display_name : "Author not found" };
}

export default function AuthorPage({ params }: PageProps<"/u/[username]">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-card bg-surface-muted" />}>
        <Author params={params} />
      </Suspense>
    </main>
  );
}

async function Author({ params }: Pick<PageProps<"/u/[username]">, "params">) {
  const { username } = await params;
  const [data, categories] = await Promise.all([getAuthorProfile(username), categoryNames()]);
  if (!data) notFound();
  const { author, courses } = data;
  const learners = courses.reduce((n, c) => n + c.learner_count, 0);
  const rated = courses.filter((c) => c.rating_count > 0);
  const avg = rated.length ? rated.reduce((n, c) => n + Number(c.rating_avg), 0) / rated.length : null;

  return (
    <>
      <header className="flex flex-wrap items-center gap-5">
        <div className="grid size-20 place-items-center rounded-full bg-primary/15 text-3xl font-semibold text-primary">
          {author.display_name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{author.display_name}</h1>
          <p className="text-muted">
            @{author.username} · member since {dateFormat.format(new Date(author.created_at))}
          </p>
        </div>
      </header>
      {author.bio && <p className="mt-6 max-w-2xl whitespace-pre-line">{author.bio}</p>}
      <dl className="mt-8 flex flex-wrap gap-8">
        <Stat label="Courses" value={String(courses.length)} />
        <Stat label="Learners" value={String(learners)} />
        {avg !== null && <Stat label="Average rating" value={avg.toFixed(1)} />}
      </dl>
      <h2 className="mt-12 text-xl font-semibold">Published courses</h2>
      {courses.length === 0 ? (
        <p className="mt-4 text-muted">No published courses yet.</p>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} category={categories[c.category]} />
          ))}
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}
