---
name: coursmith-course
description: Create an interactive course (steps, charts, diagrams, animations, images, a glossary per section and a final quiz) and publish it to the Coursmith catalog with the coursmith CLI. Use when the user asks to create, write, generate, update, publish or submit a course or lesson for Coursmith, or to check a Coursmith review.
---

# Create and publish a Coursmith course

You write a course as a folder containing `course.json` and an `assets/` directory, check it with the
`coursmith` CLI, and submit it. A review agent on the portal then approves it, asks for a revision or
rejects it. Your job ends when the course is approved, or when you have explained the review outcome to the user.

Run the CLI as `npx -y coursmith <command> --json` (or `coursmith <command> --json` if it is installed
globally). With `--json` every command prints one JSON document; read it instead of guessing.

Reference files in this skill folder (read them when you reach the matching step):

| File | Use it for |
|---|---|
| `references/course.schema.json` | The exact structure of `course.json`. Unknown keys are rejected. |
| `references/block-catalog.md` | Every content block and visual, with valid JSON examples and rules. |
| `references/animation-presets.md` | The 7 animation presets and when to use each. |
| `references/writing-guide.md` | How to write steps, glossaries and quizzes that pass review. |
| `references/content-policy.md` | What is not allowed and how to treat sensitive topics. |
| `examples/sample-course/` | A complete course that passes validation. Copy its shape. |

## 1. Log in

1. Run `npx -y coursmith whoami --json`. If it prints a `username`, continue to step 2.
2. Otherwise run `npx -y coursmith login --no-wait --json`. Show the user the `verificationUri` and the
   `userCode` and ask them to open the link, check the code and click **Approve**.
3. When the user confirms, run `npx -y coursmith login --resume --json` and check that it prints `logged_in`.

## 2. Agree on the course with the user

Ask, in one message, for anything the user has not already given:

- **Topic** and, if useful, the angle or audience.
- **Language** of the course (any language; you will need its BCP-47 code such as `it`, `en`, `pt-BR`).
- **Difficulty**: `beginner`, `intermediate` or `advanced`.
- Optional: desired length (default about 30 minutes), prerequisites, things to include or avoid.

Check the topic against `references/content-policy.md`. If it is not allowed, say so and stop. If it is a
sensitive topic (health, law, finance, politics, religion…), plan a neutral treatment and a disclaimer.

## 3. Propose an outline and get it approved

Show the user:

- title, one-line subtitle, 2–6 learning objectives;
- 3–6 sections, each with a one-line summary and 2–5 step titles;
- for each step, the visual you plan (chart, diagram, animation preset, image or none);
- the planned number of quiz questions (at least 10, covering every section).

Revise until the user agrees. Do not write `course.json` before that.

## 4. Write the course

Create a new folder named after the course (kebab-case) with `course.json` and `assets/`. Follow
`references/course.schema.json` exactly and copy the structure of `examples/sample-course/course.json`.

Rules the validator enforces (details in `references/block-catalog.md`):

- `schemaVersion` is `"1.0"`. Do not write `courseId`: the CLI manages it.
- All ids are lowercase letters, digits and dashes, unique across the course (sections, steps, assets,
  quiz questions).
- Every step has a `title` and at least one block; most steps also have a `visual`.
- **Glossary**: every section has a `glossary` that defines every concept it introduces and every technical or
  domain term it uses. In the text, mark each term as `[[term]]`, or `[[term|text shown]]` when the
  wording differs (use `aliases` for plurals and inflections). A marked term must be defined in the same
  section or an earlier one. Definitions are self-contained and written in the course language.
- **Visuals**: charts are Vega-Lite specs with inline `data.values` (no URLs); diagrams are Mermaid without
  `click` or `%%{init}%%`; animations use one of the 7 presets; images refer to an asset by id.
- **Markdown**: no raw HTML, no Markdown images (use an image block), links must be `https://`.
- **Final quiz**: at least 10 questions; every section is tested by at least one question (`sectionRef`);
  every question has an `explanation`. Types: `single`, `multiple`, `true_false`, `ordering`
  (ordering items are listed in the correct order; the portal shuffles them).
- Optional `check` questions at the end of a step give learners quick feedback and are not scored.

Write section by section and keep the language, difficulty and terminology consistent throughout
(see `references/writing-guide.md`).

## 5. Create the assets

- A **cover image** is required (`meta.coverImage`), ideally 1200×630.
- If you have an image-generation tool, produce PNG, JPEG or WebP files. Otherwise write clean SVG by hand:
  simple shapes, a clear palette, `viewBox` set, no scripts, no external links or fonts, no embedded images.
- For a `highlight-svg` animation, give the elements to highlight an `id` attribute.
- Put every file directly in `assets/` and declare it in `assets[]` with `kind` (`image` or `svg`), `file`
  (`assets/<name>`) and a meaningful `alt` text. Fill `generatedBy` for AI-generated images.
- Each file must be under 3 MB; the whole bundle under 25 MB.

## 6. Validate until clean

Run `npx -y coursmith validate <folder> --json`. It prints `{ "ok": ..., "issues": [...] }`; each issue has
`severity`, `code`, `path` (for example `sections[1].steps[0].blocks[2]`) and `message`.

Fix every `error`, then run it again. Repeat until `ok` is `true`. Fix warnings too when they are cheap
(for example `glossary.unreferenced`: mark the term with `[[...]]` where it is used).

## 7. Submit and follow the review

1. Run `npx -y coursmith submit <folder> --json`. It uploads the course and prints `status: "in_review"`
   with a `submissionId`. The CLI writes `.coursmith.json` in the folder; keep it, because it links later
   submissions to the same course.
2. Run `npx -y coursmith status --dir <folder> --wait --json` (it waits up to 10 minutes; run it again if
   the status is still `in_review`).
3. Act on the `status`:
   - `approved`: give the user the `courseUrl`. Mention any optional suggestions in `review.issues`.
   - `needs_revision`: for each issue in `review.issues`, open the element at `path`, apply the
     `suggestion` (or fix what `message` describes), then validate and submit again. Tell the user what you
     changed. Issues with `severity: "warning"` are optional.
   - `rejected`: explain `review.summary` to the user. Do not resubmit the same content.

If `submit` reports `review_in_progress`, wait for the current review with `status --wait` first.

## Updating a published course

Edit the same folder (keep `.coursmith.json`) and submit again. The new version goes through review while
the current one stays online; keep step ids stable so learners keep their progress.

## Troubleshooting

| CLI output | What to do |
|---|---|
| `not_logged_in` / exit code 3 | Go back to step 1. |
| `client_outdated` | Run with `npx -y coursmith@latest`. |
| `validation_failed` from `submit` | Run `validate` and fix the issues it lists. |
| `rate_limited` | The user reached the daily submission limit; try again tomorrow. |
| `assets.content_type` / `assets.invalid` | The file content does not match its extension, or it is corrupt. Re-export it. |
| `animation.unknown_element` | The SVG lacks an element with that `id` (ids are kept, scripts and external links are removed). |
