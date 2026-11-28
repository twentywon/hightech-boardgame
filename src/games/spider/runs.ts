import type { State } from "./rules";

/**
 * The runs completed between `before` and `after`, each with the column it was finished in and its cards from the
 * king down. A run is finished where its king lay: a king is never moved onto a run (only into an empty column,
 * where it would already have been complete).
 */
export function completed(before: State, after: State) {
  if (after.done.length <= before.done.length) return [];
  const remaining = new Set(after.columns.flatMap((c) => c.map((card) => card.id))),
    dealt = before.stock.slice(after.stock.length).map((c) => ({ ...c, up: true })),
    gone = [...before.columns.flat(), ...dealt].filter((c) => !remaining.has(c.id)),
    kings = gone.filter((c) => c.rank === 13);
  return kings.flatMap((king) => {
    const column = before.columns.findIndex((cards) => cards.some((c) => c.id === king.id));
    if (column < 0) return [];
    const cards = before.columns[column],
      own = cards.slice(cards.findIndex((c) => c.id === king.id)).filter((c) => !remaining.has(c.id)),
      ids = new Set(own.map((c) => c.id)),
      // A single run takes whatever else went; two at once can only come of a deal, one card a column.
      rest = kings.length === 1 ? gone.filter((c) => !ids.has(c.id)) : [before.stock[before.stock.length - 1 - column]].filter((c) => c && !remaining.has(c.id)).map((c) => ({ ...c, up: true })),
      run = [...own, ...rest].sort((a, b) => b.rank - a.rank).slice(0, 13);
    return [{ column, cards: run, wasUp: new Map(cards.map((c) => [c.id, c.up])) }];
  });
}
