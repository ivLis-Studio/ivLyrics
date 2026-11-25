// Spotify and the mobile WebViews supply their own playback and browser services.
export const motionHost = typeof window !== "undefined" ? window : globalThis;
