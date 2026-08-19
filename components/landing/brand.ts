/**
 * Shared brand constants for the public landing surface.
 *
 * These live in one module so the nav, the footer, the contact card and the
 * legal copy cannot drift apart — a wrong support address in a footer nobody
 * re-reads is exactly the kind of rot a single source prevents.
 */

export const VERSION = "v1.2.0-core";
export const CONTACT = "contact@itquest.org";
export const TAGLINE = "Interactive IT Infrastructure Education Platform";

/**
 * Public path to the official logo (served from /public). The file is a
 * transparent-background PNG, so it composites cleanly on the dark ground
 * without a card behind it.
 */
export const LOGO_SRC = "/itquest-logo.png";
/** Square source art — width and height are equal, so callers pass one number. */
export const LOGO_INTRINSIC = 500;
export const LOGO_ALT = "IT Quest Official Logo";

export type LegalDoc = "privacy" | "terms";
