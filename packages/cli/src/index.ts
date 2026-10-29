#!/usr/bin/env node
import { Command } from "commander";
import { CLI_VERSION } from "./api.js";
import {
  CliExit,
  installSkillCommand,
  login,
  logout,
  status,
  submit,
  validate,
  whoami,
  type GlobalOptions,
} from "./commands.js";
import { emitJson, red } from "./output.js";

const program = new Command()
  .name("coursmith")
  .description("Create and publish interactive courses on Coursmith from your AI agent.")
  .version(CLI_VERSION)
  .option("--json", "print a single JSON document (for agents)")
  .option("--api-url <url>", "portal URL (default: COURSMITH_API_URL or the saved login)");

const globals = () => program.opts<GlobalOptions>();

program
  .command("login")
  .description("connect this machine to your Coursmith account (opens the browser)")
  .option("--no-browser", "print the link instead of opening the browser")
  .option("--no-wait", "start the login and exit; finish with `coursmith login --resume`")
  .option("--resume", "wait for a login started with --no-wait")
  .action((o) => login({ ...globals(), ...o }));

program.command("logout").description("revoke and forget the saved token").action(() => logout(globals()));

program.command("whoami").description("show the logged-in account").action(() => whoami(globals()));

program
  .command("install-skill")
  .description("install the Coursmith skill into your agent's skills folder")
  .option("--agent <agent>", "claude, codex, cursor, opencode or all", "all")
  .option("--project", "install into the current project instead of your home folder")
  .option("--dir <path>", "install into <path>/coursmith-course instead of the agent's folder")
  .action((o) => installSkillCommand({ ...globals(), ...o }));

program
  .command("validate [dir]")
  .description("check course.json and its assets offline, with the same rules as the portal")
  .action(async (dir) => {
    await validate(dir, globals());
  });

program
  .command("submit [dir]")
  .description("validate, upload and submit the course for review")
  .option("--wait", "wait for the review decision")
  .option("--timeout <seconds>", "maximum wait with --wait", "600")
  .action((dir, o) => submit(dir, { ...globals(), ...o }));

program
  .command("status [submissionId]")
  .description("show the review status (defaults to the last submission of the course in --dir)")
  .option("--dir <dir>", "course folder holding .coursmith.json", ".")
  .option("--wait", "wait until the review is finished")
  .option("--timeout <seconds>", "maximum wait with --wait", "600")
  .action((id, o) => status(id, o.dir, { ...globals(), ...o }));

try {
  await program.parseAsync();
} catch (err) {
  if (err instanceof CliExit) {
    if (err.message) {
      if (globals().json) emitJson({ error: err.data?.error ?? "error", message: err.message, ...err.data });
      else console.error(red(err.message));
    }
    process.exitCode = err.exitCode;
  } else {
    console.error(err);
    process.exitCode = 1;
  }
}
