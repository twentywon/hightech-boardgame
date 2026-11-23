/**
 * Cards out of a device's sight over one Wi-Fi (와이파이 여럿이, `src/net/hidden.ts`): the card games (one card, old
 * maid, go-stop) show each device a view in which every card its seat may not see (another's hand, the pile) is a
 * blind card, `BLIND + masks[id]`, that has a back on both faces. `masks` is a random order of the pack laid with the
 * room's game (`masksFor`), so a blind card says nothing of the card it stands for, and it keeps its number as it
 * goes from the pile to a hand or from hand to hand, so that the table can fly it as before.
 *
 * A view also carries `blinds` (`aliases`): the blind number of each card in sight. When a card comes into sight (a
 * card played, a card drawn into my hand) or goes out of it (a card of mine drawn by another), `unveil` starts the
 * one where the other was, so that it flies from there instead of coming out of nothing.
 */
export const BLIND = 100;
export const isBlind = (id: number) => id >= BLIND;
/** The blind number of each card, in a random order of the pack's `count` cards. */
export function masksFor(count: number, random: () => number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}
/** Card `id` as a seat that may not see it is shown it. */
export const blindOf = (masks: readonly number[], id: number) => BLIND + masks[id];
/** The card a blind number stands for (a card in sight is itself). */
export const realOf = (masks: readonly number[], id: number) => (isBlind(id) ? masks.indexOf(id - BLIND) : id);
/** The blind number of each card in sight. */
export function aliases(masks: readonly number[], seen: Iterable<number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of seen) if (!isBlind(id) && masks[id] !== undefined) out[id] = blindOf(masks, id);
  return out;
}
/** The blind numbers of `masks` dealt out again among `ids` (cards turned over into a new pile, out of everyone's sight). */
export function remask(masks: readonly number[], ids: readonly number[], random: () => number): number[] {
  const out = [...masks],
    order = masksFor(ids.length, random);
  ids.forEach((id, i) => (out[id] = masks[ids[order[i]]]));
  return out;
}
/**
 * Between two layouts of a view (`from` before a move, `to` after it): a card that comes into sight starts where its
 * blind card was, and a blind card that comes in starts where the card it was shown as was in sight. `before` and
 * `after` are the two views' `blinds`. `from` is changed in place.
 */
export function unveil<P>(from: Map<number, P>, to: Map<number, P>, before: Record<number, number> | undefined, after: Record<number, number> | undefined) {
  const was = new Map<number, number>();
  for (const [id, b] of Object.entries(before ?? {})) was.set(b, Number(id));
  for (const id of [...to.keys()]) {
    if (from.has(id)) continue;
    const other = isBlind(id) ? was.get(id) : after?.[id];
    if (other === undefined) continue;
    const pose = from.get(other);
    if (pose && !to.has(other)) from.set(id, pose);
  }
}
