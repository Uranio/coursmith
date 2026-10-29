import "server-only";
import type { Course } from "@coursmith/course-schema";
import sharp from "sharp";
import { invalidateCatalog } from "@/lib/cache";
import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewCourse, type ReviewImage } from "./review";

type Db = ReturnType<typeof createAdminClient>;

interface AssetRow {
  asset_id: string;
  processed_path: string | null;
  processed_mime: string | null;
}

async function download(db: Db, path: string): Promise<Buffer> {
  const { data, error } = await db.storage.from("submissions").download(path);
  if (error || !data) throw new Error(`Cannot download ${path}: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Rasterizes every processed asset (SVG included) to a small JPEG the vision model can read. */
async function loadReviewImages(db: Db, course: Course, assets: AssetRow[]): Promise<ReviewImage[]> {
  const images: ReviewImage[] = [];
  for (const a of assets) {
    if (!a.processed_path) continue;
    const index = course.assets.findIndex((x) => x.id === a.asset_id);
    const buf = await download(db, a.processed_path);
    const jpeg = await sharp(buf, { density: 96 })
      .flatten({ background: "#ffffff" })
      .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    images.push({
      assetId: a.asset_id,
      index,
      alt: course.assets[index]?.alt ?? "",
      dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    });
  }
  return images;
}

/** Copies the version's processed assets to the public bucket and makes it the live version. */
export async function publishVersion(versionId: string): Promise<void> {
  const db = createAdminClient();
  const { data: version, error } = await db
    .from("course_versions")
    .select("id, course_id, content")
    .eq("id", versionId)
    .single();
  if (error) throw error;
  const course = version.content as Course;

  const { data: assets, error: aErr } = await db
    .from("course_assets")
    .select("id, asset_id, processed_path, processed_mime")
    .eq("version_id", versionId);
  if (aErr) throw aErr;

  let coverUrl: string | null = null;
  for (const a of assets) {
    if (!a.processed_path) throw new Error(`Asset ${a.asset_id} of ${versionId} was never processed.`);
    const ext = a.processed_path.slice(a.processed_path.lastIndexOf("."));
    const publicPath = `${version.course_id}/${versionId}/${a.asset_id}${ext}`;
    const { error: upErr } = await db.storage
      .from("course-assets")
      .upload(publicPath, await download(db, a.processed_path), {
        contentType: a.processed_mime ?? undefined,
        cacheControl: "31536000",
        upsert: true,
      });
    if (upErr) throw upErr;
    await db.from("course_assets").update({ public_path: publicPath }).eq("id", a.id);
    if (a.asset_id === course.meta.coverImage) {
      coverUrl = `${publicEnv.supabaseUrl()}/storage/v1/object/public/course-assets/${publicPath}`;
    }
  }

  const { error: pubErr } = await db.rpc("publish_course_version", { p_version_id: versionId, p_cover_url: coverUrl });
  if (pubErr) throw pubErr;
  invalidateCatalog();
}

/** Reviews one submitted version and records the decision. Safe to call again for the same version. */
export async function moderateVersion(versionId: string): Promise<{ decision: string; costUsd: number } | null> {
  const db = createAdminClient();
  const { data: version, error } = await db
    .from("course_versions")
    .select("id, status, content")
    .eq("id", versionId)
    .single();
  if (error) throw error;
  if (version.status !== "in_review") return null; // already decided (e.g. by an admin)

  const course = version.content as Course;
  const { data: assets, error: aErr } = await db
    .from("course_assets")
    .select("asset_id, processed_path, processed_mime")
    .eq("version_id", versionId);
  if (aErr) throw aErr;

  const outcome = await reviewCourse(course, await loadReviewImages(db, course, assets));

  const { error: rErr } = await db.from("moderation_reviews").insert({
    version_id: versionId,
    decision: outcome.decision,
    summary: outcome.summary,
    issues: outcome.issues,
    models: outcome.models,
    prompt_tokens: outcome.usage.promptTokens,
    completion_tokens: outcome.usage.completionTokens,
    cost_usd: Number(outcome.usage.costUsd.toFixed(5)),
  });
  if (rErr) throw rErr;

  if (outcome.decision === "approved") {
    await publishVersion(versionId);
  } else {
    const { error: uErr } = await db
      .from("course_versions")
      .update({ status: outcome.decision, decided_at: new Date().toISOString() })
      .eq("id", versionId)
      .eq("status", "in_review");
    if (uErr) throw uErr;
  }
  return { decision: outcome.decision, costUsd: outcome.usage.costUsd };
}
