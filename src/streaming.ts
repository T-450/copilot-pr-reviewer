import type { SessionEvent } from "@github/copilot-sdk";

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
