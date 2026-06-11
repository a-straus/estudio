import type { JobQueue } from "./queue.js";

/**
 * Trivial demo handler: echoes its payload; throws when payload.fail is set.
 * Exists to exercise the queue end-to-end until real job types land.
 */
export function registerDemoHandler(queue: JobQueue): void {
  queue.register("demo", (payload) => {
    if (
      payload !== null &&
      typeof payload === "object" &&
      "fail" in payload &&
      payload.fail
    ) {
      throw new Error("demo job failed as requested");
    }
    return { echoed: payload };
  });
}
