import "server-only";
import { CATEGORIES, DIFFICULTIES } from "@coursmith/course-schema";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export interface CourseCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  language: string;
  difficulty: (typeof DIFFICULTIES)[number];
  category: string;
  tags: string[];
  estimated_minutes: number;
  cover_url: string | null;
  accent_color: string | null;
  rating_avg: number;
  rating_count: number;
  learner_count: number;
  published_at: string;
  author_id: string;
}

export interface CourseOutlineData {
  sections: { id: string; title: string; summary: string; steps: { id: string; title: string }[] }[];
  learningObjectives: string[];
  prerequisites: string[];
  quizQuestions: number;
}

export interface Author {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
}

const CARD_FIELDS =
  "id, slug, title, subtitle, description, language, difficulty, category, tags, estimated_minutes, cover_url, accent_color, rating_avg, rating_count, learner_count, published_at, author_id";

export const SORTS = { newest: "Newest", popular: "Most learners", rating: "Top rated", shortest: "Shortest" } as const;
export type Sort = keyof typeof SORTS;

export const DURATIONS = { short: "Under 30 min", medium: "30–90 min", long: "Over 90 min" } as const;
export type Duration = keyof typeof DURATIONS;

export interface CatalogQuery {
  q?: string;
  category?: string;
  difficulty?: string;
  language?: string;
  duration?: string;
  sort?: string;
  page?: number;
}

export const PAGE_SIZE = 24;

export function parseCatalogQuery(params: Record<string, string | string[] | undefined>): CatalogQuery {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string).trim() : undefined) || undefined;
  return {
    q: one("q")?.slice(0, 100),
    category: (CATEGORIES as readonly string[]).includes(one("category") ?? "") ? one("category") : undefined,
    difficulty: (DIFFICULTIES as readonly string[]).includes(one("difficulty") ?? "") ? one("difficulty") : undefined,
    language: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(one("language") ?? "") ? one("language") : undefined,
    duration: one("duration") && one("duration")! in DURATIONS ? one("duration") : undefined,
    sort: one("sort") && one("sort")! in SORTS ? one("sort") : "newest",
    page: Math.max(1, Math.min(100, Number(one("page")) || 1)),
  };
}

export async function searchCourses(query: CatalogQuery): Promise<{ courses: CourseCard[]; total: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");

  const db = createPublicClient();
  let req = db.from("courses").select(CARD_FIELDS, { count: "exact" }).eq("status", "published");
  if (query.q) req = req.textSearch("search", query.q, { type: "websearch", config: "simple" });
  if (query.category) req = req.eq("category", query.category);
  if (query.difficulty) req = req.eq("difficulty", query.difficulty);
  if (query.language) req = req.eq("language", query.language);
  if (query.duration === "short") req = req.lt("estimated_minutes", 30);
  if (query.duration === "medium") req = req.gte("estimated_minutes", 30).lte("estimated_minutes", 90);
  if (query.duration === "long") req = req.gt("estimated_minutes", 90);
  req =
    query.sort === "popular"
      ? req.order("learner_count", { ascending: false })
      : query.sort === "rating"
        ? req.order("rating_avg", { ascending: false }).order("rating_count", { ascending: false })
        : query.sort === "shortest"
          ? req.order("estimated_minutes", { ascending: true })
          : req.order("published_at", { ascending: false });
  const from = ((query.page ?? 1) - 1) * PAGE_SIZE;
  const { data, count, error } = await req.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { courses: (data ?? []) as CourseCard[], total: count ?? 0 };
}

/** Languages that have at least one published course, for the filter menu. */
export async function catalogLanguages(): Promise<string[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("catalog");
  const { data } = await createPublicClient().from("courses").select("language").eq("status", "published");
  return [...new Set((data ?? []).map((r) => r.language as string))].sort();
}

export async function categoryNames(): Promise<Record<string, string>> {
  "use cache";
  cacheLife("days");
  const { data } = await createPublicClient().from("categories").select("slug, name").order("sort");
  return Object.fromEntries((data ?? []).map((c) => [c.slug, c.name]));
}

export async function getCourseBySlug(slug: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog", `course:${slug}`);
  const db = createPublicClient();
  const { data: course } = await db
    .from("courses")
    .select(`${CARD_FIELDS}, outline, current_version_id`)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (!course) return null;
  const [{ data: author }, { data: reviews }] = await Promise.all([
    db.from("profiles").select("id, username, display_name, bio, avatar_url").eq("id", course.author_id).single(),
    db
      .from("course_reviews")
      .select("id, rating, body, created_at, user_id")
      .eq("course_id", course.id)
      .eq("status", "visible")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const reviewerIds = [...new Set((reviews ?? []).map((r) => r.user_id))];
  const { data: reviewers } = reviewerIds.length
    ? await db.from("profiles").select("id, username, display_name").in("id", reviewerIds)
    : { data: [] };
  const names = new Map((reviewers ?? []).map((r) => [r.id, r.display_name as string]));
  return {
    course: course as CourseCard & { outline: CourseOutlineData; current_version_id: string },
    author: author as Author,
    reviews: (reviews ?? []).map((r) => ({ ...r, author: names.get(r.user_id) ?? "Learner" })) as {
      id: string;
      rating: number;
      body: string | null;
      created_at: string;
      author: string;
    }[],
  };
}

export async function getAuthorProfile(username: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  const db = createPublicClient();
  const { data: author } = await db
    .from("profiles")
    .select("id, username, display_name, bio, avatar_url, created_at")
    .eq("username", username)
    .maybeSingle();
  if (!author) return null;
  const { data: courses } = await db
    .from("courses")
    .select(CARD_FIELDS)
    .eq("author_id", author.id)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  return { author: author as Author & { created_at: string }, courses: (courses ?? []) as CourseCard[] };
}

export async function latestCourses(limit = 6): Promise<CourseCard[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");
  const { data } = await createPublicClient()
    .from("courses")
    .select(CARD_FIELDS)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CourseCard[];
}
