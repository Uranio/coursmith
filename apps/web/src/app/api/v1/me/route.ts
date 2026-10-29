import { authenticateCli } from "@/lib/api/auth";
import { handle, json } from "@/lib/api/http";

export const GET = handle(async (request: Request) => {
  const caller = await authenticateCli(request);
  return json({ id: caller.userId, username: caller.username, displayName: caller.displayName });
});
