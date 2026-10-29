import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Player } from "@/components/player/player";
import { requireUser } from "@/lib/auth";
import { loadPlayer } from "@/lib/player";

export const metadata: Metadata = { robots: { index: false } };

export default function LearnPage({ params }: PageProps<"/learn/[slug]">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-background text-muted">Loading course…</div>}>
      <Learn params={params} />
    </Suspense>
  );
}

async function Learn({ params }: Pick<PageProps<"/learn/[slug]">, "params">) {
  const { slug } = await params;
  const user = await requireUser(`/learn/${slug}`);
  const data = await loadPlayer(slug, user.id);
  if (!data) notFound();
  return <Player data={data} />;
}
