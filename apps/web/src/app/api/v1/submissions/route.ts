import { LIMITS } from "@coursmith/course-schema";
import { authenticateCli } from "@/lib/api/auth";
import { handle, json, readJson } from "@/lib/api/http";
import { createSubmission } from "@/lib/submissions";

export const POST = handle(async (request: Request) => {
  const caller = await authenticateCli(request);
  // course.json plus a small file manifest; asset bytes go straight to storage via signed URLs.
  const body = await readJson(request, LIMITS.courseJsonBytes + 64 * 1024);
  return json(await createSubmission(caller, body), 201);
});
