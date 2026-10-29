import { checkClient } from "@/lib/api/auth";
import { ApiError, handle, json, readJson } from "@/lib/api/http";
import { pollDeviceAuthorization } from "@/lib/device";

export const POST = handle(async (request: Request) => {
  checkClient(request);
  const body = (await readJson(request, 4_096)) as { deviceCode?: unknown };
  if (typeof body?.deviceCode !== "string") throw new ApiError(400, "invalid_request", "deviceCode is required.");
  return json(await pollDeviceAuthorization(body.deviceCode));
});
