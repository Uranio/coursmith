"use client";

import type { HighlighterCore, LanguageInput } from "shiki/core";

// A curated set keeps the bundle small; anything else renders as plain text.
const LANGUAGES: Record<string, () => Promise<{ default: LanguageInput }>> = {
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  jsx: () => import("@shikijs/langs/jsx"),
  tsx: () => import("@shikijs/langs/tsx"),
  python: () => import("@shikijs/langs/python"),
  bash: () => import("@shikijs/langs/bash"),
  json: () => import("@shikijs/langs/json"),
  yaml: () => import("@shikijs/langs/yaml"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  sql: () => import("@shikijs/langs/sql"),
  java: () => import("@shikijs/langs/java"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  php: () => import("@shikijs/langs/php"),
  ruby: () => import("@shikijs/langs/ruby"),
  r: () => import("@shikijs/langs/r"),
  markdown: () => import("@shikijs/langs/markdown"),
  dockerfile: () => import("@shikijs/langs/dockerfile"),
};

const ALIASES: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  "c++": "cpp",
  cs: "csharp",
  "c#": "csharp",
  md: "markdown",
  kt: "kotlin",
  rb: "ruby",
  golang: "go",
  rs: "rust",
  docker: "dockerfile",
};

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighter ??= (async () => {
    const [{ createHighlighterCore }, { createJavaScriptRegexEngine }, light, dark] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("@shikijs/themes/github-light"),
      import("@shikijs/themes/github-dark"),
    ]);
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  return highlighter;
}

/** HTML with both themes as CSS variables, or null for languages outside the curated set. */
export async function highlight(code: string, language: string): Promise<string | null> {
  const lang = ALIASES[language] ?? language;
  const load = LANGUAGES[lang];
  if (!load) return null;
  const hl = await getHighlighter();
  if (!hl.getLoadedLanguages().includes(lang)) await hl.loadLanguage((await load()).default);
  return hl.codeToHtml(code, { lang, themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
}
