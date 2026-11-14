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
// Forty spaces, ten to a side: the corners are 0, 10, 20 and 30.
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
  city("라고스", 130, 1, "NG"),
  special("storm", "무인도"),
  city("이스탄불", 140, 1, "TR"),
  city("카이로", 150, 1, "EG"),
  special("luck", "황금열쇠"),
  city("나이로비", 160, 1, "KE"),
  city("케이프타운", 180, 1, "ZA"),
  city("아테네", 200, 2, "GR"),
  city("로마", 220, 2, "IT"),
  city("암스테르담", 230, 2, "NL"),
  city("빈", 235, 2, "AT"),
  special("fund", "인류평화기금"),
  city("바르셀로나", 240, 2, "ES"),
  city("파리", 260, 2, "FR"),
  special("luck", "황금열쇠"),
  city("런던", 280, 2, "GB"),
  city("베를린", 300, 2, "DE"),
  city("스톡홀름", 320, 2, "SE"),
  city("바르샤바", 325, 2, "PL"),
  city("멕시코시티", 330, 3, "MX"),
  city("리마", 340, 3, "PE"),
  special("space", "우주여행"),
  city("뉴욕", 350, 3, "US"),
  { kind: "ship", name: "콜롬비아호", price: 400, group: -1, country: "" },
  special("luck", "황금열쇠"),
  city("리우", 360, 3, "BR"),
  city("부에노스아이레스", 380, 3, "AR"),
  city("토론토", 400, 3, "CA"),
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
/** What a place with `level` buildings has cost: the land and every building up to that level. */
export const outlay = (space: Space, level: number) => {
  let total = space.price;
  for (let l = 1; l <= level; l++) total += buildCost(space, l);
  return total;
};
/** A stay costs one and a half times what was spent on the place, with the units dropped. */
export const feeOf = (space: Space, level: number) => Math.floor((outlay(space, level) * 1.5) / 10) * 10;
export interface Luck {
  text: string;
  money?: number;
  /** Move to this space; `forward` pays the salary when the way there passes the start. */
  to?: number;
  forward?: boolean;
  step?: number;
  /** Once round the board back to the same space, with the salary. */
  lap?: boolean;
  /** Pay this for each building owned, or for each place owned. */
  repairs?: number;
  perPlace?: number;
  /** Collect this from every other traveller, or pay it to each of them. */
  gift?: number;
  treat?: number;
  /** Pay this into the peace fund, or take everything in it. */
  donate?: number;
  takeFund?: boolean;
  /** Kept until needed: leaves the island at once, or waives one fee. */
  ticket?: boolean;
  waiver?: boolean;
  /** The dearest place owned is sold back to the bank at half of what was spent. */
  halfSale?: boolean;
}
const SPACE_PORT = SPACES.findIndex((space) => space.kind === "space"),
  byName = (name: string) => SPACES.findIndex((space) => space.name === name);
export const LUCK: Luck[] = [
  // Windfalls.
  { text: "여행 복권에 당첨되었습니다. 150만원을 받습니다.", money: 150 },
  { text: "여행 사진 공모전에서 입상했습니다. 80만원을 받습니다.", money: 80 },
  { text: "항공 마일리지를 환급받았습니다. 50만원을 받습니다.", money: 50 },
  { text: "평화를 위해 애쓴 공로로 큰 상을 받았습니다. 상금 300만원을 받습니다.", money: 300 },
  { text: "여행 장학생으로 뽑혔습니다. 100만원을 받습니다.", money: 100 },
  { text: "세계 자동차 경주에서 우승했습니다. 200만원을 받습니다.", money: 200 },
  { text: "오래 부은 여행 적금이 만기가 되었습니다. 120만원을 받습니다.", money: 120 },
  // Costs.
  { text: "여권을 잃어버려 다시 발급받았습니다. 60만원을 냅니다.", money: -60 },
  { text: "기념품을 너무 많이 샀습니다. 80만원을 냅니다.", money: -80 },
  { text: "짐이 다른 공항으로 갔습니다. 새 옷값 40만원을 냅니다.", money: -40 },
  { text: "여행 중에 배탈이 났습니다. 병원비 50만원을 냅니다.", money: -50 },
  { text: "과속으로 단속에 걸렸습니다. 벌금 50만원을 냅니다.", money: -50 },
  { text: "해외 연수를 떠납니다. 등록금 100만원을 냅니다.", money: -100 },
  // Journeys.
  { text: "고속 열차를 탔습니다. 출발 칸으로 가서 월급을 받습니다.", to: 0 },
  { text: "배가 떠내려갔습니다. 무인도로 갑니다. 월급은 받지 못합니다.", to: ISLAND },
  { text: "우주여행 초청장을 받았습니다. 우주여행 칸으로 갑니다. 출발을 지나면 월급을 받습니다.", to: SPACE_PORT, forward: true },
  { text: "서울 관광을 떠납니다. 서울로 갑니다. 출발을 지나면 월급을 받습니다.", to: byName("서울"), forward: true },
  { text: "파리 관광을 떠납니다. 파리로 갑니다. 출발을 지나면 월급을 받습니다.", to: byName("파리"), forward: true },
  { text: "세계 일주 초대권입니다. 판을 한 바퀴 돌아 제자리로 오고 월급을 받습니다.", lap: true },
  { text: "지름길을 찾았습니다. 세 칸 앞으로 갑니다.", step: 3 },
  { text: "길을 잘못 들었습니다. 두 칸 뒤로 갑니다.", step: -2 },
  { text: "숙소를 옮깁니다. 세 칸 뒤로 갑니다.", step: -3 },
  // What is owned.
  { text: "건물을 수리합니다. 건물 한 단계마다 30만원을 냅니다.", repairs: 30 },
  { text: "재산세 고지서가 나왔습니다. 가진 땅 하나마다 30만원을 냅니다.", perPlace: 30 },
  { text: "급히 돈이 필요합니다. 가장 비싼 내 땅을 들인 돈의 반값에 은행에 팝니다.", halfSale: true },
  // The others, and the fund.
  { text: "생일입니다. 다른 여행자에게서 50만원씩 받습니다.", gift: 50 },
  { text: "한턱냅니다. 다른 여행자에게 30만원씩 줍니다.", treat: 30 },
  { text: "인류평화기금에 100만원을 기부합니다.", donate: 100 },
  { text: "인류평화기금 배당일입니다. 모인 기금을 모두 받습니다.", takeFund: true },
  // Kept for later.
  { text: "무인도 탈출권입니다. 갖고 있다가 무인도에 갇힐 때 저절로 써서 바로 떠납니다.", ticket: true },
  { text: "우대권입니다. 갖고 있다가 다음에 낼 숙박료나 통행료 한 번을 내지 않습니다.", waiver: true },
];
export interface Player {
  money: number;
  at: number;
  /** Turns still to sit out in the storm. */
  wait: number;
  out: boolean;
  /** Island escape tickets and fee waivers kept from golden keys. */
  tickets: number;
  waivers: number;
}
/**
 * "key": a golden key card waits to be drawn; "card": it has been drawn and
 * waits to be read; "travel": a destination is to be chosen for space travel;
 * "end": everything is done and the traveller may still sell before passing the dice on.
 */
export type Phase = "roll" | "key" | "card" | "travel" | "buy" | "build" | "end" | "over";
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
  /** The fee the traveller who has just landed paid to another, or null. */
  paid: { by: number; to: number; amount: number; place: number } | null;
}
/** Money as it is written everywhere: in ten-thousands of won. */
export const won = (n: number) => `${n.toLocaleString("ko-KR")}만원`;
export function createGame(players: number): State {
  const n = Math.max(2, Math.min(4, players));
  return {
    players: Array.from({ length: n }, () => ({ money: START_MONEY, at: 0, wait: 0, out: false, tickets: 0, waivers: 0 })),
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
    paid: null,
  };
}
/** What was spent on a space: its price and every building on it. */
export function invested(state: State, index: number) {
  let total = SPACES[index].price;
  for (let level = 1; level <= state.levels[index]; level++) total += buildCost(SPACES[index], level);
  return total;
}
/** A traveller sells one of its own places back at half of what was spent on it, during its own turn. */
export function sell(state: State, player: number, index: number): State | null {
  if (state.phase === "over" || state.turn !== player || state.owners[index] !== player) return null;
  const s = clone(state),
    back = Math.round(invested(state, index) / 2);
  s.players[player].money += back;
  s.owners[index] = -1;
  s.levels[index] = 0;
  s.actor = player;
  // Having sold the very place it was about to build on, it may buy it back instead.
  if (s.phase === "build" && s.players[player].at === index) s.phase = "buy";
  s.note = `${SPACES[index].name}을(를) ${won(back)}에 팔았습니다.`;
  return s;
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
/**
 * The step is over. A double rolls again; otherwise the traveller is left to
 * end the turn by hand (it may still sell), unless it is out of the game.
 */
function pass(s: State, again: boolean) {
  const alive = s.players.flatMap((p, i) => (p.out ? [] : [i]));
  if (alive.length <= 1) return finish(s, alive);
  if (s.players[s.turn].out) return advance(s);
  s.phase = again ? "roll" : "end";
  return s;
}
/** Hands the dice to the next traveller still in the game, or counts the game. */
function advance(s: State) {
  const alive = s.players.flatMap((p, i) => (p.out ? [] : [i]));
  if (alive.length <= 1) return finish(s, alive);
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
  s.phase = "roll";
  return s;
}
/** The traveller to move ends its turn. */
export function endTurn(state: State): State | null {
  if (state.phase !== "end") return null;
  const s = clone(state);
  s.actor = s.turn;
  s.note = "";
  return advance(s);
}
function finish(s: State, winners: number[]) {
  s.phase = "over";
  s.winners = winners;
  return s;
}
/** Holds a traveller on the island, unless it carries an escape ticket. */
function strand(s: State, player: number) {
  const p = s.players[player];
  if (p.tickets > 0) {
    p.tickets--;
    s.note += " 무인도 탈출권을 써서 갇히지 않았습니다.";
  } else {
    p.wait = STORM_TURNS;
    s.note += " 무인도에 갇혔습니다.";
  }
}
/** What the space a traveller stands on does. Returns true when a decision is pending. */
function arrive(s: State): boolean {
  const me = s.turn,
    p = s.players[me],
    space = SPACES[p.at];
  if (space.kind === "city" || space.kind === "ship") {
    const owner = s.owners[p.at];
    if (owner === -1) {
      // Offered even to an empty purse: something else may be sold to pay for it.
      s.phase = "buy";
      return true;
    } else if (owner === me) {
      if (space.kind === "city" && s.levels[p.at] < 3) {
        s.phase = "build";
        return true;
      }
    } else if (p.waivers > 0) {
      p.waivers--;
      s.note += ` 우대권을 써서 ${space.name}의 ${space.kind === "ship" ? "통행료" : "숙박료"}를 내지 않았습니다.`;
    } else {
      const fee = space.kind === "ship" ? SHIP_TOLL : feeOf(space, s.levels[p.at]),
        paid = charge(s, me, fee);
      s.players[owner].money += paid;
      s.paid = { by: me, to: owner, amount: paid, place: p.at };
      s.note += ` ${space.name}의 ${space.kind === "ship" ? "통행료" : "숙박료"} ${won(paid)}을 냈습니다.`;
    }
  } else if (space.kind === "fund") {
    const paid = charge(s, me, FUND_FEE);
    s.fund += paid;
    s.note += ` 인류평화기금에 ${won(paid)}을 냈습니다 (모인 돈 ${won(s.fund)}).`;
  } else if (space.kind === "collect") {
    s.note += s.fund ? ` 인류평화기금 ${won(s.fund)}을 받았습니다.` : " 모인 기금이 없습니다.";
    p.money += s.fund;
    s.fund = 0;
  } else if (space.kind === "storm") {
    strand(s, me);
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
  s.paid = null;
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
    s.path = [ISLAND];
    s.note += ` 같은 눈이 세 번 이어져 무인도로 갑니다.`;
    strand(s, me);
    return pass(s, false);
  }
  if (double) s.note += " 더블! 한 번 더 굴립니다.";
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
    s.note += ` ${SPACES[ship].name} 주인에게 ${won(paid)}을 냈습니다.`;
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
  const owned = () => s.owners.flatMap((owner, i) => (owner === me ? [i] : []));
  if (card.money) {
    if (card.money > 0) p.money += card.money;
    else charge(s, me, -card.money);
  }
  if (card.repairs) charge(s, me, card.repairs * owned().reduce((n, i) => n + s.levels[i], 0));
  if (card.perPlace) charge(s, me, card.perPlace * owned().length);
  if (card.halfSale) {
    const dearest = owned().sort((a, b) => invested(s, b) - invested(s, a))[0];
    if (dearest === undefined) s.note += " 가진 땅이 없어 아무 일도 없습니다.";
    else {
      const back = Math.round(invested(s, dearest) / 2);
      p.money += back;
      s.owners[dearest] = -1;
      s.levels[dearest] = 0;
      s.note += ` ${SPACES[dearest].name}을(를) ${won(back)}에 팔았습니다.`;
    }
  }
  if (card.gift)
    s.players.forEach((other, i) => {
      if (i !== me && !other.out) p.money += charge(s, i, card.gift!);
    });
  if (card.treat)
    s.players.forEach((other, i) => {
      if (i !== me && !other.out && !p.out) other.money += charge(s, me, card.treat!);
    });
  if (card.donate) s.fund += charge(s, me, card.donate);
  if (card.takeFund) {
    s.note += s.fund ? ` ${won(s.fund)}을 받았습니다.` : " 모인 기금이 없습니다.";
    p.money += s.fund;
    s.fund = 0;
  }
  if (card.ticket) p.tickets++;
  if (card.waiver) p.waivers++;
  if (card.lap) {
    p.money += SALARY;
    s.path.push(p.at);
  }
  let pending = false;
  if (card.to !== undefined && !p.out) {
    if (card.to === 0 || (card.forward && card.to < p.at)) p.money += SALARY;
    const moved = card.to !== p.at;
    p.at = card.to;
    s.path.push(card.to);
    if (card.to !== 0 && moved) pending = arrive(s);
  }
  if (card.step && !p.out) {
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
  const cost = s.phase === "buy" ? space.price : buildCost(space, s.levels[p.at] + 1);
  if (yes && p.money < cost) return null;
  if (yes && s.phase === "buy") {
    p.money -= space.price;
    s.owners[p.at] = me;
    s.note = `${space.name}을(를) ${won(space.price)}에 샀습니다.`;
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
