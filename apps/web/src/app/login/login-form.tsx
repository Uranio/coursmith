"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    params.get("error") ? "error" : "idle",
  );
  const [message, setMessage] = useState(
    params.get("error") ? "That link is invalid or expired. Request a new one." : "",
  );

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setState("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await createClient().auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) {
      setState("error");
      setMessage(error.message);
    } else {
      setState("sent");
    }
  }

  if (state === "sent") {
    return (
      <div className="mt-8 rounded-card border border-border bg-surface p-5" role="status">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted">
          We sent a login link to <strong className="text-foreground">{email}</strong>. You can close this tab after
          opening it.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-11 rounded-lg border border-border bg-surface px-3 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        placeholder="you@example.com"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="h-11 rounded-lg bg-primary font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {state === "sending" ? "Sending…" : "Email me a login link"}
      </button>
      {state === "error" && (
        <p className="text-sm text-danger" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
