import type { Issue } from "@coursmith/course-schema";
import type { QualityOutput, ReviewIssue, SafetyOutput } from "./prompts";

export type Decision = "approved" | "needs_revision" | "rejected";

export interface AggregateResult {
  decision: Decision;
  summary: string;
  issues: Issue[];
}

function toIssue(i: ReviewIssue, source: "safety" | "quality"): Issue & { level: string } {
  return {
    // Critical and major issues block publication; minor ones are suggestions.
    severity: i.severity === "minor" ? "warning" : "error",
    code: `review.${i.category}`,
    path: i.path,
    message: i.message,
    suggestion: i.suggestion || undefined,
    level: `${source}:${i.severity}`,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The decision is made here, by code, from the reviewers' structured findings — never from free text,
 * so a course cannot talk its way into approval.
 */
export function aggregate(safety: SafetyOutput[], quality: QualityOutput[]): AggregateResult {
  const safetyIssues = safety.flatMap((s) => s.issues);
  const unsafe = safety.some((s) => s.verdict === "unsafe") || safetyIssues.some((i) => i.severity === "critical");

  const issues = [
    ...safetyIssues.map((i) => toIssue(i, "safety")),
    ...quality.flatMap((q) => q.issues).map((i) => toIssue({ ...i, severity: i.severity === "critical" ? "major" : i.severity }, "quality")),
  ];
  const blocking = issues.filter((i) => i.severity === "error");

  if (unsafe) {
    const reason = safetyIssues.find((i) => i.severity === "critical") ?? safetyIssues[0];
    return {
      decision: "rejected",
      summary: `Rejected: the course conflicts with the content policy${reason ? ` (${reason.category}: ${reason.message})` : ""}.`,
      issues,
    };
  }
  if (blocking.length) {
    const byCategory = new Map<string, number>();
    for (const i of blocking) byCategory.set(i.code.replace("review.", ""), (byCategory.get(i.code.replace("review.", "")) ?? 0) + 1);
    const detail = [...byCategory].map(([c, n]) => `${n} ${c}`).join(", ");
    return {
      decision: "needs_revision",
      summary: `Needs revision: ${plural(blocking.length, "issue")} to fix (${detail}). Apply the suggestions and submit again.`,
      issues,
    };
  }
  const minor = issues.length;
  return {
    decision: "approved",
    summary: minor ? `Approved, with ${plural(minor, "optional suggestion")} for a future version.` : "Approved.",
    issues,
  };
}
