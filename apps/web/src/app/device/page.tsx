import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { normalizeUserCode } from "@/lib/api/tokens";
import { decideDeviceCode, findPendingDeviceCode } from "@/lib/device";

export const metadata: Metadata = { title: "Connect your agent" };

async function decide(formData: FormData) {
  "use server";
  const code = normalizeUserCode(String(formData.get("code") ?? ""));
  const user = await requireUser(`/device${code ? `?code=${code}` : ""}`);
  if (!code) redirect("/device?status=invalid");
  const approve = formData.get("decision") === "approve";
  const ok = await decideDeviceCode(code, user.id, approve);
  redirect(`/device?status=${ok ? (approve ? "approved" : "denied") : "invalid"}`);
}

export default function DevicePage({ searchParams }: PageProps<"/device">) {
  return (
    <main className="mx-auto max-w-lg px-4 py-20 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Connect your agent</h1>
      <Suspense fallback={<p className="mt-6 text-muted">Loading…</p>}>
        <DeviceStep searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const card = "mt-8 rounded-card border border-border bg-surface p-6";

async function DeviceStep({ searchParams }: Pick<PageProps<"/device">, "searchParams">) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : null;
  const rawCode = typeof params.code === "string" ? params.code : "";
  const code = normalizeUserCode(rawCode);
  const user = await requireUser(`/device${code ? `?code=${code}` : ""}`);

  if (status === "approved") {
    return (
      <div className={card} role="status">
        <p className="text-lg font-medium text-success">Connected</p>
        <p className="mt-2 text-muted">Your agent is now logged in as @{user.username}. You can close this tab.</p>
      </div>
    );
  }
  if (status === "denied") {
    return (
      <div className={card} role="status">
        <p className="text-lg font-medium">Request denied</p>
        <p className="mt-2 text-muted">No access was granted. You can close this tab.</p>
      </div>
    );
  }

  const pending = code ? await findPendingDeviceCode(code) : null;
  if (!pending) {
    return (
      <form className={card}>
        {(status === "invalid" || rawCode) && (
          <p className="mb-4 text-sm text-danger" role="alert">
            This code is invalid or expired. Run <code className="font-mono">coursmith login</code> again.
          </p>
        )}
        <label htmlFor="code" className="text-sm font-medium">
          Enter the code shown by the CLI
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="code"
            name="code"
            required
            autoComplete="off"
            placeholder="XXXX-XXXX"
            className="h-11 flex-1 rounded-lg border border-border bg-background px-3 font-mono tracking-widest uppercase outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <button className="h-11 rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:opacity-90">
            Continue
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={decide} className={card}>
      <input type="hidden" name="code" value={code!} />
      <p className="text-muted">
        <strong className="text-foreground">{pending.client_name}</strong>
        {pending.client_version ? ` (CLI ${pending.client_version})` : ""} wants to publish courses as{" "}
        <strong className="text-foreground">@{user.username}</strong>.
      </p>
      <p className="mt-4 text-sm text-muted">Check that the CLI shows the same code:</p>
      <p className="mt-2 font-mono text-3xl tracking-[0.3em]">{code}</p>
      <p className="mt-4 text-sm text-muted">
        Only approve if you started this login yourself. You can revoke access later from your dashboard.
      </p>
      <div className="mt-6 flex gap-3">
        <button
          name="decision"
          value="approve"
          className="h-11 flex-1 rounded-lg bg-primary font-medium text-primary-foreground hover:opacity-90"
        >
          Approve
        </button>
        <button name="decision" value="deny" className="h-11 flex-1 rounded-lg border border-border font-medium hover:bg-surface-muted">
          Deny
        </button>
      </div>
    </form>
  );
}
