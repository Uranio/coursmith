import { createHash, randomBytes, randomInt } from "node:crypto";

export const TOKEN_PREFIX = "csk_";

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

/** A new CLI API token. Only its hash is stored; the plaintext is shown to the CLI once. */
export function newApiToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6) };
}

export function newDeviceCode(): { deviceCode: string; hash: string } {
  const deviceCode = randomBytes(32).toString("base64url");
  return { deviceCode, hash: sha256Hex(deviceCode) };
}

// No vowels (avoids accidental words) and no look-alikes such as 0/O or 1/I.
const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";

export function newUserCode(): string {
  const pick = () => USER_CODE_ALPHABET[randomInt(USER_CODE_ALPHABET.length)];
  const part = () => Array.from({ length: 4 }, pick).join("");
  return `${part()}-${part()}`;
}

/** Accepts codes typed with lowercase, spaces or a missing dash. */
export function normalizeUserCode(input: string): string | null {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : null;
}

/** Compares dotted numeric versions ("0.10.0" > "0.9.3"); pre-release suffixes are ignored. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split("-")[0]!.split(".").map(Number);
  const pb = b.split("-")[0]!.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}
