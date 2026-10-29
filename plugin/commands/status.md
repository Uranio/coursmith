---
description: Show the Coursmith review status of a course and act on the feedback
argument-hint: "[course folder or submission id]"
---

Check the Coursmith review of: $ARGUMENTS

- If that is a folder (or nothing was given and the current folder contains `.coursmith.json`), run
  `npx -y coursmith status --dir <folder> --json`. If it is a submission id, run
  `npx -y coursmith status <id> --json`.
- Summarize the result for the user: status, review summary, and each issue with its path and suggestion.
- If the status is `needs_revision`, offer to apply the fixes following the `coursmith-course` skill
  (section 7), then validate and resubmit.
