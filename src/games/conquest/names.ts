import type { Random } from "../../core/random";

/**
 * Names for the places of a generated world, made from our own syllables: never a real place and never a name of
 * the product this game resembles. A territory is a word for its look or a made-up root, then a word for the land
 * (붉은사막, 서리숲, 가린곶); a continent is a root and 대륙.
 */
const LOOKS = ["붉은", "푸른", "검은", "하얀", "잿빛", "은빛", "금빛", "높은", "깊은", "마른", "너른", "젖은", "찬", "긴"],
  THINGS = ["바람", "안개", "서리", "노을", "별빛", "달빛", "모래", "이끼", "갈대", "소금", "바위", "가시", "구름", "얼음", "버들", "억새", "여우", "늑대", "사슴", "고래", "수달", "매화", "솔잎", "까치"],
  FIRST = ["가", "나", "다", "로", "마", "벼", "소", "아", "자", "하", "미", "누", "루", "비", "시", "온", "윤", "휘", "슬", "예", "유", "채", "도", "보", "라"],
  SECOND = ["린", "온", "솔", "루", "별", "결", "담", "란", "름", "빈", "샘", "율", "휘", "늘", "든", "새", "랑", "울", "엘", "젠", "솜", "벨"],
  // Words for the land, one syllable or two. A one-syllable word never follows a direction (남원, 서산 are real).
  LANDS = ["령", "곶", "벌", "골", "숲", "들", "섬", "봉", "곡", "고원", "평원", "사막", "늪", "협곡", "반도", "산맥", "해안", "분지", "호수", "언덕", "계곡", "초원", "설원", "습지", "여울", "모루"];
/** Made-up roots that happen to be real names, or read badly, are passed over. */
const AVOID = new Set(["미아", "소라", "보라", "하나", "아라", "자라", "도라", "나라", "마라", "가라", "다라", "사라"]);
const pick = <T>(list: readonly T[], random: Random) => list[Math.floor(random() * list.length) % list.length];
function root(random: Random) {
  for (let tries = 0; ; tries++) {
    const word = pick(FIRST, random) + pick(SECOND, random);
    if (!AVOID.has(word) || tries > 20) return word;
  }
}
/** A territory's name, not among `taken`. */
export function territoryName(random: Random, taken: Set<string>) {
  for (let tries = 0; ; tries++) {
    const kind = random(),
      land = pick(LANDS, random),
      word = kind < 0.3 ? pick(LOOKS, random) + land : kind < 0.62 ? pick(THINGS, random) + land : root(random) + land,
      // A generator that keeps giving the same draws (a test's) still ends: the name is then numbered.
      name = tries > 200 ? `${word}${tries}` : word;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
}
/** A continent's name, not among `taken`. */
export function continentName(random: Random, taken: Set<string>) {
  for (let tries = 0; ; tries++) {
    const name = `${random() < 0.5 ? root(random) : pick(THINGS, random)}${tries > 200 ? tries : ""} 대륙`;
    if (!taken.has(name)) {
      taken.add(name);
      return name;
    }
  }
}
