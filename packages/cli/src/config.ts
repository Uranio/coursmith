import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** The public portal. Override with --api-url or COURSMITH_API_URL (e.g. http://localhost:3000 in development). */
export const DEFAULT_API_URL = "https://coursmith.onrender.com";

export function configDir(): string {
  if (process.env.COURSMITH_CONFIG_DIR) return process.env.COURSMITH_CONFIG_DIR;
  if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "coursmith");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "coursmith");
}

export interface Credentials {
  apiUrl: string;
  token: string;
  username: string;
}

export interface PendingLogin {
  apiUrl: string;
  deviceCode: string;
  userCode: string;
  verificationUriComplete: string;
  interval: number;
  expiresAt: string;
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writePrivate(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

const credentialsPath = () => join(configDir(), "credentials.json");
const pendingPath = () => join(configDir(), "pending-login.json");

export const loadCredentials = () => readJsonFile<Credentials>(credentialsPath());
export const saveCredentials = (c: Credentials) => writePrivate(credentialsPath(), c);
export const clearCredentials = () => rm(credentialsPath(), { force: true });

export const loadPendingLogin = () => readJsonFile<PendingLogin>(pendingPath());
export const savePendingLogin = (p: PendingLogin) => writePrivate(pendingPath(), p);
export const clearPendingLogin = () => rm(pendingPath(), { force: true });

/** --api-url beats COURSMITH_API_URL beats the URL saved at login beats the default. */
export function resolveApiUrl(flag: string | undefined, saved?: string): string {
  return (flag || process.env.COURSMITH_API_URL || saved || DEFAULT_API_URL).replace(/\/+$/, "");
}

/** Per-course state kept next to course.json, so later submissions update the same course. */
export interface CourseState {
  courseId?: string;
  lastSubmissionId?: string;
}

export const COURSE_STATE_FILE = ".coursmith.json";
export const loadCourseState = async (dir: string) => (await readJsonFile<CourseState>(join(dir, COURSE_STATE_FILE))) ?? {};
export const saveCourseState = (dir: string, s: CourseState) =>
  writeFile(join(dir, COURSE_STATE_FILE), `${JSON.stringify(s, null, 2)}\n`);
