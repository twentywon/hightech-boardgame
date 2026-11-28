// Pictures of each game's table, captured from the game itself
// (scripts/capture-thumbs.mjs) and inlined so the collection needs no request.
const sources = import.meta.glob<string>("../assets/thumbs/*.webp", { query: "?inline", import: "default", eager: true });
/** The picture for a game id, or undefined when there is none. */
export const thumb = (id: string): string | undefined => sources[`../assets/thumbs/${id}.webp`];
