/**
 * ReviewMode selects the prompt template variant used for a review session.
 *
 * Currently only "quick-pass" exists — the default severity-threshold review.
 * Adding a new mode (e.g. "deep" or "security-focused") is a matter of
 * extending this union and handling the new variant in each render* function
 * inside templates.ts.
 */
export type ReviewMode = "quick-pass";

/**
 * Resolve the effective review mode from configuration.
 * Today this always returns "quick-pass"; future config fields
 * (e.g. `reviewMode`) would be read here.
 */
export function resolveReviewMode(): ReviewMode {
	return "quick-pass";
}
