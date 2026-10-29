import "server-only";
import { type Course, toPlayerCourse, type PlayerCourse } from "@coursmith/course-schema";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const PLAYER_MODES = ["stepper", "scrolly", "slides", "document"] as const;
export type PlayerMode = (typeof PLAYER_MODES)[number];

export interface PlayerAsset {
  url: string;
  kind: "image" | "svg";
  alt: string;
  caption?: string;
  credit?: string;
  width: number | null;
  height: number | null;
}

export interface PlayerData {
  courseId: string;
  slug: string;
  versionId: string;
  latestVersionId: string;
  course: PlayerCourse;
  assets: Record<string, PlayerAsset>;
  /** Sanitized SVG markup for assets inlined by highlight-svg animations. */
  svgMarkup: Record<string, string>;
  completedSteps: string[];
  lastStepId: string | null;
  mode: PlayerMode;
  passed: boolean;
  certificateCode: string | null;
}

export const publicAssetUrl = (path: string) =>
  `${publicEnv.supabaseUrl()}/storage/v1/object/public/course-assets/${path}`;

export async function getPublishedCourse(slug: string) {
  const { data } = await createAdminClient()
    .from("courses")
    .select("id, slug, title, current_version_id, accent_color")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data as { id: string; slug: string; title: string; current_version_id: string; accent_color: string | null } | null;
}

/** Everything the player needs. Enrolls the learner on first visit, pinned to the live version. */
export async function loadPlayer(slug: string, userId: string): Promise<PlayerData | null> {
  const db = createAdminClient();
  const course = await getPublishedCourse(slug);
  if (!course?.current_version_id) return null;

  let { data: enrollment } = await db
    .from("enrollments")
    .select("version_id, completed_steps, last_step_id, preferred_mode, completed_at")
    .eq("user_id", userId)
    .eq("course_id", course.id)
    .maybeSingle();
  if (!enrollment) {
    const { data, error } = await db
      .from("enrollments")
      .insert({ user_id: userId, course_id: course.id, version_id: course.current_version_id })
      .select("version_id, completed_steps, last_step_id, preferred_mode, completed_at")
      .single();
    if (error) throw error;
    enrollment = data;
  }

  const versionId = enrollment.version_id as string;
  const [{ data: version }, { data: assetRows }, { data: certificate }] = await Promise.all([
    db.from("course_versions").select("content").eq("id", versionId).single(),
    db.from("course_assets").select("asset_id, public_path, width, height").eq("version_id", versionId),
    db.from("certificates").select("code").eq("user_id", userId).eq("course_id", course.id).maybeSingle(),
  ]);
  const content = version!.content as Course;

  const assets: Record<string, PlayerAsset> = {};
  for (const row of assetRows ?? []) {
    const meta = content.assets.find((a) => a.id === row.asset_id);
    if (!meta || !row.public_path) continue;
    assets[row.asset_id] = {
      url: publicAssetUrl(row.public_path),
      kind: meta.kind,
      alt: meta.alt,
      caption: meta.caption,
      credit: meta.credit,
      width: row.width,
      height: row.height,
    };
  }

  // highlight-svg needs the markup inline so it can address elements by id.
  const inline = new Set<string>();
  for (const s of content.sections) {
    for (const st of s.steps) {
      for (const b of [st.visual, ...st.blocks]) {
        if (b?.type === "animation" && b.animation.preset === "highlight-svg") inline.add(b.animation.asset);
      }
    }
  }
  const svgMarkup: Record<string, string> = {};
  await Promise.all(
    [...inline].map(async (id) => {
      const url = assets[id]?.url;
      if (!url) return;
      const res = await fetch(url, { cache: "force-cache" });
      if (res.ok) svgMarkup[id] = await res.text();
    }),
  );

  return {
    courseId: course.id,
    slug: course.slug,
    versionId,
    latestVersionId: course.current_version_id,
    course: toPlayerCourse(content),
    assets,
    svgMarkup,
    completedSteps: enrollment.completed_steps ?? [],
    lastStepId: enrollment.last_step_id,
    mode: (enrollment.preferred_mode as PlayerMode) ?? "stepper",
    passed: Boolean(enrollment.completed_at),
    certificateCode: certificate?.code ?? null,
  };
}

export function allStepIds(course: Pick<Course, "sections">): string[] {
  return course.sections.flatMap((s) => s.steps.map((st) => st.id));
}
