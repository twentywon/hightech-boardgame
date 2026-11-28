/**
 * The particle after a word: `after` when the word ends in a final consonant, `otherwise` after a vowel
 * (을/를, 이/가, 은/는, 과/와). A number is judged as it is read (일, 이, 삼, … 십, 백, 천): 0, 1, 3, 6, 7, 8 end in a
 * consonant. Anything else (Latin letters, signs) takes `after`, the safer reading.
 */
export function josa(word: string | number, after: string, otherwise: string): string {
  const last = String(word).trim().slice(-1);
  if (/\d/.test(last)) return "013678".includes(last) ? after : otherwise;
  const code = last.charCodeAt(0) - 0xac00;
  if (code < 0 || code >= 11172) return after;
  return code % 28 ? after : otherwise;
}
