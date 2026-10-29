export type IssueSeverity = "error" | "warning";

export interface Issue {
  severity: IssueSeverity;
  /** Machine-readable code, e.g. `glossary.undefined_term`. */
  code: string;
  /** Location in course.json, e.g. `sections[1].steps[0].blocks[2]`. Empty for the whole document. */
  path: string;
  message: string;
  /** How to fix it; set by the review agent. */
  suggestion?: string;
}

export function formatPath(path: ReadonlyArray<PropertyKey>): string {
  let out = "";
  for (const part of path) {
    if (typeof part === "number") out += `[${part}]`;
    else out += out ? `.${String(part)}` : String(part);
  }
  return out;
}

export class IssueList {
  readonly items: Issue[] = [];

  error(code: string, path: string, message: string): void {
    this.items.push({ severity: "error", code, path, message });
  }

  warning(code: string, path: string, message: string): void {
    this.items.push({ severity: "warning", code, path, message });
  }

  get hasErrors(): boolean {
    return this.items.some((i) => i.severity === "error");
  }
}
