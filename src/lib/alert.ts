/*
  AI-failure reporting for the creator page routes.

  The source repo emailed the owner (throttled through a Blob-backed state
  file). FlowyCash has no Blob store and no ops mailbox for this, so the
  smallest equivalent is a structured log line that shows up in Vercel's
  runtime logs. Never throws — callers run it from catch blocks.
*/
export async function reportAiFailure(tool: string, err: unknown): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  const credit = /credit balance|billing|purchase credits/i.test(msg);
  console.error(
    `[ai-failure] tool=${JSON.stringify(tool)} kind=${credit ? "credit" : "error"} message=${JSON.stringify(msg)}`,
  );
}
