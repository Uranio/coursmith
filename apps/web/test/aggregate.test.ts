import { describe, expect, it } from "vitest";
import { aggregate } from "@/lib/moderation/aggregate";
import type { ReviewIssue } from "@/lib/moderation/prompts";

const issue = (severity: ReviewIssue["severity"], category: string): ReviewIssue => ({
  severity,
  category,
  path: "sections[0].steps[0].blocks[0]",
  message: "msg",
  suggestion: "fix",
});

describe("aggregate", () => {
  it("approves when nothing blocks, keeping minor suggestions", () => {
    const r = aggregate([{ verdict: "safe", issues: [] }], [{ summary: "", issues: [issue("minor", "clarity")] }]);
    expect(r.decision).toBe("approved");
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0]).toMatchObject({ severity: "warning", code: "review.clarity", suggestion: "fix" });
  });

  it("asks for revision on major editorial issues", () => {
    const r = aggregate([{ verdict: "safe", issues: [] }], [{ summary: "", issues: [issue("major", "quiz"), issue("major", "quiz")] }]);
    expect(r.decision).toBe("needs_revision");
    expect(r.summary).toContain("2 quiz");
  });

  it("asks for revision when safety needs changes", () => {
    const r = aggregate([{ verdict: "needs_changes", issues: [issue("major", "harassment")] }], []);
    expect(r.decision).toBe("needs_revision");
  });

  it("rejects unsafe courses even if the editor found nothing", () => {
    const r = aggregate([{ verdict: "safe", issues: [] }, { verdict: "unsafe", issues: [issue("critical", "hate")] }], [
      { summary: "", issues: [] },
    ]);
    expect(r.decision).toBe("rejected");
    expect(r.summary).toContain("hate");
  });

  it("rejects on a critical safety issue regardless of the verdict field", () => {
    expect(aggregate([{ verdict: "needs_changes", issues: [issue("critical", "dangerous")] }], []).decision).toBe("rejected");
  });

  it("never rejects for editorial reasons alone", () => {
    const r = aggregate([{ verdict: "safe", issues: [] }], [{ summary: "", issues: [issue("critical", "accuracy")] }]);
    expect(r.decision).toBe("needs_revision");
  });

  it("does not approve when a reviewer reports manipulation attempts", () => {
    const r = aggregate([{ verdict: "needs_changes", issues: [issue("major", "reviewer_manipulation")] }], []);
    expect(r.decision).toBe("needs_revision");
  });
});
