import type { Block, Course, Section, VisualBlock } from "@coursmith/course-schema";

/**
 * Renders course content as labelled plain text for the review models. Every element carries its
 * course.json path so the model can point at exactly what to fix.
 */

function compactJson(value: unknown, max = 3_000): string {
  const s = JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}… [truncated]` : s;
}

function blockText(b: Block | VisualBlock): string {
  switch (b.type) {
    case "markdown":
      return b.text;
    case "callout":
      return `[${b.variant}${b.title ? `: ${b.title}` : ""}] ${b.text}`;
    case "quote":
      return `"${b.text}"${b.cite ? ` — ${b.cite}` : ""}`;
    case "image":
      return `[image asset "${b.asset}"]${b.caption ? ` caption: ${b.caption}` : ""}`;
    case "code":
      return `\`\`\`${b.language}\n${b.code}\n\`\`\`${b.caption ? `\ncaption: ${b.caption}` : ""}`;
    case "math":
      return `$$ ${b.tex} $$${b.caption ? ` caption: ${b.caption}` : ""}`;
    case "table":
      return [b.headers.join(" | "), ...b.rows.map((r) => r.join(" | ")), b.caption ? `caption: ${b.caption}` : ""]
        .filter(Boolean)
        .join("\n");
    case "chart":
      return `[chart${b.title ? ` "${b.title}"` : ""}] Vega-Lite spec: ${compactJson(b.spec)}${b.caption ? `\ncaption: ${b.caption}` : ""}`;
    case "diagram":
      return `[mermaid diagram]\n${b.code}${b.caption ? `\ncaption: ${b.caption}` : ""}`;
    case "animation":
      return `[animation ${b.animation.preset}] ${compactJson(b.animation)}${b.caption ? `\ncaption: ${b.caption}` : ""}`;
  }
}

export function metaText(course: Course): string {
  const m = course.meta;
  return [
    `Title: ${m.title}`,
    m.subtitle ? `Subtitle: ${m.subtitle}` : "",
    `Declared language: ${m.language}`,
    `Declared difficulty: ${m.difficulty}`,
    `Category: ${m.category}`,
    m.tags.length ? `Tags: ${m.tags.join(", ")}` : "",
    `Estimated minutes: ${m.estimatedMinutes}`,
    `Description (meta.description): ${m.description}`,
    `Learning objectives: ${m.learningObjectives.map((o) => `\n- ${o}`).join("")}`,
    m.prerequisites.length ? `Prerequisites: ${m.prerequisites.map((o) => `\n- ${o}`).join("")}` : "",
    `Assets: ${course.assets
      .map((a, i) => `\n- assets[${i}] id="${a.id}" kind=${a.kind} alt="${a.alt}"${a.caption ? ` caption="${a.caption}"` : ""}`)
      .join("")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function outlineText(course: Course): string {
  return course.sections
    .map((s, si) => `sections[${si}] "${s.title}": ${s.summary}\n${s.steps.map((st, ti) => `  steps[${ti}] ${st.title}`).join("\n")}`)
    .join("\n");
}

export function sectionText(section: Section, si: number): string {
  const out = [`## sections[${si}] — ${section.title}`, `Summary: ${section.summary}`];
  for (const [ti, st] of section.steps.entries()) {
    const p = `sections[${si}].steps[${ti}]`;
    out.push(`\n### ${p} — ${st.title}`);
    if (st.visual) out.push(`<${p}.visual>\n${blockText(st.visual)}`);
    for (const [bi, b] of st.blocks.entries()) out.push(`<${p}.blocks[${bi}]>\n${blockText(b)}`);
    if (st.check) out.push(`<${p}.check> (practice question, not scored)\n${compactJson(st.check, 2_000)}`);
  }
  out.push(`\n### sections[${si}].glossary`);
  for (const [gi, g] of section.glossary.entries()) {
    out.push(`- [${gi}] ${g.term}${g.aliases?.length ? ` (aliases: ${g.aliases.join(", ")})` : ""}: ${g.definition}`);
  }
  return out.join("\n");
}

export function quizText(course: Course): string {
  return [
    "Answer keys: single → `correct` option id; multiple → `correct` ids; true_false → `correct` boolean; " +
      "ordering → `items` are listed in the CORRECT order (the portal shuffles them for learners), so there is no `correct` field.",
    ...course.finalQuiz.questions.map((q, qi) => `<finalQuiz.questions[${qi}]> tests section "${q.sectionRef}"\n${compactJson(q, 2_500)}`),
  ].join("\n\n");
}

export function fullCourseText(course: Course): string {
  return [
    metaText(course),
    ...course.sections.map((s, si) => sectionText(s, si)),
    "## Final quiz",
    quizText(course),
  ].join("\n\n");
}
