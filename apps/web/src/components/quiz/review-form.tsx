"use client";

import { useActionState, useState } from "react";
import { submitReview, type ReviewState } from "@/app/learn/[slug]/actions";

export function ReviewForm({ courseId }: { courseId: string }) {
  const [state, action, pending] = useActionState<ReviewState, FormData>(submitReview, null);
  const [rating, setRating] = useState(0);
  if (state?.ok) return <p className="rounded-card border border-success/40 bg-success/10 p-4">{state.message}</p>;
  return (
    <form action={action} className="rounded-card border border-border bg-surface p-5">
      <input type="hidden" name="courseId" value={courseId} />
      <input type="hidden" name="rating" value={rating} />
      <p className="font-medium">How was this course?</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            onClick={() => setRating(n)}
            className={`text-3xl transition ${n <= rating ? "text-warning" : "text-border hover:text-warning/60"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        name="body"
        rows={3}
        maxLength={2000}
        placeholder="What did you like? What could be better? (optional)"
        className="mt-3 w-full rounded-lg border border-border bg-background p-3"
      />
      {state && !state.ok && <p className="mt-2 text-sm text-danger">{state.message}</p>}
      <button disabled={pending || !rating} className="mt-3 h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-40">
        {pending ? "Sending…" : "Publish review"}
      </button>
    </form>
  );
}
