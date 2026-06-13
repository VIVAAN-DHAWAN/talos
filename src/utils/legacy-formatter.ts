// Intentional Dark Matter: an entire "dead" module.
// Not referenced by src/server.ts or any entry point.

export function formatLegacy(input: string): string {
  return `[legacy] ${input.trim().toUpperCase()}`;
}
