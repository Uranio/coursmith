import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { validateCourseText, type AssetFileInfo, type Course, type ValidationResult } from "@coursmith/course-schema";

export interface LoadedBundle {
  dir: string;
  result: ValidationResult;
  files: Map<string, AssetFileInfo>;
}

export class BundleError extends Error {}

/** Reads <dir>/course.json and lists the files directly inside <dir>/assets. */
export async function loadBundle(dirArg: string | undefined): Promise<LoadedBundle> {
  const dir = resolve(dirArg ?? ".");
  let raw: string;
  try {
    raw = await readFile(join(dir, "course.json"), "utf8");
  } catch {
    throw new BundleError(`No course.json found in ${dir}.`);
  }

  const files = new Map<string, AssetFileInfo>();
  try {
    for (const entry of await readdir(join(dir, "assets"), { withFileTypes: true })) {
      if (entry.isFile()) files.set(`assets/${entry.name}`, { bytes: (await stat(join(dir, "assets", entry.name))).size });
    }
  } catch {
    // No assets folder: validation reports the missing files.
  }
  return { dir, result: validateCourseText(raw, { files }), files };
}

export interface ManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
  data: Uint8Array;
  contentType: string;
}

const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
};

/** Reads and hashes the asset files the course actually declares. */
export async function buildManifest(dir: string, course: Course): Promise<ManifestEntry[]> {
  return Promise.all(
    course.assets.map(async (a) => {
      const data = new Uint8Array(await readFile(join(dir, a.file)));
      const ext = a.file.slice(a.file.lastIndexOf(".") + 1).toLowerCase();
      return {
        path: a.file,
        bytes: data.byteLength,
        sha256: createHash("sha256").update(data).digest("hex"),
        data,
        contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      };
    }),
  );
}
