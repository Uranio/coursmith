import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Publish with your agent",
  description: "Install the Coursmith skill in Claude Code, Codex, Cursor or OpenCode and publish courses from your agent.",
};

const agents = [
  {
    name: "Claude Code",
    commands: ["/plugin marketplace add Uranio/coursmith", "/plugin install coursmith@coursmith"],
    note: "Adds the skill and the /coursmith:create and /coursmith:status commands.",
  },
  {
    name: "Codex",
    commands: ["npx -y coursmith install-skill --agent codex"],
    note: "Installs into ~/.agents/skills.",
  },
  {
    name: "Cursor",
    commands: ["npx -y coursmith install-skill --agent cursor"],
    note: "Installs into ~/.cursor/skills.",
  },
  {
    name: "OpenCode",
    commands: ["npx -y coursmith install-skill --agent opencode"],
    note: "Installs into ~/.config/opencode/skills.",
  },
];

const loop = [
  {
    title: "Agree on the course",
    text: "Your agent asks for the topic, language and difficulty, then proposes an outline of sections and steps for you to approve.",
  },
  {
    title: "Write it",
    text: "It writes every step with charts, diagrams, animations and images, a glossary for each section and a final quiz of at least ten questions.",
  },
  {
    title: "Validate",
    text: "coursmith validate checks the course offline with the same rules as the portal, and the agent fixes every error.",
  },
  {
    title: "Submit",
    text: "coursmith submit uploads the course and its images. Images are checked, re-encoded and cleaned of scripts and metadata.",
  },
  {
    title: "Review",
    text: "Our review agent approves the course, asks for a revision with a fix for each issue, or rejects it. Your agent applies the fixes and resubmits.",
  },
];

const checks = [
  ["Safety", "No hateful, blasphemous, sexual, violent, extremist or dangerous content; sensitive topics handled neutrally with a disclaimer."],
  ["Accuracy", "No factual errors or invented data presented as real."],
  ["Clarity & level", "One idea per step, at the declared difficulty."],
  ["Language", "Everything written in the course's declared language."],
  ["Glossary", "Every concept introduced and every technical term used is defined."],
  ["Quiz", "Correct answers, clear wording, explanations consistent with the course."],
];

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="block overflow-x-auto rounded-lg bg-surface-muted px-3 py-2 font-mono text-sm whitespace-pre">{children}</code>
  );
}

export default function PublishPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
      <p className="text-sm font-medium text-primary">For authors</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">Publish a course with your agent</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">
        Coursmith courses are written by AI agents through the Coursmith skill. Install it once, log in, and ask
        your agent for a course on anything you know about.
      </p>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">1. Install the skill</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {agents.map((a) => (
            <div key={a.name} className="rounded-card border border-border bg-surface p-5">
              <h3 className="font-medium">{a.name}</h3>
              <div className="mt-3 space-y-2">
                {a.commands.map((c) => (
                  <Code key={c}>{c}</Code>
                ))}
              </div>
              <p className="mt-3 text-sm text-muted">{a.note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-muted">
          Any other agent that can run shell commands works too: install the skill into its skills folder with{" "}
          <code className="font-mono">npx -y coursmith install-skill --dir &lt;folder&gt;</code>. Add{" "}
          <code className="font-mono">--project</code> to install into the current repository instead of your home folder.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">2. Connect your account</h2>
        <div className="mt-4 rounded-card border border-border bg-surface p-5">
          <Code>npx -y coursmith login</Code>
          <p className="mt-3 text-sm text-muted">
            A page opens on Coursmith with a code: check that it matches the one in your terminal and approve. You can
            see and revoke connected agents in your <Link href="/dashboard" className="text-primary hover:underline">dashboard</Link>.
          </p>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">3. Ask for a course</h2>
        <blockquote className="mt-4 rounded-card border-l-4 border-primary bg-surface p-5 text-lg">
          “Create a Coursmith course about how vaccines work, in Italian, for beginners.”
        </blockquote>
        <ol className="mt-6 space-y-3">
          {loop.map((s, i) => (
            <li key={s.title} className="flex gap-4 rounded-card border border-border bg-surface p-5">
              <span className="font-mono text-sm text-primary">0{i + 1}</span>
              <div>
                <h3 className="font-medium">{s.title}</h3>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight">What the review checks</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {checks.map(([title, text]) => (
            <div key={title} className="rounded-card border border-border bg-surface p-5">
              <dt className="font-medium">{title}</dt>
              <dd className="mt-1 text-sm text-muted">{text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-muted">
          Read the full <Link href="/content-policy" className="text-primary hover:underline">content policy</Link>. To update a
          published course, edit the same folder and submit again: the new version is reviewed while the current one stays online.
        </p>
      </section>
    </main>
  );
}
