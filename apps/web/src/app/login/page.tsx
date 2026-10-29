import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col px-4 py-20 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Log in to Coursmith</h1>
      <p className="mt-3 text-muted">
        We&apos;ll email you a link. No password needed — new accounts are created automatically.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
