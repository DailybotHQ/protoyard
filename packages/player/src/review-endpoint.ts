/**
 * The comments API `protoyard quick serve` hosts on its own origin
 * (`/api/comments/<namespace>`). Fixed here, never taken from a URL or a
 * response, so nothing can point the player's comments at another server.
 * Its own module so the app and kind boots share it without importing each other.
 */
export const QUICK_REVIEW_ENDPOINT = '/api/comments';
