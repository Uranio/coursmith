import type { Issue } from "@coursmith/course-schema";

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: number) => (s: string) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
export const red = paint(31);
export const green = paint(32);
export const yellow = paint(33);
export const dim = paint(2);
export const bold = paint(1);

export function printIssues(issues: readonly Issue[]): void {
  for (const i of issues) {
    const tag = i.severity === "error" ? red("error") : yellow("warning");
    console.log(`${tag} ${dim(i.code)}${i.path ? ` at ${bold(i.path)}` : ""}\n  ${i.message}`);
    if (i.suggestion) console.log(`  ${dim("→")} ${i.suggestion}`);
  }
}

export function summarize(issues: readonly Issue[]): string {
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.length - errors;
  return `${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`;
}

/** In --json mode, prints a single JSON document that agents can parse. */
export function emitJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}
