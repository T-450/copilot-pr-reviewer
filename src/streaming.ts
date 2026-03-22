import type { SessionEvent } from "@github/copilot-sdk";

/**
 * Create a streaming event handler that writes real-time progress to stdout.
 *
 * Attach to a session via `session.on(createStreamingHandler())` to show a
 * dot-per-delta progress indicator during long-running model calls.
 */
export function createStreamingHandler(): (event: SessionEvent) => void {
	return (event) => {
		switch (event.type) {
			case "assistant.message_delta":
				process.stdout.write(".");
				break;
			case "assistant.message":
				process.stdout.write("\n");
				break;
			case "session.error":
				console.error(
					`  [stream error] ${(event as { data: { message: string } }).data.message}`,
				);
				break;
			case "session.idle":
				break;
		}
	};
}
