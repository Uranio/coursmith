import "server-only";
import {
  type Course,
  type Issue,
  LIMITS,
  SCHEMA_VERSION,
  validateCourse,
} from "@coursmith/course-schema";
import { AssetError, detectType, processRaster, processSvg } from "@/lib/assets/process";
import { createAdminClient } from "@/lib/supabase/admin";
import { ApiError } from "@/lib/api/http";
import { sha256Hex } from "@/lib/api/tokens";
import type { CliCaller } from "@/lib/api/auth";

export const SUBMISSIONS_PER_DAY = 10;
const IN_FLIGHT = ["validating", "in_review"] as const;
const UPLOAD_URL_TTL_HINT_SECONDS = 2 * 60 * 60; // Supabase signed upload URLs are valid for 2 hours.

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export interface FileManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

function parseManifest(input: unknown): FileManifestEntry[] {
  if (!Array.isArray(input) || input.length > LIMITS.assets) {
    throw new ApiError(400, "invalid_manifest", `"files" must be an array of at most ${LIMITS.assets} entries.`);
  }
  return input.map((f, i) => {
    const ok =
      f &&
      typeof f.path === "string" &&
      Number.isInteger(f.bytes) &&
      f.bytes >= 0 &&
      typeof f.sha256 === "string" &&
      /^[0-9a-f]{64}$/.test(f.sha256);
    if (!ok) throw new ApiError(400, "invalid_manifest", `files[${i}] needs path, bytes and a hex sha256.`);
    return { path: f.path, bytes: f.bytes, sha256: f.sha256 };
  });
}

function extOf(file: string): string {
  return file.slice(file.lastIndexOf(".")).toLowerCase();
}

// ---------------------------------------------------------------------------
// Create

export interface CreatedSubmission {
  submissionId: string;
  courseId: string;
  versionNo: number;
  uploads: { file: string; url: string }[];
  uploadUrlsExpireIn: number;
  warnings: Issue[];
}

export async function createSubmission(caller: CliCaller, body: unknown): Promise<CreatedSubmission> {
  const { course: rawCourse, files: rawFiles } = (body ?? {}) as { course?: unknown; files?: unknown };
  const manifest = parseManifest(rawFiles ?? []);
  const files = new Map(manifest.map((f) => [f.path, { bytes: f.bytes }]));

  const result = validateCourse(rawCourse, { files });
  if (!result.ok || !result.course) {
    throw new ApiError(422, "validation_failed", "The course does not pass validation.", { issues: result.issues });
  }
  const course = result.course;
  const db = createAdminClient();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("course_versions")
    .select("id", { count: "exact", head: true })
    .eq("submitted_by", caller.userId)
    .neq("status", "pending_upload")
    .gte("created_at", since);
  if (countError) throw countError;
  if ((count ?? 0) >= SUBMISSIONS_PER_DAY) {
    throw new ApiError(429, "rate_limited", `You can submit at most ${SUBMISSIONS_PER_DAY} courses or versions per day.`);
  }

  let courseId = course.courseId;
  let versionNo = 1;
  if (courseId) {
    const { data: existing, error } = await db.from("courses").select("id, author_id, status").eq("id", courseId).maybeSingle();
    if (error) throw error;
    if (!existing || existing.author_id !== caller.userId) {
      throw new ApiError(404, "course_not_found", "courseId does not match a course of yours. Remove it to create a new course.");
    }
    if (existing.status === "removed") {
      throw new ApiError(403, "course_removed", "This course was removed by the moderators and cannot be updated.");
    }
    const { data: versions, error: vErr } = await db
      .from("course_versions")
      .select("id, version_no, status")
      .eq("course_id", courseId)
      .order("version_no", { ascending: false });
    if (vErr) throw vErr;
    const busy = versions.find((v) => (IN_FLIGHT as readonly string[]).includes(v.status));
    if (busy) {
      throw new ApiError(409, "review_in_progress", "A version of this course is still being reviewed.", {
        submissionId: busy.id,
      });
    }
    // Abandoned uploads are discarded.
    const abandoned = versions.filter((v) => v.status === "pending_upload").map((v) => v.id);
    if (abandoned.length) await db.from("course_versions").delete().in("id", abandoned);
    versionNo = (versions.find((v) => v.status !== "pending_upload")?.version_no ?? 0) + 1;
  } else {
    const { data: created, error } = await db.from("courses").insert({ author_id: caller.userId }).select("id").single();
    if (error) throw error;
    courseId = created.id as string;
  }

  const content: Course = { ...course, courseId };
  delete (content as { $schema?: string }).$schema;

  const { data: version, error: insertError } = await db
    .from("course_versions")
    .insert({
      course_id: courseId,
      version_no: versionNo,
      status: "pending_upload",
      content,
      schema_version: SCHEMA_VERSION,
      client_version: caller.clientVersion,
      submitted_by: caller.userId,
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  const versionId = version.id as string;

  const byPath = new Map(manifest.map((f) => [f.path, f]));
  const rows = course.assets.map((a) => {
    const f = byPath.get(a.file)!; // validateCourse guarantees presence
    return {
      version_id: versionId,
      asset_id: a.id,
      upload_path: `${caller.userId}/${versionId}/upload/${a.id}${extOf(a.file)}`,
      mime: MIME_BY_EXT[extOf(a.file)]!,
      bytes: f.bytes,
      sha256: f.sha256,
    };
  });
  const { error: assetError } = await db.from("course_assets").insert(rows);
  if (assetError) throw assetError;

  const uploads = await Promise.all(
    rows.map(async (r, i) => {
      const { data, error } = await db.storage.from("submissions").createSignedUploadUrl(r.upload_path, { upsert: true });
      if (error) throw error;
      return { file: course.assets[i]!.file, url: data.signedUrl };
    }),
  );

  return {
    submissionId: versionId,
    courseId,
    versionNo,
    uploads,
    uploadUrlsExpireIn: UPLOAD_URL_TTL_HINT_SECONDS,
    warnings: result.issues.filter((i) => i.severity === "warning"),
  };
}

// ---------------------------------------------------------------------------
// Finalize: verify and process uploaded assets, then queue moderation.

async function loadOwnVersion(caller: CliCaller, submissionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) throw new ApiError(404, "not_found", "Submission not found.");
  const db = createAdminClient();
  const { data, error } = await db
    .from("course_versions")
    .select("id, course_id, version_no, status, content, submitted_by, created_at, decided_at")
    .eq("id", submissionId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.submitted_by !== caller.userId) throw new ApiError(404, "not_found", "Submission not found.");
  return data as {
    id: string;
    course_id: string;
    version_no: number;
    status: string;
    content: Course;
    created_at: string;
    decided_at: string | null;
  };
}

export async function finalizeSubmission(caller: CliCaller, submissionId: string) {
  const version = await loadOwnVersion(caller, submissionId);
  if (version.status !== "pending_upload") {
    throw new ApiError(409, "already_finalized", `This submission is already ${version.status}.`);
  }
  const db = createAdminClient();
  const { data: assets, error } = await db
    .from("course_assets")
    .select("id, asset_id, upload_path, bytes, sha256, mime")
    .eq("version_id", version.id);
  if (error) throw error;

  const course = version.content;
  const issues: Issue[] = [];
  const assetPath = (assetId: string) => `assets[${course.assets.findIndex((a) => a.id === assetId)}]`;
  const svgIds = new Map<string, Set<string>>();

  for (const a of assets) {
    const path = assetPath(a.asset_id);
    const { data: blob, error: dlError } = await db.storage.from("submissions").download(a.upload_path);
    if (dlError || !blob) {
      issues.push({ severity: "error", code: "assets.not_uploaded", path, message: `"${a.asset_id}" was not uploaded.` });
      continue;
    }
    const buf = new Uint8Array(await blob.arrayBuffer());
    if (buf.byteLength !== a.bytes || sha256Hex(buf) !== a.sha256) {
      issues.push({ severity: "error", code: "assets.checksum", path, message: `"${a.asset_id}" does not match the declared size or checksum.` });
      continue;
    }
    const detected = detectType(buf);
    const declaredSvg = a.mime === "image/svg+xml";
    if (!detected || (detected === "svg") !== declaredSvg) {
      issues.push({ severity: "error", code: "assets.content_type", path, message: `"${a.asset_id}" content does not match its file extension.` });
      continue;
    }
    try {
      let processed;
      if (detected === "svg") {
        const svg = processSvg(buf);
        svgIds.set(a.asset_id, svg.elementIds);
        processed = svg;
      } else {
        processed = await processRaster(buf);
      }
      const processedPath = `${caller.userId}/${version.id}/processed/${a.asset_id}${processed.ext}`;
      const { error: upError } = await db.storage
        .from("submissions")
        .upload(processedPath, processed.data, { contentType: processed.mime, upsert: true });
      if (upError) throw upError;
      const { error: rowError } = await db
        .from("course_assets")
        .update({ processed_path: processedPath, processed_mime: processed.mime, width: processed.width, height: processed.height })
        .eq("id", a.id);
      if (rowError) throw rowError;
    } catch (err) {
      if (!(err instanceof AssetError)) throw err;
      issues.push({ severity: "error", code: "assets.invalid", path, message: `"${a.asset_id}": ${err.message}` });
    }
  }

  // highlight-svg animations must point at ids that survived sanitization.
  for (const [si, s] of course.sections.entries()) {
    for (const [ti, st] of s.steps.entries()) {
      const stepPath = `sections[${si}].steps[${ti}]`;
      const candidates = [
        ...(st.visual ? [{ block: st.visual, path: `${stepPath}.visual` }] : []),
        ...st.blocks.map((block, bi) => ({ block, path: `${stepPath}.blocks[${bi}]` })),
      ];
      for (const { block, path } of candidates) {
        if (block.type !== "animation" || block.animation.preset !== "highlight-svg") continue;
        const anim = block.animation;
        const ids = svgIds.get(anim.asset);
        if (!ids) continue;
        for (const [hi, h] of anim.highlights.entries()) {
          if (!ids.has(h.elementId)) {
            issues.push({
              severity: "error",
              code: "animation.unknown_element",
              path: `${path}.animation.highlights[${hi}]`,
              message: `The SVG "${anim.asset}" has no element with id="${h.elementId}".`,
            });
          }
        }
      }
    }
  }

  if (issues.length) {
    await db.from("course_versions").update({ status: "needs_revision", decided_at: new Date().toISOString() }).eq("id", version.id);
    await db.from("moderation_reviews").insert({
      version_id: version.id,
      decision: "needs_revision",
      summary: "Some assets failed the automatic checks.",
      issues,
    });
    return { submissionId: version.id, status: "needs_revision" as const, issues };
  }

  await db.from("course_versions").update({ status: "in_review" }).eq("id", version.id);
  const { error: jobError } = await db.from("moderation_jobs").insert({ version_id: version.id });
  if (jobError) throw jobError;
  return { submissionId: version.id, status: "in_review" as const, issues: [] as Issue[] };
}

// ---------------------------------------------------------------------------
// Status

export async function getSubmissionStatus(caller: CliCaller, submissionId: string) {
  const version = await loadOwnVersion(caller, submissionId);
  const db = createAdminClient();
  const [{ data: review }, { data: course }] = await Promise.all([
    db
      .from("moderation_reviews")
      .select("decision, summary, issues, created_at")
      .eq("version_id", version.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("courses").select("slug, status").eq("id", version.course_id).single(),
  ]);
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    submissionId: version.id,
    courseId: version.course_id,
    versionNo: version.version_no,
    title: version.content.meta.title,
    status: version.status,
    submittedAt: version.created_at,
    decidedAt: version.decided_at,
    review: review ?? null,
    courseUrl: version.status === "approved" && course?.slug ? `${site}/courses/${course.slug}` : null,
  };
}
