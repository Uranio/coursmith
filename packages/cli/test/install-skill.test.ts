import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { skillsDir, targetsFor } from "../src/install-skill.js";

describe("skillsDir", () => {
  const home = homedir();
  const savedXdg = process.env.XDG_CONFIG_HOME;
  afterEach(() => {
    if (savedXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = savedXdg;
  });

  it("maps each agent to its user-level folder", () => {
    delete process.env.XDG_CONFIG_HOME;
    expect(skillsDir("claude", "user")).toBe(join(home, ".claude", "skills"));
    expect(skillsDir("codex", "user")).toBe(join(home, ".agents", "skills"));
    expect(skillsDir("cursor", "user")).toBe(join(home, ".cursor", "skills"));
    expect(skillsDir("opencode", "user")).toBe(join(home, ".config", "opencode", "skills"));
  });

  it("honours XDG_CONFIG_HOME for OpenCode", () => {
    process.env.XDG_CONFIG_HOME = "/x/config";
    expect(skillsDir("opencode", "user")).toBe(join("/x/config", "opencode", "skills"));
  });

  it("maps each agent to its project folder", () => {
    expect(skillsDir("claude", "project", "/repo")).toBe("/repo/.claude/skills");
    expect(skillsDir("codex", "project", "/repo")).toBe("/repo/.agents/skills");
    expect(skillsDir("cursor", "project", "/repo")).toBe("/repo/.cursor/skills");
    expect(skillsDir("opencode", "project", "/repo")).toBe("/repo/.opencode/skills");
  });

  it("covers every agent with the two shared folders for `all`", () => {
    expect(targetsFor("all")).toEqual(["claude", "codex"]);
    expect(targetsFor("cursor")).toEqual(["cursor"]);
  });
});

describe("installSkill", () => {
  it("copies the bundled skill (requires `npm run build`)", async () => {
    const { installSkill } = await import("../src/install-skill.js");
    // From src/, the bundled skill resolves to ../skill like it does from dist/.
    const dir = await mkdtemp(join(tmpdir(), "coursmith-skill-"));
    try {
      const dest = await installSkill(dir);
      expect(await readFile(join(dest, "SKILL.md"), "utf8")).toMatch(/^---\nname: coursmith-course\n/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
