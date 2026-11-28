import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { INSIDE_MOST, OUTSIDE_MOST, SPOTS } from "./bets";
import { spotPlace } from "./layout";
import { CHIP, CHIPS, CLEAR, REBET, SPIN, START, UNDO, roulette, said, staked, type State } from "./rules";
import { ROULETTE_COLORS, RouletteView } from "./view";

const made = (to: number) => ({ from: -1, to, extra: -1 });
/** The keys: 1–4 choose a chip, Enter or Space on a spot bets (the usual walk), S spins, Backspace takes the last chip back. */
const keyMove = (key: string, state: State) => {
  if (/^[1-4]$/.test(key)) return made(CHIP + Number(key) - 1);
  if (key === "s" || key === "S") return made(SPIN);
  if (key === "Backspace") return made(UNDO);
  if (key === "Delete") return made(CLEAR);
  if ((key === "r" || key === "R") && state.lastBets) return made(REBET);
  return null;
};
export const rouletteConfig: PointConfig<State> = {
  game: roulette,
  solo: true,
  noUndo: true,
  noPanel: true,
  view: (host, quality) => new RouletteView(host, quality),
  colors: ROULETTE_COLORS,
  // The keyboard walks over every spot of the layout (where its chips lie).
  keyPoints: () => SPOTS.map((_, id) => {
    const p = spotPlace(id);
    return { x: p.x, z: p.z };
  }),
  keyStart: () => SPOTS.findIndex((s) => s.kind === "straight" && s.numbers[0] === 17),
  keyMove,
  bankrupt: (state) => state.balance < CHIPS[0] && staked(state) === 0,
  movingText: "공이 돌고 있습니다…",
  // A chip laid clacks; the ball rolls round, ticks off the diamonds and frets, drops into its pocket; a win rings.
  contact: (sound, state) => {
    const last = state.last ?? -1;
    if ((last >= 0 && last < SPOTS.length) || last === REBET) sound.chips();
    else if (last === UNDO || last === CLEAR) sound.soft(1, 0.35);
    else if (last >= CHIP && last < CHIP + CHIPS.length) sound.tap();
  },
  knock: (sound, kind: string, strength) => {
    if (kind === "roll") sound.rolling(strength);
    else if (kind === "diamond") sound.tile(2);
    else if (kind === "fret") sound.marble();
    else if (kind === "drop") sound.tile(1);
    else if (kind === "rest") sound.tile(4);
    // The croupier sweeping the lost chips off, and counting out the winnings.
    else if (kind === "sweep" || kind === "pay") sound.chips();
    else if (kind === "win") sound.sparkle();
  },
  cheer: (before, state) => (state.spins === before.spins + 1 && state.result ? `${said(state.result)}${state.result.paid ? ` · +${state.result.paid}` : ""}` : null),
  cheerOnRest: true,
  name: "룰렛",
  english: "Roulette",
  number: "NO. 109 — FAITES VOS JEUX",
  intro: `<p>카지노 한구석의 룰렛 테이블에 앉습니다.<br>칩을 숫자와 줄에 걸고 휠을 돌리면, 공이 굴러가다 떨어지는 칸의 숫자로 승부가 납니다. 0이 하나뿐인 유럽식 휠입니다.</p>`,
  meta: `1인 · 칩 ${START}개로 시작 · 0~36`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FAITES VOS JEUX</span>`,
  artClass: "hexa-art",
  artLabel: "룰렛 미리보기",
  tableLabel: "THE ROULETTE TABLE",
  tableNote: () => "유럽식 · 싱글 제로",
  rulesTitle: "숫자에 걸고 휠을 돌리세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `칩 ${START}개를 가지고 앉습니다. 아래쪽에서 칩(${CHIPS.join("·")})을 고르고 판을 누르면 그 자리에 칩이 놓입니다. 같은 곳을 또 누르면 칩이 쌓입니다.`,
        "<b>돌리기</b>를 누르면 휠이 돌고 공이 굴러갑니다. 공은 점점 느려져 트랙에서 떨어지고, 원뿔을 따라 내려가 다이아몬드에 튕기거나 칸막이를 넘나들다가 한 칸에 멈춥니다.",
        "공이 멈춘 칸의 숫자에 걸린 칩은 배당만큼 받고(건 칩도 돌려받습니다), 나머지 칩은 잃습니다.",
        "칩이 가장 작은 칩 1개보다 적어지면 끝납니다(파산). 판에 칩이 없을 때 <b>일어나기</b>를 누르면 가진 칩으로 끝냅니다. 처음보다 많으면 이깁니다.",
      ),
    ) +
    part(
      "거는 곳과 배당",
      table(
        ["스트레이트 (숫자 하나)", "숫자 칸 한가운데. 35배"],
        ["스플릿 (두 숫자)", "두 칸 사이의 줄 위. 17배"],
        ["스트리트 (한 줄 셋)", "세 숫자 줄의 아래쪽 끝 선. 11배. 0·1·2와 0·2·3(트리오)은 0과 맞닿은 꼭짓점"],
        ["코너 (네 숫자)", "네 칸이 만나는 꼭짓점. 8배. 0·1·2·3은 0의 아래쪽 끝"],
        ["식스 라인 (여섯 숫자)", "두 스트리트가 만나는 아래쪽 끝 선의 꼭짓점. 5배"],
        ["더즌 (1~12·13~24·25~36)", "숫자 아래 첫 줄. 2배"],
        ["컬럼 (세로줄 12개)", "오른쪽 끝의 2:1 칸. 2배"],
        ["빨강·검정, 짝수·홀수, 1~18·19~36", "맨 아래 줄. 1배. 0이 나오면 모두 집니다"],
      ),
    ) +
    part(
      "버튼",
      table(
        ["칩", "걸 칩의 크기를 고릅니다(키보드 1~4)."],
        ["되돌리기", "마지막에 놓은 칩 하나를 거둡니다(Backspace)."],
        ["지우기", "판의 칩을 모두 거둡니다(Delete)."],
        ["다시 걸기", "지난번과 똑같이 겁니다(R). 판이 비어 있을 때만 나옵니다."],
        ["돌리기", "휠을 돌립니다(S). 공이 멈출 때까지는 걸 수 없습니다."],
        ["일어나기", "가진 칩으로 게임을 끝냅니다. 판이 비어 있을 때만 나옵니다."],
      ),
    ) +
    part(
      "테이블 한도",
      table(["숫자와 줄 (스트레이트~식스 라인)", `한 자리에 ${INSIDE_MOST}개까지`], ["바깥쪽 (더즌·컬럼·빨강·검정 등)", `한 자리에 ${OUTSIDE_MOST}개까지`], ["최근 숫자", "오른쪽 위에 최근에 나온 숫자가 왼쪽부터 차례로 보입니다."]),
    ) +
    part("처음이라면", notes("빨강·검정처럼 배당이 작은 곳은 자주 맞고, 숫자 하나는 드물게 맞지만 크게 받습니다.", "0은 휠에 하나뿐인 초록 칸입니다. 0이 나오면 바깥쪽 칩은 모두 집니다.", "공이 어디에 멈출지는 휠과 공의 움직임으로 정해집니다. 앞서 나온 숫자는 다음 숫자와 상관이 없습니다.")),
  help: "마우스·터치: 아래에서 칩을 고르고 판을 눌러 걸기, 돌리기로 휠 돌리기<br>키보드: 방향키로 자리 고르기·Enter로 걸기, 1~4 칩, S 돌리기, Backspace 되돌리기",
  sides: ["나", ""],
  startWord: "테이블에 앉기",
};
