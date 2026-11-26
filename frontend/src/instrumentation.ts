export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { aokConfig } = await import("./server/platform/aok");
    if (aokConfig()) return;
    if (process.env.NEXT_PUBLIC_USE_MOCKS === "true") return;
    const { initialize } = await import("./server/platform/initialize");
    await initialize();
    const { startJobs } = await import("./server/platform/jobs");
    startJobs();
  }
}
