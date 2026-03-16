import { runReview } from "./core/review-orchestrator";

runReview().catch((err) => {
  console.error("Review failed (non-blocking):", err instanceof Error ? err.message : String(err));
  process.exit(0);
});
