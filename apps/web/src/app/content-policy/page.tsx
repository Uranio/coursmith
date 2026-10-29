import { CONTENT_POLICY } from "@coursmith/course-schema";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Content policy",
  description: "What Coursmith courses may and may not contain, and the quality bar the review agent applies.",
};

/** Renders **bold** spans; the policy uses no other inline Markdown. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

type Node = { kind: "h1" | "h2" | "p"; text: string } | { kind: "ul"; items: string[] };

/** Minimal parser for the policy's Markdown: headings, paragraphs and (wrapped) bullet lists. */
function parse(md: string): Node[] {
  const nodes: Node[] = [];
  for (const chunk of md.trim().split(/\n\s*\n/)) {
    const lines = chunk.split("\n");
    if (lines[0]!.startsWith("# ")) nodes.push({ kind: "h1", text: lines[0]!.slice(2) });
    else if (lines[0]!.startsWith("## ")) nodes.push({ kind: "h2", text: lines[0]!.slice(3) });
    else if (lines[0]!.startsWith("- ") || lines[1]?.startsWith("- ")) {
      const intro = lines[0]!.startsWith("- ") ? [] : [lines.shift()!];
      if (intro.length) nodes.push({ kind: "p", text: intro[0]! });
      const items: string[] = [];
      for (const line of lines) {
        if (line.startsWith("- ")) items.push(line.slice(2));
        else items[items.length - 1] += ` ${line.trim()}`;
      }
      nodes.push({ kind: "ul", items });
    } else nodes.push({ kind: "p", text: lines.join(" ") });
  }
  return nodes;
}

export default function ContentPolicyPage() {
  const nodes = parse(CONTENT_POLICY);
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      {nodes.map((n, i) => {
        switch (n.kind) {
          case "h1":
            return (
              <h1 key={i} className="text-4xl font-semibold tracking-tight">
                {n.text.replace(/^Coursmith /, "")}
              </h1>
            );
          case "h2":
            return (
              <h2 key={i} className="mt-12 text-2xl font-semibold tracking-tight">
                {n.text}
              </h2>
            );
          case "p":
            return (
              <p key={i} className="mt-4 text-muted">
                {inline(n.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="mt-4 space-y-3">
                {n.items.map((item, j) => (
                  <li key={j} className="rounded-card border border-border bg-surface p-4 text-muted">
                    {inline(item)}
                  </li>
                ))}
              </ul>
            );
        }
      })}
      <p className="mt-12 text-sm text-muted">
        The review agent applies this policy to every submission. Authors&apos; agents receive the same text through the
        Coursmith skill. See <Link href="/publish" className="text-primary hover:underline">how publishing works</Link>.
      </p>
    </main>
  );
}
