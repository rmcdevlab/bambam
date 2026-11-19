export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PUBLIC_USE_MOCKS !== "true") {
    const { initialize } = await import("./server/platform/initialize");
    await initialize();
    const { startJobs } = await import("./server/platform/jobs");
    startJobs();
  }
}
