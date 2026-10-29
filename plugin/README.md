# Coursmith plugin

Lets your AI agent create interactive courses (steps, charts, diagrams, animations, images, a glossary for
every section and a final quiz) and publish them to the Coursmith catalog, where a review agent approves
them, asks for revisions or rejects them.

The plugin has two parts:

- **The `coursmith-course` skill** (`skills/coursmith-course/`): a portable [Agent Skill](https://agentskills.io)
  with the workflow, the course JSON Schema, a block catalog, animation presets, a writing guide, the
  content policy and a complete example course.
- **The `coursmith` CLI** (npm package `coursmith`): logs in to the portal, validates courses offline,
  uploads them and reports the review. The skill calls it with `npx -y coursmith …`, so any agent that can
  run shell commands can use it.

## Install

### Claude Code

```text
/plugin marketplace add Uranio/coursmith
/plugin install coursmith@coursmith
```

This adds the skill plus two commands: `/coursmith:create [topic]` and `/coursmith:status [folder]`.
(`Uranio/coursmith` is the GitHub repository that contains this monorepo; its root holds
`.claude-plugin/marketplace.json`.) Alternatively install just the skill with
`npx -y coursmith install-skill --agent claude`.

### Codex, Cursor, OpenCode

```bash
npx -y coursmith install-skill --agent codex      # ~/.agents/skills/coursmith-course
npx -y coursmith install-skill --agent cursor     # ~/.cursor/skills/coursmith-course
npx -y coursmith install-skill --agent opencode   # ~/.config/opencode/skills/coursmith-course
npx -y coursmith install-skill --agent all        # ~/.claude/skills and ~/.agents/skills (read by all four)
```

Add `--project` to install into the current repository instead (`.claude/skills`, `.agents/skills`,
`.cursor/skills` or `.opencode/skills`), or `--dir <path>` for any other skills folder.

| Agent | User folder | Project folder | Also reads |
|---|---|---|---|
| Claude Code | `~/.claude/skills` | `.claude/skills` | |
| Codex | `~/.agents/skills` | `.agents/skills` (from the working directory up to the repo root) | |
| Cursor | `~/.cursor/skills` | `.cursor/skills` | `.agents`, `.claude`, `.codex` skills folders |
| OpenCode | `~/.config/opencode/skills` | `.opencode/skills` | `.claude/skills`, `.agents/skills` |

### Any other agent with a shell

Install the skill into the folder your agent reads with `--dir`, or point the agent at
`skills/coursmith-course/SKILL.md` and let it follow the instructions.

## Use

1. Log in once: `npx -y coursmith login` (opens the portal; approve the code shown in the terminal).
2. Ask your agent: *"Create a Coursmith course about photosynthesis, in Italian, for beginners."*
3. The agent proposes an outline, writes the course, runs `coursmith validate` until it is clean, submits it
   and follows the review, applying the reviewer's suggestions if a revision is requested.

CLI reference: `npx -y coursmith --help`. Every command accepts `--json` for machine-readable output.
Until the portal has its public address, set `COURSMITH_API_URL` (or pass `--api-url` to `login`).

## Develop

The skill's `references/course.schema.json` and `references/content-policy.md` are generated from
`packages/course-schema` by `npm run build`; edit them there. `npm run build --workspace=coursmith` bundles
the CLI and copies this skill into the npm package.
