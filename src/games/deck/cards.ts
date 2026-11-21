/**
 * A pack of 52 cards and two jokers, as the card games of the plain-deck
 * table share it. Card `id` 0–51 is suit `floor(id / 13)` (♠ ♥ ♦ ♣) and
 * rank `id % 13 + 1` (1 the ace, 11–13 jack, queen, king); 52 is the black
 * joker and 53 the coloured one. Free of Vite-only imports, so browser tests
 * can use it.
 */
export const SUITS = ["S", "H", "D", "C"] as const,
  SUIT_GLYPH = ["♠", "♥", "◆", "♣"],
  SUIT_NAME = ["스페이드", "하트", "다이아몬드", "클로버"],
  BLACK_JOKER = 52,
  COLOUR_JOKER = 53;
export const isJoker = (id: number) => id >= 52;
export const suitOf = (id: number) => (isJoker(id) ? -1 : Math.floor(id / 13));
export const rankOf = (id: number) => (isJoker(id) ? 0 : (id % 13) + 1);
export const red = (id: number) => (id === COLOUR_JOKER ? true : id === BLACK_JOKER ? false : suitOf(id) === 1 || suitOf(id) === 2);
const RANK = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
/** The name of a face picture: rank then suit letter ("10D", "AS"). */
export const faceKey = (id: number) => `${RANK[rankOf(id)]}${SUITS[suitOf(id)]}`;
/** A card's name as read aloud. */
export const cardName = (id: number) => (id === BLACK_JOKER ? "흑백 조커" : id === COLOUR_JOKER ? "컬러 조커" : `${SUIT_NAME[suitOf(id)]} ${RANK[rankOf(id)]}`);
export function shuffle(ids: number[], random: () => number) {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/** A card's size on the table. */
export const CARD_W = 0.72,
  CARD_H = 1.08;
