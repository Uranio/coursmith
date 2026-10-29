import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AssetError, detectType, processRaster, processSvg } from "@/lib/assets/process";

const enc = (s: string) => new TextEncoder().encode(s);

async function png(width: number, height: number): Promise<Uint8Array> {
  return sharp({ create: { width, height, channels: 3, background: "#2563eb" } })
    .png()
    .withMetadata({ exif: { IFD0: { Artist: "secret author" } } })
    .toBuffer();
}

describe("detectType", () => {
  it("recognizes files by content", async () => {
    expect(detectType(await png(4, 4))).toBe("png");
    expect(detectType(await sharp(await png(4, 4)).jpeg().toBuffer())).toBe("jpeg");
    expect(detectType(await sharp(await png(4, 4)).webp().toBuffer())).toBe("webp");
    expect(detectType(enc('<?xml version="1.0"?>\n<!-- x -->\n<svg viewBox="0 0 1 1"></svg>'))).toBe("svg");
    expect(detectType(enc("<html><svg></svg></html>"))).toBeNull();
    expect(detectType(enc("GIF89a"))).toBeNull();
  });
});

describe("processRaster", () => {
  it("re-encodes to WebP, strips metadata and caps the size", async () => {
    const out = await processRaster(await png(3000, 1000));
    expect(out.mime).toBe("image/webp");
    expect([out.width, out.height]).toEqual([2400, 800]);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
  });

  it("rejects corrupt images", async () => {
    const broken = (await png(10, 10)).slice(0, 40);
    await expect(processRaster(broken)).rejects.toBeInstanceOf(AssetError);
  });
});

describe("processSvg", () => {
  const dirty = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 400 300" onload="alert(1)">
    <defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
    <style>.a{fill:red} .b{background:url(https://tracker.example/x.png)}</style>
    <script>alert(1)</script>
    <foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
    <image href="https://tracker.example/i.png" width="10" height="10"/>
    <a href="javascript:alert(1)"><text>link</text></a>
    <rect id="meter" fill="url(#g)" width="10" height="10"/>
    <circle id="dot" style="fill:url(https://tracker.example/c)" r="4"/>
  </svg>`;

  it("removes scripts, handlers, foreign content and remote resources", () => {
    const out = processSvg(enc(dirty)).data.toString("utf8");
    for (const bad of ["<script", "onload", "foreignObject", "<image", "javascript:", "tracker.example"]) {
      expect(out).not.toContain(bad);
    }
  });

  it("keeps ids and local url(#ref) paints", () => {
    const out = processSvg(enc(dirty));
    expect(out.elementIds).toEqual(new Set(["g", "meter", "dot"]));
    expect(out.data.toString("utf8")).toContain('fill="url(#g)"');
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it("rejects input that is not an SVG", () => {
    expect(() => processSvg(enc("<p>hello</p>"))).toThrow(AssetError);
  });
});
