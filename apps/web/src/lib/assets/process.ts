import "server-only";
import DOMPurify from "isomorphic-dompurify";
import sharp from "sharp";

export type DetectedType = "png" | "jpeg" | "webp" | "svg";

/** Identifies a file by its content, never by its name. */
export function detectType(buf: Uint8Array): DetectedType | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b.length >= 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  const head = b.toString("utf8", 0, Math.min(b.length, 1024)).replace(/^﻿/, "").trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return "svg";
  return null;
}

export interface ProcessedAsset {
  data: Buffer;
  mime: "image/webp" | "image/svg+xml";
  ext: ".webp" | ".svg";
  width: number | null;
  height: number | null;
}

export class AssetError extends Error {}

const MAX_EDGE = 2400;
const MAX_INPUT_PIXELS = 40_000_000;

/** Re-encodes a raster image to WebP: applies EXIF rotation, strips metadata, caps the size. */
export async function processRaster(input: Uint8Array): Promise<ProcessedAsset> {
  try {
    const pipeline = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { data, mime: "image/webp", ext: ".webp", width: info.width, height: info.height };
  } catch (err) {
    throw new AssetError(`The image could not be decoded: ${(err as Error).message}`);
  }
}

// Allows url(#local-ref) only: anything else could load remote resources when the SVG is inlined.
const EXTERNAL_URL = /url\(\s*['"]?\s*(?!#)|@import|expression\(|javascript:/i;

let hooksInstalled = false;
function installHooks() {
  if (hooksInstalled) return;
  hooksInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLowerCase();
    if ((name === "href" || name === "xlink:href") && !data.attrValue.trim().startsWith("#")) data.keepAttr = false;
    if (EXTERNAL_URL.test(data.attrValue)) data.keepAttr = false;
  });
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && EXTERNAL_URL.test(node.textContent ?? "")) node.textContent = "";
  });
}

/** Sanitizes an SVG so it is safe to inline in the page (no scripts, events, remote resources). */
export function processSvg(input: Uint8Array): ProcessedAsset & { elementIds: Set<string> } {
  installHooks();
  const source = Buffer.from(input).toString("utf8");
  const clean = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    ADD_TAGS: ["style"],
    FORBID_TAGS: ["foreignObject", "script", "iframe", "image", "use"],
    // Keep ids: highlight-svg animations target elements by id.
    SANITIZE_DOM: false,
  });
  if (!/^\s*<svg[\s>]/i.test(clean)) throw new AssetError("The file is not a valid SVG after sanitization.");

  const elementIds = new Set([...clean.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
  const viewBox = clean.match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  return {
    data: Buffer.from(clean, "utf8"),
    mime: "image/svg+xml",
    ext: ".svg",
    width: viewBox ? Math.round(Number(viewBox[1])) : null,
    height: viewBox ? Math.round(Number(viewBox[2])) : null,
    elementIds,
  };
}
