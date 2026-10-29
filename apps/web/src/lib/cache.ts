import "server-only";
import { revalidateTag } from "next/cache";

/** Marks catalog data stale after publishing, removals or new reviews. */
export function invalidateCatalog(): void {
  try {
    revalidateTag("catalog", "max");
  } catch {
    // Outside a request (scripts, tests) there is no cache to invalidate.
  }
}
