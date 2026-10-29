import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";

export function LoginButton() {
  return (
    <Link href="/login" className="ml-2 rounded-full bg-foreground px-4 py-2 font-medium text-background hover:opacity-90">
      Log in
    </Link>
  );
}

/** Reads the session cookie: render inside <Suspense fallback={<LoginButton />}>. */
export async function UserNav() {
  const user = await getCurrentUser();
  if (!user) return <LoginButton />;
  return (
    <div className="ml-2 flex items-center gap-2">
      <Link href="/dashboard" className="rounded-md px-3 py-2 text-muted hover:text-foreground">
        @{user.username}
      </Link>
      <form action="/auth/signout" method="post">
        <button className="rounded-full border border-border px-4 py-2 font-medium hover:bg-surface-muted">Log out</button>
      </form>
    </div>
  );
}
