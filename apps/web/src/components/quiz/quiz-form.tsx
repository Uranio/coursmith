"use client";

import type { QuizAnswer, QuizPaperQuestion } from "@coursmith/course-schema";
import { useState, useTransition } from "react";
import { submitQuiz } from "@/app/learn/[slug]/actions";

function OptionButton({
  selected,
  multiple,
  onClick,
  children,
}: {
  selected: boolean;
  multiple: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
        selected ? "border-primary bg-primary/10" : "border-border bg-surface hover:border-primary/50"
      }`}
    >
      <span
        aria-hidden
        className={`grid size-5 shrink-0 place-items-center border-2 ${multiple ? "rounded-md" : "rounded-full"} ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
      >
        {selected && <span className="text-[10px]">✓</span>}
      </span>
      {children}
    </button>
  );
}

function OrderingInput({
  items,
  value,
  onChange,
}: {
  items: { id: string; text: string }[];
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  const order = value ?? items.map((i) => i.id);
  const text = new Map(items.map((i) => [i.id, i.text]));
  const move = (from: number, to: number) => {
    const next = [...order];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x!);
    onChange(next);
  };
  return (
    <ol className="space-y-2">
      {order.map((id, i) => (
        <li key={id} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
          <span className="w-6 font-mono text-sm text-muted">{i + 1}</span>
          <span className="flex-1">{text.get(id)}</span>
          <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move "${text.get(id)}" up`} className="rounded-md px-2 py-1 hover:bg-surface-muted disabled:opacity-30">
            ↑
          </button>
          <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label={`Move "${text.get(id)}" down`} className="rounded-md px-2 py-1 hover:bg-surface-muted disabled:opacity-30">
            ↓
          </button>
        </li>
      ))}
    </ol>
  );
}

export function QuizForm({ attemptId, paper }: { attemptId: string; paper: QuizPaperQuestion[] }) {
  const [answers, setAnswers] = useState<Record<string, QuizAnswer>>({});
  const [pending, start] = useTransition();
  const set = (id: string, v: QuizAnswer) => setAnswers((a) => ({ ...a, [id]: v }));
  // An untouched ordering question is answered with the order shown.
  const final = (): Record<string, QuizAnswer> => {
    const out = { ...answers };
    for (const q of paper) if (q.type === "ordering" && !out[q.id]) out[q.id] = q.items.map((i) => i.id);
    return out;
  };
  const answered = paper.filter(
    (q) => q.type === "ordering" || (answers[q.id] !== undefined && !(Array.isArray(answers[q.id]) && (answers[q.id] as string[]).length === 0)),
  ).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (answered < paper.length && !confirm(`${paper.length - answered} question(s) unanswered. Submit anyway?`)) return;
        start(() => submitQuiz(attemptId, final()));
      }}
      className="space-y-6"
    >
      {paper.map((q, i) => (
        <fieldset key={q.id} className="rounded-card border border-border bg-surface p-5 sm:p-6">
          <legend className="sr-only">Question {i + 1}</legend>
          <p className="text-sm text-muted">
            Question {i + 1} of {paper.length}
          </p>
          <p className="mt-1 text-lg font-medium">{q.prompt}</p>
          <div className="mt-4 space-y-2">
            {(q.type === "single" || q.type === "multiple") && (
              <>
                {q.type === "multiple" && <p className="text-sm text-muted">Select all that apply.</p>}
                {q.options.map((o) => {
                  const current = answers[q.id];
                  const selected = q.type === "single" ? current === o.id : Array.isArray(current) && current.includes(o.id);
                  return (
                    <OptionButton
                      key={o.id}
                      multiple={q.type === "multiple"}
                      selected={selected}
                      onClick={() => {
                        if (q.type === "single") set(q.id, o.id);
                        else {
                          const cur = (Array.isArray(current) ? current : []) as string[];
                          set(q.id, selected ? cur.filter((x) => x !== o.id) : [...cur, o.id]);
                        }
                      }}
                    >
                      {o.text}
                    </OptionButton>
                  );
                })}
              </>
            )}
            {q.type === "true_false" &&
              [true, false].map((v) => (
                <OptionButton key={String(v)} multiple={false} selected={answers[q.id] === v} onClick={() => set(q.id, v)}>
                  {v ? "True" : "False"}
                </OptionButton>
              ))}
            {q.type === "ordering" && (
              <>
                <p className="text-sm text-muted">Put the items in the right order.</p>
                <OrderingInput items={q.items} value={answers[q.id] as string[] | undefined} onChange={(ids) => set(q.id, ids)} />
              </>
            )}
          </div>
        </fieldset>
      ))}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-4 border-t border-border bg-background/95 px-4 py-4 backdrop-blur">
        <span className="text-sm text-muted">
          {answered} / {paper.length} answered
        </span>
        <button disabled={pending} className="ml-auto h-12 rounded-full bg-primary px-8 font-medium text-primary-foreground disabled:opacity-50">
          {pending ? "Grading…" : "Submit answers"}
        </button>
      </div>
    </form>
  );
}
