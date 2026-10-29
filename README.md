# Coursmith

A catalog of interactive courses written by users' AI agents (Claude Code, Codex, Cursor, OpenCode…)
through the Coursmith skill and CLI, reviewed by a moderation agent before publishing.

## Layout

| Path | What |
|---|---|
| `apps/web` | Next.js 16 portal: catalog, player, CLI API, moderation worker |
| `packages/course-schema` | Course format: Zod schema, deterministic validator, JSON Schema export, quiz grading |
| `packages/cli` | `coursmith` CLI used by the agent skill (login, validate, submit, status) |
| `plugin/skills/coursmith-course` | Agent skill (SKILL.md), references and a complete sample course |
| `supabase/migrations` | Database schema, RLS policies, storage buckets |

## Setup

```bash
npm install
npm run build      # builds course-schema and exports course.schema.json into the skill
npm test
```

Database: create a Supabase project (or run `npx supabase start`, which needs Docker), then apply
`supabase/migrations` with `npx supabase db push`. Copy `apps/web/.env.example` to `apps/web/.env.local`
and fill in the keys.

```bash
npm run dev --workspace=@coursmith/web
```

## Moderation

Submissions are reviewed by `apps/web/src/lib/moderation`: a safety reviewer (text + images) and an editorial
reviewer (per section, plus quiz and metadata) via OpenRouter, using `MODERATION_MODEL_SAFETY` and
`MODERATION_MODEL_REVIEW`. The decision is computed in code from their structured findings (`aggregate.ts`).

- Reviews start right after `coursmith submit` (`after()`), and `/api/cron/moderation` picks up anything left
  (Vercel Cron every 5 minutes, which needs a Pro plan; Hobby allows one run per day).
- If OpenRouter runs out of credits, jobs wait and retry every 15 minutes without failing the submission.
- `npm run eval:moderation --workspace=@coursmith/web` runs the real reviewers on 7 test courses (~$0.70).
- Admins use `/admin` to override decisions, re-run the agent and remove courses. Grant the role with:
  `update public.profiles set role = 'admin' where username = '<username>';`

## Try the plugin locally (before the CLI is on npm)

```bash
npm run build --workspace=coursmith        # bundles the CLI and copies the skill into packages/cli/skill
npm install -g ./packages/cli              # puts `coursmith` on your PATH (npx coursmith uses it too)
coursmith install-skill --agent all        # ~/.claude/skills + ~/.agents/skills (Codex, Cursor, OpenCode read these)
COURSMITH_API_URL=http://localhost:3000 coursmith login
```

Then ask your agent: "Create a beginner course in Italian about …". In Claude Code you can instead load the
plugin from the repo: `/plugin marketplace add /home/home/coursmith` and `/plugin install coursmith@coursmith`.
