import Link from "next/link";
import type { CourseCard as Card } from "@/lib/catalog";
import { DIFFICULTY_LABEL, duration, languageName } from "@/lib/format";
import { DifficultyMeter, Stars } from "./course-meta";

export function CourseCard({ course, category }: { course: Card; category?: string }) {
  return (
    <Link
      href={`/courses/${course.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-border bg-surface transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      style={course.accent_color ? ({ "--course-accent": course.accent_color } as React.CSSProperties) : undefined}
    >
      <div className="relative aspect-[1200/630] overflow-hidden bg-surface-muted">
        {course.cover_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.cover_url} alt="" className="size-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
        )}
        <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
          {languageName(course.language)}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4">
        {category && <p className="text-xs font-medium tracking-wide text-primary uppercase">{category}</p>}
        <h3 className="mt-1 font-semibold leading-snug text-balance">{course.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-muted">{course.subtitle ?? course.description}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <DifficultyMeter level={course.difficulty} />
            {DIFFICULTY_LABEL[course.difficulty]}
          </span>
          <span>{duration(course.estimated_minutes)}</span>
          {course.rating_count > 0 && <Stars value={Number(course.rating_avg)} count={course.rating_count} />}
        </div>
      </div>
    </Link>
  );
}
