import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { LoginButton, UserNav } from "@/components/user-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Coursmith", template: "%s · Coursmith" },
  description: "A catalog of interactive courses crafted with AI agents and reviewed before publishing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <header className="sticky top-0 z-40 print:hidden border-b border-border/70 bg-background/80 backdrop-blur">
          <nav className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span aria-hidden className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                C
              </span>
              Coursmith
            </Link>
            <div className="ml-auto flex items-center gap-1 text-sm">
              <Link href="/courses" className="rounded-md px-3 py-2 text-muted hover:text-foreground">
                Courses
              </Link>
              <Link href="/publish" className="rounded-md px-3 py-2 text-muted hover:text-foreground">
                Publish
              </Link>
              <Suspense fallback={<LoginButton />}>
                <UserNav />
              </Suspense>
            </div>
          </nav>
        </header>
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border/70 py-8 text-sm text-muted print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap gap-x-6 gap-y-2 px-4 sm:px-6">
            <span>© Coursmith</span>
            <Link href="/content-policy" className="hover:text-foreground">
              Content policy
            </Link>
            <Link href="/publish" className="hover:text-foreground">
              Publish with your agent
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
