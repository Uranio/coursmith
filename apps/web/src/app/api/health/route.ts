/** Liveness probe for the hosting platform; does not touch the database. */
export function GET() {
  return Response.json({ ok: true });
}
