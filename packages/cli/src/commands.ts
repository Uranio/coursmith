import { hostname } from "node:os";
import openBrowser from "open";
import { api, ApiError, uploadToSignedUrl } from "./api.js";
import { BundleError, buildManifest, loadBundle } from "./bundle.js";
import {
  clearCredentials,
  clearPendingLogin,
  loadCourseState,
  loadCredentials,
  loadPendingLogin,
  resolveApiUrl,
  saveCourseState,
  saveCredentials,
  savePendingLogin,
  type Credentials,
  type PendingLogin,
} from "./config.js";
import { AGENTS, installSkill, skillsDir, targetsFor, type Agent } from "./install-skill.js";
import { bold, dim, emitJson, green, printIssues, red, summarize, yellow } from "./output.js";
import type { Issue } from "@coursmith/course-schema";

export interface GlobalOptions {
  json?: boolean;
  apiUrl?: string;
}

/** Errors that end the command with a message and an exit code. */
export class CliExit extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
    readonly data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function detectAgent(): string {
  const env = process.env;
  if (env.CLAUDECODE || env.CLAUDE_CODE_ENTRYPOINT) return "Claude Code";
  if (env.CODEX_HOME || env.CODEX_SANDBOX || env.CODEX_MANAGED_BY_NPM) return "Codex";
  if (env.CURSOR_TRACE_ID || env.CURSOR_AGENT) return "Cursor";
  if (env.OPENCODE || env.OPENCODE_BIN_PATH) return "OpenCode";
  return "Coursmith CLI";
}

async function requireCredentials(opts: GlobalOptions): Promise<Credentials> {
  const creds = await loadCredentials();
  if (!creds) throw new CliExit("Not logged in. Run `coursmith login` first.", 3, { error: "not_logged_in" });
  return { ...creds, apiUrl: resolveApiUrl(opts.apiUrl, creds.apiUrl) };
}

function rethrowApi(err: unknown): never {
  if (err instanceof ApiError) {
    const exit = err.status === 401 ? 3 : 1;
    throw new CliExit(err.message, exit, { error: err.code, ...err.body });
  }
  throw err;
}

// ---------------------------------------------------------------------------
// login / logout / whoami

interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

interface TokenResponse {
  accessToken: string;
  user: { username: string; displayName: string };
}

async function pollForToken(pending: PendingLogin, opts: GlobalOptions): Promise<void> {
  let interval = pending.interval;
  while (Date.now() < new Date(pending.expiresAt).getTime()) {
    await sleep(interval * 1000);
    try {
      const res = await api<TokenResponse>(pending.apiUrl, "POST", "/api/v1/device/token", {
        body: { deviceCode: pending.deviceCode },
      });
      await saveCredentials({ apiUrl: pending.apiUrl, token: res.accessToken, username: res.user.username });
      await clearPendingLogin();
      if (opts.json) emitJson({ status: "logged_in", username: res.user.username, apiUrl: pending.apiUrl });
      else console.log(green(`Logged in as @${res.user.username}.`));
      return;
    } catch (err) {
      if (err instanceof ApiError && err.code === "authorization_pending") continue;
      if (err instanceof ApiError && err.code === "slow_down") {
        interval = Number(err.body.interval) || interval + 5;
        continue;
      }
      await clearPendingLogin();
      rethrowApi(err);
    }
  }
  await clearPendingLogin();
  throw new CliExit("The login request expired. Run `coursmith login` again.", 1, { error: "expired_token" });
}

export async function login(opts: GlobalOptions & { browser?: boolean; wait?: boolean; resume?: boolean }) {
  if (opts.resume) {
    const pending = await loadPendingLogin();
    if (!pending) throw new CliExit("No login in progress. Run `coursmith login`.", 1, { error: "no_pending_login" });
    return pollForToken(pending, opts);
  }

  const apiUrl = resolveApiUrl(opts.apiUrl);
  const start = await api<DeviceStart>(apiUrl, "POST", "/api/v1/device/code", {
    body: { clientName: `${detectAgent()} on ${hostname()}` },
  }).catch(rethrowApi);

  const pending: PendingLogin = {
    apiUrl,
    deviceCode: start.deviceCode,
    userCode: start.userCode,
    verificationUriComplete: start.verificationUriComplete,
    interval: start.interval,
    expiresAt: new Date(Date.now() + start.expiresIn * 1000).toISOString(),
  };
  await savePendingLogin(pending);

  if (opts.json) {
    emitJson({
      status: "pending",
      verificationUri: start.verificationUriComplete,
      userCode: start.userCode,
      expiresIn: start.expiresIn,
      next: opts.wait === false ? "Run `coursmith login --resume` after approving in the browser." : undefined,
    });
  } else {
    console.log(`\nOpen this page to connect your agent:\n\n  ${bold(start.verificationUriComplete)}\n`);
    console.log(`and check that it shows the code ${bold(start.userCode)}.\n`);
  }
  if (opts.browser !== false) await openBrowser(start.verificationUriComplete).catch(() => undefined);
  if (opts.wait === false) return;
  if (!opts.json) console.log(dim("Waiting for approval…"));
  await pollForToken(pending, opts);
}

export async function logout(opts: GlobalOptions) {
  const creds = await loadCredentials();
  if (creds) {
    await api(resolveApiUrl(opts.apiUrl, creds.apiUrl), "DELETE", "/api/v1/me/token", { token: creds.token }).catch(
      () => undefined, // Already revoked or offline: forgetting the token locally is what matters.
    );
  }
  await clearCredentials();
  if (opts.json) emitJson({ status: "logged_out" });
  else console.log("Logged out.");
}

export async function whoami(opts: GlobalOptions) {
  const creds = await requireCredentials(opts);
  const me = await api<{ username: string; displayName: string }>(creds.apiUrl, "GET", "/api/v1/me", {
    token: creds.token,
  }).catch(rethrowApi);
  if (opts.json) emitJson({ ...me, apiUrl: creds.apiUrl });
  else console.log(`@${me.username} (${me.displayName}) on ${creds.apiUrl}`);
}

// ---------------------------------------------------------------------------
// install-skill

export async function installSkillCommand(opts: GlobalOptions & { agent?: string; project?: boolean; dir?: string }) {
  const agent = (opts.agent ?? "all") as Agent | "all";
  if (agent !== "all" && !(AGENTS as readonly string[]).includes(agent)) {
    throw new CliExit(`Unknown agent "${agent}". Use one of: ${AGENTS.join(", ")}, all.`, 2, { error: "unknown_agent" });
  }
  const scope = opts.project ? "project" : "user";
  const parents = opts.dir ? [opts.dir] : [...new Set(targetsFor(agent).map((a) => skillsDir(a, scope)))];
  const installed: string[] = [];
  for (const parent of parents) installed.push(await installSkill(parent));

  if (opts.json) {
    emitJson({ status: "installed", agent, scope: opts.dir ? "custom" : scope, paths: installed });
    return;
  }
  for (const p of installed) console.log(green(`✓ Installed the Coursmith skill in ${p}`));
  console.log(
    `\nRestart your agent, then ask it: ${bold('"Create a Coursmith course about <topic>"')}.\n` +
      dim("Log in first with `npx coursmith login` (the skill will also ask you to)."),
  );
}

// ---------------------------------------------------------------------------
// validate

export async function validate(dir: string | undefined, opts: GlobalOptions) {
  const bundle = await loadBundle(dir).catch((err) => {
    if (err instanceof BundleError) throw new CliExit(err.message, 1, { error: "no_course" });
    throw err;
  });
  const { ok, issues } = bundle.result;
  if (opts.json) emitJson({ ok, issues });
  else {
    printIssues(issues);
    console.log(ok ? green(`✓ Valid (${summarize(issues)})`) : red(`✗ Invalid (${summarize(issues)})`));
  }
  if (!ok) throw new CliExit("", 1);
  return bundle;
}

// ---------------------------------------------------------------------------
// submit / status

interface CreatedSubmission {
  submissionId: string;
  courseId: string;
  versionNo: number;
  uploads: { file: string; url: string }[];
  warnings: Issue[];
}

interface FinalizeResult {
  submissionId: string;
  status: string;
  issues: Issue[];
}

export interface SubmissionStatus {
  submissionId: string;
  courseId: string;
  versionNo: number;
  title: string;
  status: string;
  review: { decision: string; summary: string; issues: Issue[] } | null;
  courseUrl: string | null;
}

const WAITING = new Set(["pending_upload", "validating", "in_review"]);

export async function submit(dir: string | undefined, opts: GlobalOptions & { wait?: boolean; timeout?: string }) {
  const creds = await requireCredentials(opts);
  const quiet = { ...opts, json: false };
  const bundle = opts.json ? await loadBundle(dir) : await validate(dir, quiet);
  if (!bundle.result.ok || !bundle.result.course) {
    if (opts.json) emitJson({ status: "invalid", issues: bundle.result.issues });
    throw new CliExit("Fix the validation errors before submitting.", 1);
  }

  const course = { ...bundle.result.course };
  const state = await loadCourseState(bundle.dir);
  if (!course.courseId && state.courseId) course.courseId = state.courseId;

  const manifest = await buildManifest(bundle.dir, course);
  const created = await api<CreatedSubmission>(creds.apiUrl, "POST", "/api/v1/submissions", {
    token: creds.token,
    body: { course, files: manifest.map(({ path, bytes, sha256 }) => ({ path, bytes, sha256 })) },
  }).catch((err) => {
    if (err instanceof ApiError && Array.isArray(err.body.issues) && !opts.json) printIssues(err.body.issues as Issue[]);
    return rethrowApi(err);
  });
  await saveCourseState(bundle.dir, { courseId: created.courseId, lastSubmissionId: created.submissionId });

  if (!opts.json) console.log(dim(`Uploading ${created.uploads.length} asset(s)…`));
  const byPath = new Map(manifest.map((m) => [m.path, m]));
  for (const u of created.uploads) {
    const m = byPath.get(u.file)!;
    await uploadToSignedUrl(u.url, m.data, m.contentType);
  }

  const finalized = await api<FinalizeResult>(
    creds.apiUrl,
    "POST",
    `/api/v1/submissions/${created.submissionId}/finalize`,
    { token: creds.token },
  ).catch((err) => {
    if (err instanceof ApiError && err.status === 422) return err.body as unknown as FinalizeResult;
    return rethrowApi(err);
  });

  if (finalized.status === "needs_revision") {
    if (opts.json) emitJson({ ...finalized, courseId: created.courseId, versionNo: created.versionNo });
    else {
      printIssues(finalized.issues);
      console.log(yellow("Needs revision: fix the issues above and run `coursmith submit` again."));
    }
    throw new CliExit("", 1);
  }

  if (!opts.json) {
    console.log(green(`Submitted "${course.meta.title}" (version ${created.versionNo}). Review in progress.`));
    console.log(dim(`Submission id: ${created.submissionId}`));
  }
  if (opts.wait) return status(created.submissionId, bundle.dir, { ...opts, wait: true });
  if (opts.json) emitJson({ ...finalized, courseId: created.courseId, versionNo: created.versionNo, warnings: created.warnings });
}

export async function status(
  id: string | undefined,
  dir: string | undefined,
  opts: GlobalOptions & { wait?: boolean; timeout?: string },
) {
  const creds = await requireCredentials(opts);
  const submissionId = id ?? (await loadCourseState(dir ?? ".")).lastSubmissionId;
  if (!submissionId) throw new CliExit("No submission id given and none recorded in .coursmith.json.", 2);

  const deadline = Date.now() + Number(opts.timeout ?? 600) * 1000;
  let s: SubmissionStatus;
  for (;;) {
    s = await api<SubmissionStatus>(creds.apiUrl, "GET", `/api/v1/submissions/${submissionId}`, {
      token: creds.token,
    }).catch(rethrowApi);
    if (!opts.wait || !WAITING.has(s.status) || Date.now() > deadline) break;
    if (!opts.json) process.stdout.write(dim("."));
    await sleep(10_000);
  }
  if (opts.wait && !opts.json) process.stdout.write("\n");

  if (opts.json) {
    emitJson(s);
    return;
  }
  console.log(`${bold(s.title)} · version ${s.versionNo} · ${statusLabel(s.status)}`);
  if (s.review) {
    console.log(`\n${s.review.summary}\n`);
    printIssues(s.review.issues);
  }
  if (s.courseUrl) console.log(`\nLive at ${bold(s.courseUrl)}`);
}

function statusLabel(status: string): string {
  switch (status) {
    case "approved":
      return green("approved");
    case "needs_revision":
      return yellow("needs revision");
    case "rejected":
      return red("rejected");
    default:
      return status.replace("_", " ");
  }
}
