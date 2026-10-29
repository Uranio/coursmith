import { checkClient } from "@/lib/api/auth";
import { ApiError, handle, json, readJson } from "@/lib/api/http";
import { startDeviceAuthorization } from "@/lib/device";

export const POST = handle(async (request: Request) => {
  const clientVersion = checkClient(request);
  const body = (await readJson(request, 4_096)) as { clientName?: unknown };
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim().slice(0, 80) : "";
  if (!clientName) throw new ApiError(400, "invalid_request", "clientName is required.");
  return json(await startDeviceAuthorization(clientName, clientVersion), 201);
});
