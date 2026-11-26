import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { TARGETS, TIMED, TIMED_SECONDS, goldRaid, type State } from "./rules";
import { BOMB_SHARE, CAP, CART, DROP_SHARE, KINDS, LOAD_SLOW, RAID } from "./sim";
import { GOLD_RAID_COLORS, GoldRaidView } from "./view";

const percent = (share: number) => `${Math.round(share * 100)}%`;
export const goldRaidConfig: PointConfig<State> = {
  game: goldRaid,
  live: true,
  pausable: true,
  noUndo: true,
  // Both treasuries, the sacks and the clock stand over the valley (the view's own board).
  noPanel: true,
  view: (host, quality, _variant, mode, level) => new GoldRaidView(host, quality, mode === "local", level),
  colors: GOLD_RAID_COLORS,
  // Coins and gems taken, a chest, gold poured into the treasury, the club through the air and on a head, a bomb, the
  // cart's bells and its boards breaking, the blow on a gate.
  knock: ((sound, kind: string, strength) => {
    if (kind === "coin") sound.coin(strength);
    else if (kind === "gem") sound.sparkle();
    else if (kind === "chest") {
      sound.cash();
      sound.sparkle();
    } else if (kind === "deposit") {
      sound.chips();
      sound.coin(strength);
      if (strength > 0.85) sound.chime();
    } else if (kind === "jump") sound.hop();
    else if (kind === "swing") sound.swish();
    else if (kind === "hit") {
      sound.bonk();
      sound.chips();
    } else if (kind === "boom") sound.explosion();
    else if (kind === "fall") sound.ding(0.8);
    else if (kind === "bells") {
      sound.chime();
      sound.ding(0.7);
    } else if (kind === "bell") sound.ding(strength);
    else if (kind === "shed") {
      sound.hollow(0.8);
      sound.coin(0.7);
    } else if (kind === "broken") {
      sound.crunch(true);
      sound.cash();
    } else if (kind === "raid") {
      sound.boardKnock(1);
      sound.coin(0.8);
    }
  }) as PointConfig<State>["knock"],
  variants: [
    { value: "60", label: `짧은 판 · 금화 ${TARGETS["60"]}` },
    { value: "100", label: `보통 · 금화 ${TARGETS["100"]}` },
    { value: "150", label: `긴 판 · 금화 ${TARGETS["150"]}` },
    { value: TIMED, label: `${TIMED_SECONDS / 60}분 판 · 더 많이 모으기` },
  ],
  variantLabel: "성의 크기",
  movingText: "쟁탈전 중…",
  name: "금화 쟁탈전",
  english: "Gold Raid",
  number: "NO. 113 — FILL YOUR CASTLE",
  intro: `<p>두 산적 왕이 골짜기에서 금화를 다툽니다.<br>하늘에서 떨어지는 금화와 보석을 자루에 담아 내 성문으로 나르세요. 지나가는 대상의 수레를 털고, 상대를 몽둥이로 쳐서 금화를 떨어뜨리게 할 수도 있습니다. 내 성을 먼저 채우면 이깁니다.</p>`,
  meta: "컴퓨터 대전 · 로컬 2인 · 실시간",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FILL YOUR CASTLE</span>`,
  artClass: "foosball-art",
  artLabel: "금화 쟁탈전 골짜기 미리보기",
  tableLabel: "THE BANDIT KINGS' VALLEY",
  tableNote: (variant) => (variant === TIMED ? `실시간 · ${TIMED_SECONDS / 60}분 동안 더 많이` : `실시간 · 금화 ${TARGETS[variant] ?? 100}을 먼저`),
  firstNote: "내가 빨간 산적 왕입니다. 왼쪽 빨간 성이 내 성입니다.",
  rulesTitle: "내 성을 금화로 먼저 채우세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "빨간 산적 왕의 성은 왼쪽, 파란 산적 왕의 성은 오른쪽입니다. 컴퓨터 대전에서는 내가 빨강입니다.",
        "하늘에서 금화와 보석이 떨어져 길이나 나무 발판 위에 놓입니다. 몸이 닿으면 <b>자루</b>에 담깁니다. 떨어지는 것을 공중에서 받아도 됩니다.",
        `자루에는 금화 <b>${CAP}</b>까지 담깁니다. 자루가 무거울수록 느려져, 가득 차면 빈손일 때의 ${percent(1 - LOAD_SLOW)} 빠르기로 달립니다(몸도 앞으로 숙여집니다).`,
        "자루를 메고 <b>내 성문 앞(바닥의 고리)</b>에 서면 금화가 성의 금고로 들어갑니다. 탑의 금빛 눈금과 화면 위의 막대가 차오릅니다.",
        "정한 금화를 먼저 채운 성이 이깁니다. 3분 판은 시간이 끝났을 때 금고에 더 많이 모은 쪽이 이기고, 같으면 무승부입니다.",
      ),
    ) +
    part(
      "떨어지는 것",
      table(
        ["금화", `${KINDS.coin.value}닢. 가장 자주 떨어집니다.`],
        ["돈주머니", `금화 ${KINDS.pouch.value}.`],
        ["보석", `금화 ${KINDS.gem.value}.`],
        ["폭탄", `닿으면 곧바로, 땅에 놓이면 잠시 뒤에 터집니다. 휘말리면 잠깐 기절하고 자루의 ${percent(BOMB_SHARE)}를 흘립니다. 상대가 가까이 있을 때 터지게 두는 것도 수입니다.`],
        ["사라짐", "길에 놓인 것은 얼마 뒤 깜빡이다가 사라집니다. 좌우 대칭으로 한 쌍씩 떨어지므로 어느 쪽도 유리하지 않습니다."],
      ),
    ) +
    part(
      "몽둥이",
      table(
        ["상대를 치기", `가까이서 치면 상대가 잠깐 기절하고 자루의 ${percent(DROP_SHARE)}를 길에 흘립니다('강탈!'). 흘린 금화는 먼저 줍는 사람이 임자입니다. 쓰러져 있는 동안은 다시 맞지 않고 폭탄에도 휘말리지 않지만, 일어나면 곧바로 다시 맞을 수 있습니다. 대신 친 쪽은 몽둥이를 다시 들기까지 상대가 일어나는 것보다 조금 더 걸립니다.`],
        ["대상의 수레", `가끔 '대상 행렬!'과 함께 방울 소리를 내며 소 수레가 길을 지나갑니다. 금화 ${CART.gold}을 싣고 있고, 한 번 칠 때마다 ${CART.shed}씩 떨어집니다. ${CART.blows}번 치면 수레가 부서져 남은 금화가 모두 쏟아집니다.`],
        ["상대의 성문", `상대 성문을 치면 금고에서 금화 ${RAID}을 꺼내 옵니다('성문 습격!'). 대신 성에서 불단지가 떨어지니 얼른 피하세요. 성문은 잠시 잠깁니다.`],
      ),
    ) +
    part(
      "조작",
      table(
        ["혼자", "A D 또는 ← →로 달리기, W 또는 ↑로 점프, S · F 또는 ↓ · /로 치기."],
        ["둘이서", "빨강은 A D, W(점프), S 또는 F(치기). 파랑은 ← →, ↑(점프), ↓ 또는 /(치기)."],
        ["휴대폰", "왼쪽 아래 레버를 옆으로 밀면 달리고(많이 밀수록 빨리), 위로 올리면 점프합니다(다시 뛰려면 레버를 내렸다 올림). 오른쪽 아래 치기 버튼으로 칩니다. 둘이서 할 때는 화면 양쪽 끝에 각자의 레버와 치기 버튼이 있습니다."],
        ["발판", "나무 발판은 아래에서 뛰어올라 통과하고 위에 설 수 있습니다. 끝으로 걸어 나가면 내려옵니다."],
        ["화면", "골짜기가 넓은 화면에는 다 보이지 않을 수 있습니다. 화면이 내 산적을 따라가고, 점수판 아래 띠 지도에 두 성과 두 산적, 수레의 자리, 지금 보이는 곳이 나옵니다."],
        ["둘이서 볼 때", "가까이 있으면 한 화면에 둘이 함께 보이고, 멀어질수록 조금 넓게 보입니다. 더 멀어지면 화면이 왼쪽과 오른쪽으로 나뉘어 각자를 따라갑니다."],
        ["일시정지", "오른쪽 위 버튼이나 P 키."],
      ),
    ) +
    part(
      "모드와 레벨",
      table(
        ["컴퓨터 대전", "내가 빨강, 컴퓨터가 파랑입니다."],
        ["로컬 2인", "한 화면(한 키보드, 또는 한 휴대폰의 양쪽 버튼)에서 둘이 겨룹니다."],
        ["쉬움", "컴퓨터가 느리게 반응하고 폭탄을 잘 피하지 못하며, 몽둥이를 쓰지 않습니다."],
        ["보통", "발판에 올라가 줍고, 폭탄을 피하고, 가까우면 몽둥이를 씁니다."],
        ["어려움", "빠르게 움직이고 수레를 쫓으며, 내 금고가 차면 성문을 습격하기도 합니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "자루를 다 채우려고 욕심내지 마세요. 성과 가까울 때 자주 넣어 두면 맞거나 폭탄에 휘말려도 잃는 것이 적습니다.",
        "수레는 한 번에 판을 뒤집습니다. 알림이 뜨면 위치를 먼저 보세요.",
        "상대의 자루가 불룩하면 쳐 볼 만합니다. 내 자루가 불룩하면 상대와 거리를 두세요.",
        "검은 폭탄과 성에서 떨어지는 불단지는 터지기 전에 멀리 떨어지면 됩니다.",
      ),
    ),
  help: "달리기 A D (2P ← →) · 점프 W (2P ↑) · 치기 S 또는 F (2P ↓ 또는 /)<br>혼자서는 두 키 묶음 모두 내 산적을 움직입니다<br>휴대폰: 레버(옆으로 달리기 · 위로 점프) · 치기 버튼",
  sides: ["빨강", "파랑"],
  whoOf: (_s, player, mode) => (mode === "local" ? `${player === 0 ? "빨강" : "파랑"} 산적 왕` : null),
  startWord: "쟁탈전 시작",
};
