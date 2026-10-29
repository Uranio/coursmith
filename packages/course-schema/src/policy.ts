/**
 * Coursmith content policy. The moderation agent receives this text verbatim, and the build exports it
 * to the agent skill (references/content-policy.md), so authors and reviewers apply the same rules.
 */
export const CONTENT_POLICY = `# Coursmith content policy

Courses must be educational, accurate and respectful. The review agent applies these rules to all text,
charts, diagrams, animations and images in a course.

## Not allowed (the course is rejected)

- **Hate and harassment**: content that demeans or attacks people for ethnicity, nationality, religion,
  gender, sexual orientation, disability, age or similar traits; slurs; targeted harassment of real people.
- **Blasphemy and mockery of beliefs**: content meant to insult, ridicule or desecrate religions, their
  figures, symbols or believers. Neutral, factual teaching about religions, their history and critiques
  presented with respect is allowed.
- **Sexual content**: explicit sexual material, sexualization of anyone, any sexual content involving minors.
- **Graphic violence or gore** presented for shock value; glorification of violence, terrorism or extremism;
  extremist propaganda or recruitment.
- **Dangerous instructions**: weapons, explosives or drug synthesis; malware or intrusion techniques aimed at
  real systems; self-harm or suicide methods; dangerous challenges.
- **Illegal activity**: fraud, scams, evading law enforcement, piracy guides, trafficking.
- **Deception**: deliberate disinformation, conspiracy theories presented as fact, impersonation of real
  people or organizations, plagiarism of copyrighted works.
- **Spam**: advertising, affiliate links, courses whose purpose is to sell something rather than to teach.

## Sensitive topics (allowed with care; otherwise revision is required)

Health and medicine, mental health, law, personal finance and investing, politics, religion, history of
conflicts and atrocities, sexuality education, drugs and addiction (prevention and awareness).

Courses on these topics must:
- stay factual, balanced and neutral, presenting established consensus and noting where experts disagree;
- avoid giving individual medical, legal or financial advice, and include a short disclaimer pointing
  learners to qualified professionals;
- describe difficult events without graphic detail and with respect for victims.

## Quality requirements (revision is required when not met)

- **Accuracy**: no factual errors, outdated claims presented as current, or invented data. Example figures
  must be labelled as illustrative.
- **Clarity**: each step explains one idea in plain language suited to the declared difficulty; no
  unexplained jumps.
- **Language**: all learner-facing text is written in the course's declared language.
- **Difficulty**: content depth matches the declared level (beginner, intermediate, advanced).
- **Glossary**: every concept introduced and every technical or domain-specific term used in a section is
  defined in that section's glossary (or an earlier one), with a correct, self-contained definition.
- **Quiz**: every question has exactly the declared correct answer, unambiguous wording, plausible
  distractors, and an explanation consistent with the course content.
- **Visuals**: charts, diagrams, animations and images must be relevant, correctly labelled and consistent
  with the text.
`;
