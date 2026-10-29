import { DIFFICULTIES } from "@coursmith/course-schema";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CourseCard } from "@/components/course-card";
import {
  catalogLanguages,
  categoryNames,
  DURATIONS,
  PAGE_SIZE,
  parseCatalogQuery,
  searchCourses,
  SORTS,
  type CatalogQuery,
} from "@/lib/catalog";
import { DIFFICULTY_LABEL, languageName } from "@/lib/format";

export const metadata: Metadata = {
  title: "Courses",
  description: "Browse interactive courses by topic, language and difficulty.",
};

export default function CoursesPage({ searchParams }: PageProps<"/courses">) {
  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Courses</h1>
      <Suspense fallback={<CatalogSkeleton />}>
        <Catalog searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function CatalogSkeleton() {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="h-80 animate-pulse rounded-card bg-surface-muted" />
      ))}
    </div>
  );
}

const select =
  "h-10 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";

async function Catalog({ searchParams }: Pick<PageProps<"/courses">, "searchParams">) {
  const query = parseCatalogQuery(await searchParams);
  const [{ courses, total }, categories, languages] = await Promise.all([
    searchCourses(query),
    categoryNames(),
    catalogLanguages(),
  ]);
  const pages = Math.ceil(total / PAGE_SIZE);
  const pageHref = (page: number) => {
    const p = new URLSearchParams(
      Object.entries({ ...query, page: String(page) }).filter(([, v]) => v !== undefined) as [string, string][],
    );
    return `/courses?${p}`;
  };

  return (
    <>
      {/* A plain GET form: works without JavaScript and keeps filters in the URL. */}
      <form className="mt-6 flex flex-wrap gap-2" role="search">
        <input
          name="q"
          defaultValue={query.q}
          placeholder="Search courses…"
          aria-label="Search courses"
          className={`${select} min-w-56 flex-1`}
        />
        <select name="category" defaultValue={query.category ?? ""} aria-label="Category" className={select}>
          <option value="">All topics</option>
          {Object.entries(categories).map(([slug, name]) => (
            <option key={slug} value={slug}>
              {name}
            </option>
          ))}
        </select>
        <select name="difficulty" defaultValue={query.difficulty ?? ""} aria-label="Difficulty" className={select}>
          <option value="">Any level</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABEL[d]}
            </option>
          ))}
        </select>
        <select name="language" defaultValue={query.language ?? ""} aria-label="Language" className={select}>
          <option value="">Any language</option>
          {languages.map((l) => (
            <option key={l} value={l}>
              {languageName(l)}
            </option>
          ))}
        </select>
        <select name="duration" defaultValue={query.duration ?? ""} aria-label="Duration" className={select}>
          <option value="">Any length</option>
          {Object.entries(DURATIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={query.sort} aria-label="Sort by" className={select}>
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
          Search
        </button>
      </form>

      <p className="mt-6 text-sm text-muted" aria-live="polite">
        {total} course{total === 1 ? "" : "s"}
        {hasFilters(query) && (
          <>
            {" · "}
            <Link href="/courses" className="text-primary hover:underline">
              Clear filters
            </Link>
          </>
        )}
      </p>

      {courses.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-border p-10 text-center text-muted">
          No courses match these filters yet.{" "}
          <Link href="/publish" className="text-primary hover:underline">
            Create one with your agent
          </Link>
          .
        </div>
      ) : (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} category={categories[c.category]} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <nav className="mt-10 flex justify-center gap-2 text-sm" aria-label="Pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={pageHref(p)}
              aria-current={p === query.page ? "page" : undefined}
              className={`grid size-9 place-items-center rounded-lg border ${p === query.page ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-surface-muted"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}

function hasFilters(q: CatalogQuery) {
  return Boolean(q.q || q.category || q.difficulty || q.language || q.duration);
}
