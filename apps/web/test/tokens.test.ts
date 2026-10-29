import { describe, expect, it } from "vitest";
import { compareVersions, newApiToken, newUserCode, normalizeUserCode, sha256Hex, TOKEN_PREFIX } from "@/lib/api/tokens";

describe("tokens", () => {
  it("creates prefixed tokens whose hash is what gets stored", () => {
    const t = newApiToken();
    expect(t.token.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(t.hash).toBe(sha256Hex(t.token));
    expect(t.token.startsWith(t.prefix)).toBe(true);
    expect(newApiToken().token).not.toBe(t.token);
  });

  it("creates user codes in the format the database accepts", () => {
    for (let i = 0; i < 200; i++) expect(newUserCode()).toMatch(/^[B-DF-HJ-NP-TV-XZ2-9]{4}-[B-DF-HJ-NP-TV-XZ2-9]{4}$/);
  });

  it("normalizes codes typed by hand", () => {
    expect(normalizeUserCode(" jk7w m27k ")).toBe("JK7W-M27K");
    expect(normalizeUserCode("JK7W-M27")).toBeNull();
  });

  it("compares versions numerically", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBe(0);
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
  });
});
