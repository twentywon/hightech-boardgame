import type { Random } from "../../core/random";

/**
 * World tour: a property game for two to four travellers. They circle a
 * board of cities, buy them, raise buildings in three steps and charge the
 * others for staying. Whoever is left with money, or is richest when the
 * last round ends, wins.
 */
/**
 * ship: a spacecraft that can be owned like a city but not built on;
 * fund: visitors pay into the peace fund; collect: the visitor takes the fund;
 * storm: the island; space: travel onward to any space.
 */
export type Kind = "start" | "city" | "ship" | "luck" | "collect" | "storm" | "fund" | "space";
export interface Space {
  kind: Kind;
  name: string;
  price: number;
  /** Colour group of a city: Asia, Middle East & Africa, Europe, the Americas & Oceania. */
  group: number;
  /** Two-letter code of the city's country, for its flag. */
  country: string;
}
const city = (name: string, price: number, group: number, country: string): Space => ({ kind: "city", name, price, group, country });
const special = (kind: Kind, name: string): Space => ({ kind, name, price: 0, group: -1, country: "" });
export const SPACES: Space[] = [
  special("start", "출발"),
  city("하노이", 60, 0, "VN"),
  special("luck", "황금열쇠"),
  city("방콕", 80, 0, "TH"),
  city("자카르타", 90, 0, "ID"),
  special("collect", "기금 수령"),
  city("싱가포르", 100, 0, "SG"),
  city("뭄바이", 110, 0, "IN"),
  city("두바이", 120, 1, "AE"),
  special("storm", "무인도"),
  city("이스탄불", 140, 1, "TR"),
  city("카이로", 150, 1, "EG"),
  special("luck", "황금열쇠"),
  city("나이로비", 160, 1, "KE"),
  city("케이프타운", 180, 1, "ZA"),
  city("아테네", 200, 2, "GR"),
  city("로마", 220, 2, "IT"),
  city("암스테르담", 230, 2, "NL"),
  special("fund", "인류평화기금"),
  city("바르셀로나", 240, 2, "ES"),
  city("파리", 260, 2, "FR"),
  special("luck", "황금열쇠"),
  city("런던", 280, 2, "GB"),
  city("베를린", 300, 2, "DE"),
  city("스톡홀름", 320, 2, "SE"),
  city("멕시코시티", 330, 3, "MX"),
  city("리마", 340, 3, "PE"),
  special("space", "우주여행"),
  city("뉴욕", 350, 3, "US"),
  { kind: "ship", name: "콜롬비아호", price: 400, group: -1, country: "" },
  special("luck", "황금열쇠"),
  city("리우", 360, 3, "BR"),
  city("부에노스아이레스", 380, 3, "AR"),
  city("시드니", 420, 3, "AU"),
  city("도쿄", 440, 0, "JP"),
  city("서울", 450, 0, "KR"),
];
/** Where the island that holds a traveller for a while lies. */
export const ISLAND = SPACES.findIndex((space) => space.kind === "storm");
export const START_MONEY = 2000,
  SALARY = 200,
  /** Paid into the peace fund by each visitor, and to the ship's owner for a stay or a journey. */
  FUND_FEE = 150,
  SHIP_TOLL = 200,
  TRAVEL_FEE = 200,
  /** Turns spent on the island, unless a double is rolled. */
  STORM_TURNS = 1,
  ROUNDS = 25,
  /** Names of what stands on a city: bare land, then the three buildings. */
  LEVELS = ["땅", "집", "빌딩", "랜드마크"];
/** Cost of raising a city to `level` (1–3), and the fee for staying at each level. */
export const buildCost = (space: Space, level: number) => Math.round((space.price * [0, 0.5, 0.8, 1.2][level]) / 10) * 10;
export const feeOf = (space: Space, level: number) => Math.round((space.price * [0.2, 0.6, 1.3, 2.5][level]) / 10) * 10;
export interface Luck {
  text: string;
  money?: number;
  /** Move to this space (collecting the salary when passing the start). */
  to?: number;
  step?: number;
  /** Pay this for each building owned. */
  repairs?: number;
  /** Collect this from every other traveller. */
  gift?: number;
}
export const LUCK: Luck[] = [
  { text: "여행 복권에 당첨되었습니다.", money: 150 },
  { text: "여행 사진 공모전에서 입상했습니다.", money: 80 },
  { text: "항공 마일리지를 환급받았습니다.", money: 50 },
  { text: "여권을 다시 발급받았습니다.", money: -60 },
  { text: "기념품을 너무 많이 샀습니다.", money: -80 },
  { text: "짐이 다른 공항으로 갔습니다. 새 옷을 삽니다.", money: -40 },
  { text: "출발 칸으로 돌아가 월급을 받습니다.", to: 0 },
  { text: "배가 떠내려갔습니다. 무인도로 갑니다.", to: ISLAND },
  { text: "지름길을 찾았습니다. 세 칸 앞으로 갑니다.", step: 3 },
  { text: "길을 잘못 들었습니다. 두 칸 뒤로 갑니다.", step: -2 },
  { text: "건물을 수리합니다. 건물 하나에 30씩 냅니다.", repairs: 30 },
  { text: "생일입니다. 다른 여행자에게서 50씩 받습니다.", gift: 50 },
];
export interface Player {
  money: number;
  at: number;
  /** Turns still to sit out in the storm. */
  wait: number;
  out: boolean;
}
/**
 * "key": a golden key card waits to be drawn; "card": it has been drawn and
 * waits to be read; "travel": a destination is to be chosen for space travel.
 */
export type Phase = "roll" | "key" | "card" | "travel" | "buy" | "build" | "over";
export interface State {
  players: Player[];
  /** Owner of each space, or -1, and the building level on it (0–3). */
  owners: number[];
  levels: number[];
  turn: number;
  phase: Phase;
  round: number;
  dice: [number, number];
  /** Squares the mover walked on the last roll, then any place it was sent to. */
  path: number[];
  rollId: number;
  /** What happened on the last step, for the status line, and whose step it was. */
  note: string;
  actor: number;
  /** Doubles the traveller to move has rolled in a row. */
  doubles: number;
  /** The golden key card drawn and not yet carried out (index into `LUCK`), or -1. */
  card: number;
  /** Money waiting in the peace fund. */
  fund: number;
  /** Winner once the game is over; several when they are level. */
  winners: number[];
}
export function createGame(players: number): State {
  const n = Math.max(2, Math.min(4, players));
  return {
    players: Array.from({ length: n }, () => ({ money: START_MONEY, at: 0, wait: 0, out: false })),
    owners: SPACES.map(() => -1),
    levels: SPACES.map(() => 0),
    turn: 0,
    phase: "roll",
    round: 1,
    dice: [1, 1],
    path: [],
    rollId: 0,
    note: "",
    actor: 0,
    doubles: 0,
    card: -1,
    fund: 0,
    winners: [],
  };
}
/** Cash plus half of what was spent on land and buildings. */
export function worth(state: State, player: number) {
  let invested = 0;
  state.owners.forEach((owner, i) => {
    if (owner !== player) return;
    invested += SPACES[i].price;
    for (let level = 1; level <= state.levels[i]; level++) invested += buildCost(SPACES[i], level);
  });
  return state.players[player].money + Math.round(invested / 2);
}
const clone = (state: State): State => ({
  ...state,
  players: state.players.map((p) => ({ ...p })),
  owners: state.owners.slice(),
  levels: state.levels.slice(),
});
/** Takes `amount` from a player; cities are sold back at half price to cover it, else the player is out. */
function charge(s: State, player: number, amount: number) {
  const p = s.players[player];
  p.money -= amount;
  while (p.money < 0) {
    const owned = s.owners.flatMap((owner, i) => (owner === player ? [i] : []));
    if (!owned.length) break;
    // The least valuable holding goes first.
    const value = (i: number) => {
      let total = SPACES[i].price;
      for (let level = 1; level <= s.levels[i]; level++) total += buildCost(SPACES[i], level);
      return total;
    };
    const sold = owned.sort((a, b) => value(a) - value(b))[0];
    p.money += Math.round(value(sold) / 2);
    s.owners[sold] = -1;
    s.levels[sold] = 0;
    s.note += ` ${SPACES[sold].name}을(를) 팔았습니다.`;
  }
  if (p.money < 0) {
    const paid = amount + p.money;
    p.money = 0;
    p.out = true;
    s.note += " 파산했습니다.";
    return paid;
  }
  return amount;
}
function walk(s: State, player: number, steps: number) {
  const p = s.players[player];
  for (let i = 0; i < Math.abs(steps); i++) {
    p.at = (p.at + Math.sign(steps) + SPACES.length) % SPACES.length;
    s.path.push(p.at);
    if (p.at === 0 && steps > 0) p.money += SALARY;
  }
}
/** Ends the turn: the next traveller still in the game rolls, or the game is counted. */
function pass(s: State, again: boolean) {
  const alive = s.players.flatMap((p, i) => (p.out ? [] : [i]));
  if (alive.length <= 1) return finish(s, alive);
  if (!again || s.players[s.turn].out) {
    let next = s.turn;
    do {
      next = (next + 1) % s.players.length;
      if (next === 0) s.round++;
    } while (s.players[next].out);
    s.turn = next;
    s.doubles = 0;
    if (s.round > ROUNDS) {
      const best = Math.max(...alive.map((i) => worth(s, i)));
      return finish(s, alive.filter((i) => worth(s, i) === best));
    }
  }
  s.phase = "roll";
  return s;
}
function finish(s: State, winners: number[]) {
  s.phase = "over";
  s.winners = winners;
  return s;
}
/** What the space a traveller stands on does. Returns true when a decision is pending. */
function arrive(s: State): boolean {
  const me = s.turn,
    p = s.players[me],
    space = SPACES[p.at];
  if (space.kind === "city" || space.kind === "ship") {
    const owner = s.owners[p.at];
    if (owner === -1) {
      if (p.money >= space.price) {
        s.phase = "buy";
        return true;
      }
      s.note += ` ${space.name}을(를) 살 돈이 모자랍니다.`;
    } else if (owner === me) {
      const level = s.levels[p.at];
      if (space.kind === "city" && level < 3 && p.money >= buildCost(space, level + 1)) {
        s.phase = "build";
        return true;
      }
    } else {
      const fee = space.kind === "ship" ? SHIP_TOLL : feeOf(space, s.levels[p.at]),
        paid = charge(s, me, fee);
      s.players[owner].money += paid;
      s.note += ` ${space.name}의 ${space.kind === "ship" ? "통행료" : "숙박료"} ${paid}을(를) 냈습니다.`;
    }
  } else if (space.kind === "fund") {
    const paid = charge(s, me, FUND_FEE);
    s.fund += paid;
    s.note += ` 인류평화기금에 ${paid}을(를) 냈습니다 (모인 돈 ${s.fund}).`;
  } else if (space.kind === "collect") {
    s.note += s.fund ? ` 인류평화기금 ${s.fund}을(를) 받았습니다.` : " 모인 기금이 없습니다.";
    p.money += s.fund;
    s.fund = 0;
  } else if (space.kind === "storm") {
    p.wait = STORM_TURNS;
    s.note += " 무인도에 갇혔습니다.";
  } else if (space.kind === "space") {
    // The destination is chosen by hand: the turn waits for it.
    s.phase = "travel";
    s.note += " 우주여행 칸에 섰습니다.";
    return true;
  } else if (space.kind === "luck") {
    // The card is drawn by hand: the turn waits for it.
    s.phase = "key";
    s.note += " 황금열쇠 칸에 섰습니다.";
    return true;
  }
  return false;
}
/** Rolls the two dice for the traveller to move and plays out the space reached. */
export function roll(state: State, random: Random): State | null {
  if (state.phase !== "roll") return null;
  const s = clone(state),
    me = s.turn,
    p = s.players[me];
  s.rollId++;
  s.path = [];
  s.note = "";
  s.actor = me;
  s.dice = [1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)];
  const double = s.dice[0] === s.dice[1];
  s.note = `${s.dice[0]}와 ${s.dice[1]}이(가) 나왔습니다.`;
  if (p.wait > 0) {
    // On the island a double gets the traveller off at once; otherwise the turn is spent there.
    if (!double) {
      p.wait--;
      s.note += " 무인도에서 한 차례 쉽니다.";
      return pass(s, false);
    }
    p.wait = 0;
    s.doubles = 0;
    s.note += " 더블! 무인도를 탈출합니다.";
    walk(s, me, s.dice[0] + s.dice[1]);
    return arrive(s) ? s : pass(s, false);
  }
  s.doubles = double ? s.doubles + 1 : 0;
  // A third double in a row sends the traveller straight to the island.
  if (s.doubles >= 3) {
    p.at = ISLAND;
    p.wait = STORM_TURNS;
    s.path = [ISLAND];
    s.note += ` 같은 눈이 세 번 이어져 무인도로 갑니다.`;
    return pass(s, false);
  }
  walk(s, me, s.dice[0] + s.dice[1]);
  if (arrive(s)) return s;
  // A double rolls again, unless the traveller is held on the island.
  return pass(s, double && p.wait === 0);
}
/** Where a computer traveller flies: the dearest free place it can afford, else a city of its own to build on, else the start. */
export function destination(state: State) {
  const me = state.turn,
    money = state.players[me].money - TRAVEL_FEE;
  let best = 0,
    top = 0;
  SPACES.forEach((space, i) => {
    if (i === state.players[me].at || (space.kind !== "city" && space.kind !== "ship")) return;
    const owner = state.owners[i],
      value =
        owner === -1 && money - space.price >= 250
          ? space.price + 1000
          : owner === me && space.kind === "city" && state.levels[i] < 3 && money - buildCost(space, state.levels[i] + 1) >= 400
            ? space.price
            : 0;
    if (value > top) {
      top = value;
      best = i;
    }
  });
  return best;
}
/**
 * Space travel: onward to any other space. The owner of the ship is paid for
 * the journey, and passing the start pays the salary.
 */
export function travel(state: State, to: number): State | null {
  const here = state.players[state.turn].at;
  if (state.phase !== "travel" || !Number.isInteger(to) || to < 0 || to >= SPACES.length || to === here) return null;
  const s = clone(state),
    me = s.turn,
    p = s.players[me],
    ship = SPACES.findIndex((space) => space.kind === "ship"),
    owner = s.owners[ship];
  s.actor = me;
  s.rollId++;
  s.path = [];
  s.phase = "roll";
  s.note = `${SPACES[to].name}(으)로 우주여행을 떠납니다.`;
  if (owner >= 0 && owner !== me) {
    const paid = charge(s, me, TRAVEL_FEE);
    s.players[owner].money += paid;
    s.note += ` ${SPACES[ship].name} 주인에게 ${paid}을(를) 냈습니다.`;
    if (p.out) return pass(s, false);
  }
  // Going forward: a destination behind lies past the start.
  if (to < here) p.money += SALARY;
  p.at = to;
  s.path.push(to);
  if (arrive(s)) return s;
  return pass(s, s.doubles > 0 && p.wait === 0);
}
/** Draws the golden key card that waits on the pile; it is read before it takes effect. */
export function draw(state: State, random: Random): State | null {
  if (state.phase !== "key") return null;
  const s = clone(state);
  s.card = Math.floor(random() * LUCK.length);
  s.phase = "card";
  s.actor = s.turn;
  s.note = `황금열쇠: ${LUCK[s.card].text}`;
  return s;
}
/** Carries out the golden key card that was drawn. */
export function follow(state: State): State | null {
  if (state.phase !== "card" || state.card < 0) return null;
  const s = clone(state),
    me = s.turn,
    p = s.players[me],
    card = LUCK[s.card];
  s.card = -1;
  s.path = [];
  s.rollId++;
  s.actor = me;
  s.note = `황금열쇠: ${card.text}`;
  s.phase = "roll";
  if (card.money) {
    if (card.money > 0) p.money += card.money;
    else charge(s, me, -card.money);
  }
  if (card.repairs) charge(s, me, card.repairs * s.levels.reduce((n, level, i) => n + (s.owners[i] === me ? level : 0), 0));
  if (card.gift)
    s.players.forEach((other, i) => {
      if (i !== me && !other.out) p.money += charge(s, i, card.gift!);
    });
  let pending = false;
  if (card.to !== undefined) {
    if (card.to === 0) p.money += SALARY;
    p.at = card.to;
    s.path.push(card.to);
    if (card.to !== 0) pending = arrive(s);
  }
  if (card.step) {
    walk(s, me, card.step);
    pending = arrive(s);
  }
  if (pending) return s;
  return pass(s, s.doubles > 0 && p.wait === 0);
}
/** Answers the pending offer to buy the city or to build on it. */
export function decide(state: State, yes: boolean): State | null {
  if (state.phase !== "buy" && state.phase !== "build") return null;
  const s = clone(state),
    me = s.turn,
    p = s.players[me],
    space = SPACES[p.at];
  s.actor = me;
  if (yes && s.phase === "buy") {
    p.money -= space.price;
    s.owners[p.at] = me;
    s.note = `${space.name}을(를) ${space.price}에 샀습니다.`;
  } else if (yes) {
    const level = s.levels[p.at] + 1;
    p.money -= buildCost(space, level);
    s.levels[p.at] = level;
    s.note = `${space.name}에 ${LEVELS[level]}을(를) 지었습니다.`;
  } else s.note = `${space.name}을(를) 지나칩니다.`;
  // Only a double rolled in the open earns another roll, not one that freed the traveller from the island.
  return pass(s, s.doubles > 0);
}
/** A computer traveller buys and builds while it keeps a reserve for fees. */
export function wants(state: State) {
  const p = state.players[state.turn],
    space = SPACES[p.at],
    cost = state.phase === "buy" ? space.price : buildCost(space, state.levels[p.at] + 1);
  return p.money - cost >= (state.phase === "buy" ? 250 : 400);
}
