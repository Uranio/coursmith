import { cp, mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SKILL_NAME = "coursmith-course";

export const AGENTS = ["claude", "codex", "cursor", "opencode"] as const;
export type Agent = (typeof AGENTS)[number];

/**
 * Skills directories per agent (Agent Skills standard: <dir>/<skill-name>/SKILL.md).
 * - Claude Code: ~/.claude/skills, .claude/skills
 * - Codex: ~/.agents/skills, .agents/skills (https://learn.chatgpt.com/docs/build-skills)
 * - Cursor: ~/.cursor/skills, .cursor/skills; also reads .agents, .claude and .codex (https://cursor.com/docs/skills)
 * - OpenCode: ~/.config/opencode/skills, .opencode/skills; also reads .claude and .agents (https://opencode.ai/docs/skills/)
 */
export function skillsDir(agent: Agent, scope: "user" | "project", cwd = process.cwd()): string {
  const base = scope === "user" ? homedir() : cwd;
  switch (agent) {
    case "claude":
      return join(base, ".claude", "skills");
    case "codex":
      return join(base, ".agents", "skills");
    case "cursor":
      return join(base, ".cursor", "skills");
    case "opencode":
      return scope === "user"
        ? join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode", "skills")
        : join(cwd, ".opencode", "skills");
  }
}

/**
 * `all` installs into the two shared locations that every supported agent reads:
 * .claude/skills (Claude Code, Cursor, OpenCode) and .agents/skills (Codex, Cursor, OpenCode).
 */
export function targetsFor(agent: Agent | "all"): Agent[] {
  return agent === "all" ? ["claude", "codex"] : [agent];
}

/** The skill folder shipped inside the npm package (copied there by the build). */
export function bundledSkillDir(): string {
  return fileURLToPath(new URL(`../skill/${SKILL_NAME}`, import.meta.url));
}

export async function installSkill(destParent: string): Promise<string> {
  const src = bundledSkillDir();
  try {
    await stat(join(src, "SKILL.md"));
  } catch {
    throw new Error(`The bundled skill is missing (${src}). Reinstall the coursmith package.`);
  }
  const dest = resolve(destParent, SKILL_NAME);
  await mkdir(destParent, { recursive: true });
  // Replace any previous version so removed reference files do not linger.
  await rm(dest, { recursive: true, force: true });
  await cp(src, dest, { recursive: true });
  return dest;
}
