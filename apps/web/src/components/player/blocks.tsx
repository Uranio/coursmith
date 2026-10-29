"use client";

import type { Block, InlineQuestion, VisualBlock } from "@coursmith/course-schema";
import { useState } from "react";
import type { PlayerAsset } from "@/lib/player";
import { Animation } from "./animations";
import { Markdown } from "./markdown";
import { Chart, CodeBlock, Diagram, MathBlock } from "./media";

export interface MediaContext {
  assets: Record<string, PlayerAsset>;
  svgMarkup: Record<string, string>;
}

const CALLOUT = {
  info: { icon: "ℹ", className: "border-sky-500/40 bg-sky-500/8" },
  tip: { icon: "💡", className: "border-emerald-500/40 bg-emerald-500/8" },
  warning: { icon: "⚠", className: "border-amber-500/50 bg-amber-500/10" },
  example: { icon: "✎", className: "border-violet-500/40 bg-violet-500/8" },
} as const;

function Caption({ text }: { text?: string }) {
  return text ? <figcaption className="mt-2 text-center text-sm text-muted">{text}</figcaption> : null;
}

function ImageView({ assetId, caption, media }: { assetId: string; caption?: string; media: MediaContext }) {
  const a = media.assets[assetId];
  if (!a) return null;
  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={a.url}
        alt={a.alt}
        width={a.width ?? undefined}
        height={a.height ?? undefined}
        loading="lazy"
        className="mx-auto h-auto max-h-[28rem] w-auto max-w-full rounded-lg"
      />
      <Caption text={caption ?? a.caption} />
      {a.credit && <p className="mt-1 text-center text-xs text-muted">{a.credit}</p>}
    </figure>
  );
}

export function BlockView({ block, media }: { block: Block | VisualBlock; media: MediaContext }) {
  switch (block.type) {
    case "markdown":
      return <Markdown text={block.text} />;
    case "callout": {
      const c = CALLOUT[block.variant];
      return (
        <aside className={`rounded-xl border-l-4 p-4 ${c.className}`}>
          <p className="flex items-center gap-2 font-medium">
            <span aria-hidden>{c.icon}</span>
            {block.title ?? block.variant[0]!.toUpperCase() + block.variant.slice(1)}
          </p>
          <Markdown text={block.text} className="mt-1" />
        </aside>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-4 border-primary/50 pl-4 text-lg italic">
          <Markdown text={block.text} />
          {block.cite && <footer className="mt-2 text-sm text-muted not-italic">— {block.cite}</footer>}
        </blockquote>
      );
    case "image":
      return <ImageView assetId={block.asset} caption={block.caption} media={media} />;
    case "code":
      return (
        <figure>
          <CodeBlock code={block.code} language={block.language} />
          <Caption text={block.caption} />
        </figure>
      );
    case "math":
      return (
        <figure>
          <MathBlock tex={block.tex} />
          <Caption text={block.caption} />
        </figure>
      );
    case "table":
      return (
        <figure className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {block.headers.map((h, i) => (
                  <th key={i} className="border-b-2 border-border px-3 py-2 text-left font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, i) => (
                <tr key={i} className="even:bg-surface-muted/50">
                  {r.map((cell, j) => (
                    <td key={j} className="border-b border-border px-3 py-2 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <Caption text={block.caption} />
        </figure>
      );
    case "chart":
      return (
        <figure>
          <Chart spec={block.spec} title={block.title} />
          <Caption text={block.caption} />
        </figure>
      );
    case "diagram":
      return (
        <figure>
          <Diagram code={block.code} />
          <Caption text={block.caption} />
        </figure>
      );
    case "animation":
      return (
        <figure>
          <Animation spec={block.animation} assets={media.assets} svgMarkup={media.svgMarkup} />
          <Caption text={block.caption} />
        </figure>
      );
  }
}

/** Ungraded practice question at the end of a step, with immediate feedback. */
export function InlineCheck({ question }: { question: InlineQuestion }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  const options =
    question.type === "true_false"
      ? [
          { id: "true", text: "True" },
          { id: "false", text: "False" },
        ]
      : question.options;
  const correctIds =
    question.type === "true_false" ? [String(question.correct)] : question.type === "single" ? [question.correct] : question.correct;
  const isCorrect = picked.length === correctIds.length && correctIds.every((c) => picked.includes(c));
  const multiple = question.type === "multiple";

  const toggle = (id: string) => {
    if (checked) return;
    setPicked((p) => (multiple ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]));
  };

  return (
    <fieldset className="rounded-card border border-primary/30 bg-primary/5 p-5">
      <legend className="px-1 text-xs font-semibold tracking-wider text-primary uppercase">Quick check</legend>
      <p className="font-medium">{question.prompt}</p>
      {multiple && <p className="text-sm text-muted">Select all that apply.</p>}
      <div className="mt-3 grid gap-2">
        {options.map((o) => {
          const selected = picked.includes(o.id);
          const right = checked && correctIds.includes(o.id);
          const wrong = checked && selected && !correctIds.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={selected}
              onClick={() => toggle(o.id)}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                right ? "border-success bg-success/10" : wrong ? "border-danger bg-danger/10" : selected ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/50"
              }`}
            >
              {o.text}
            </button>
          );
        })}
      </div>
      {!checked ? (
        <button
          type="button"
          disabled={!picked.length}
          onClick={() => setChecked(true)}
          className="mt-4 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40"
        >
          Check answer
        </button>
      ) : (
        <div className="mt-4" role="status">
          <p className={`font-medium ${isCorrect ? "text-success" : "text-danger"}`}>{isCorrect ? "Correct!" : "Not quite."}</p>
          <p className="mt-1 text-sm text-muted">{question.explanation}</p>
          {!isCorrect && (
            <button
              type="button"
              onClick={() => {
                setChecked(false);
                setPicked([]);
              }}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </fieldset>
  );
}
