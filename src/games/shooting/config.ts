import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BLUE, COMBO, MAG as BB_MAG, MOST_COMBO, TIERS, YELLOW } from "./bb";
import { CLAYS } from "./clay";
import { CARTRIDGES, DAMAGE, KINDS, MAG as HUNT_MAG, SESSION } from "./hunt";
import { MODES, modeOf } from "./layout";
import { BREAK, HIT, TAKE, broken, shooting, type State } from "./rules";
import { SHOOTING_COLORS, ShootingView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** The clays broken in a row at the end of the card. */
const run = (card: number[]) => {
  let n = 0;
  for (let k = card.length - 1; k >= 0 && card[k] > 0; k--) n++;
  return n;
};
export const shootingConfig: PointConfig<State> = {
  game: shooting,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  view: (host, quality, variant) => new ShootingView(host, quality, variant),
  colors: SHOOTING_COLORS,
  variants: MODES.map((m) => ({ value: m.value, label: m.label })),
  variantLabel: "종목",
  settings: [
    {
      id: "tier",
      label: "등급",
      kind: "choice",
      value: "0",
      options: TIERS.map((t, i) => ({ value: String(i), label: `${t.name} · ${t.pellets}발` })),
      fixed: ["clay", "hunt"],
    },
  ],
  tallyHtml: (state) => {
    if (state.mode === "bb") return [stat("점수", state.score) + stat("남은 BB탄", state.ammo) + stat("최고 콤보", state.best), ""];
    if (state.mode === "clay") return [stat("명중", `${broken(state)}/${CLAYS}`) + stat("접시", `${state.thrown}/${CLAYS}`), ""];
    return [stat("점수", state.score) + stat("남은 시간", `${state.left}초`) + stat("남은 탄", state.ammo), ""];
  },
  // A combo at the booth, a run of clays, and an animal taken are called across the table.
  cheer: (before, state) => {
    const last = state.last ?? -1;
    if (state.ply !== before.ply + 1) return null;
    if (state.mode === "bb" && last >= HIT && state.combo >= 2) return `콤보 ×${Math.min(MOST_COMBO, state.combo)}`;
    if (state.mode === "clay" && last === BREAK) {
      const n = run(state.card);
      return n >= 5 && n % 5 === 0 ? `${n}연속 명중!` : null;
    }
    if (state.mode === "hunt" && last >= TAKE && last < TAKE + KINDS.length) return `${KINDS[last - TAKE].name}!`;
    return null;
  },
  // Each gun has its own report and its own empty click and reload; BB pellets tick on plastic, a lit target chimes,
  // a clay shatters, birds take off in a flurry, a bullet thumps into an animal.
  knock: (sound, kind: string, strength) => {
    if (kind === "shot-bb") sound.gunshot("bb");
    else if (kind === "shot-clay") sound.gunshot("shotgun");
    else if (kind === "shot-hunt") sound.gunshot("rifle");
    else if (kind === "click") sound.dryFire();
    else if (kind.startsWith("reload-")) sound.reload(kind === "reload-clay" ? "shotgun" : kind === "reload-hunt" ? "rifle" : "bb");
    else if (kind === "loaded") sound.reload("done");
    else if (kind === "tick") sound.bbTick(strength);
    else if (kind === "ding") sound.ding(strength);
    else if (kind === "trap") sound.trap();
    else if (kind === "clay") sound.clayBreak();
    else if (kind === "flutter") sound.flutter();
    else if (kind === "thump") sound.thud();
    else if (kind === "splash") sound.plop();
  },
  contact: () => {},
  name: "사격",
  english: "Shooting",
  number: "NO. 100 — STEADY SIGHTS",
  intro: `<p>오락실의 비비탄 사격기, 클레이 사격장, 호숫가 숲속 사냥터에서 총을 쏩니다.<br>화면을 누르고 있으면 총을 들어 조준하고, 가늠자와 가늠쇠가 일직선을 이루는 순간 손을 떼면 그곳으로 날아갑니다.</p>`,
  meta: `1인 · 비비탄 사격 · 클레이 사격 ${CLAYS}접시 · 사냥 ${SESSION}초 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>STEADY SIGHTS</span>`,
  artClass: "hexa-art",
  artLabel: "사격 미리보기",
  tableLabel: "THE RANGE",
  tableNote: (variant, options) => {
    const mode = modeOf(variant);
    if (mode === "bb") return `비비탄 사격 · ${TIERS[Number(options.tier) || 0]?.name ?? "동"} 등급`;
    return mode === "clay" ? `클레이 사격 · ${CLAYS}접시` : `사냥 · ${SESSION}초`;
  },
  rulesTitle: "가늠자와 가늠쇠를 일직선에",
  rules:
    part(
      "기본 규칙",
      steps(
        "화면을 <b>누르고 있으면</b> 총을 들어 조준합니다. 누른 곳을 겨누며 시작하고, 누른 채 끌면 총이 손가락이 움직인 만큼 그대로, 같은 빠르기로 돕니다.",
        "총구 쪽 <b>가늠쇠</b>는 겨눈 곳에 멈춰 있고, 눈앞의 <b>가늠자</b>는 손이 떨리듯 천천히 흔들립니다.",
        "한곳을 겨눈 채 <b>가만히 있을수록</b> 손이 안정되어 가늠자의 흔들림이 점점 줄어듭니다(2~3초면 거의 멈춥니다). 총을 움직이면 움직인 만큼 다시 흔들립니다.",
        "<b>손을 떼면</b> 발사합니다. 가늠자와 가늠쇠가 일직선이면 겨눈 곳에 그대로 맞고, 어긋날수록 그만큼, 가늠쇠가 가늠자에서 비켜 있는 쪽으로 빗나갑니다.",
        "세 점이 한 줄로 서면 가늠쇠와 가늠자의 점이 초록색으로 빛납니다. 그 순간을 기다렸다가 떼세요.",
        "들어 올리는 도중(누르자마자)에 떼면 쏘지 않고 총을 내립니다. 탄이 떨어지면 저절로 장전하고, 장전하는 동안 당기면 '철컥' 소리만 납니다.",
      ),
    ) +
    part(
      "비비탄 사격",
      table(
        ["과녁", `세 칸에 동그란 과녁 18개. 파란불이 켜진 과녁은 ${BLUE}점, 노란불은 ${YELLOW}점이고 가운데(불스아이)는 두 배입니다. 불이 꺼진 과녁이나 벽은 0점입니다.`],
        ["콤보", `맞힌 뒤 <b>${COMBO}초 안에</b> 다음 과녁을 맞히면 콤보가 이어져 점수가 콤보 수만큼 곱해집니다(최대 ×${MOST_COMBO}). 가운데 전광판에 콤보가 나옵니다.`],
        [
          "과녁 불",
          `과녁은 여러 개가 한꺼번에 켜져 몇 초씩 머물고, 하나가 꺼지거나 맞으면 곧 다른 과녁이 켜집니다. 가끔 한 줄이 차례차례 켜집니다. ` +
            TIERS.map((t) => `${t.name} ${t.fewest}~${t.most}개 · 약 ${t.stay.toFixed(1)}초`).join(", ") +
            ".",
        ],
        ["등급", TIERS.map((t) => `${t.name} ${t.pellets}발`).join(" · ") + ". 높을수록 과녁이 더 많이, 조금 더 짧게 켜집니다."],
        ["탄창", `${BB_MAG}발마다 잠깐 장전합니다. 마지막 BB탄이 떨어지면 끝납니다.`],
        ["비비탄", "느리게 날아가 살짝 떠올랐다가 겨눈 곳에 내려앉습니다. 날아가는 동안 불이 꺼지면 점수가 없습니다."],
      ),
    ) +
    part(
      "클레이 사격",
      table(
        [
          "접시",
          `'풀!' 소리와 함께 앞쪽 트랩 하우스에서는 하늘 높이, 양옆 트랩 하우스에서는 하늘을 가로질러 접시가 날아갑니다. 때로는 두 개가 한꺼번에 날아옵니다(더블). 방향·높이·빠르기는 매번 다릅니다. 모두 ${CLAYS}개.`,
        ],
        ["산탄총", "한 번 던질 때마다 두 발. 산탄은 겨눈 곳 둘레로 퍼지고 멀수록 더 넓게 퍼집니다. 알갱이 하나만 스쳐도 접시가 깨지고, 한 발에 두 개가 함께 깨지기도 합니다."],
        ["점수", "깨뜨린 접시 수. 왼쪽 점수판에 X(명중)와 O(놓침)로 적힙니다."],
      ),
    ) +
    part(
      "사냥",
      table(
        ["동물", KINDS.map((k) => `${k.name} 체력 ${k.health} · ${k.points}점`).join("<br>")],
        ["맞는 곳", `머리 ${DAMAGE.head}, 몸통 ${DAMAGE.body}, 다리·날개 ${DAMAGE.legs}만큼 체력이 닳습니다. 맞은 동물은 느려지고 달아납니다. 다리나 날개를 맞으면 가장 많이 느려집니다.`],
        ["시간과 탄", `${SESSION}초 동안, 탄은 모두 ${CARTRIDGES}발(탄창 ${HUNT_MAG}발). 동물은 아무 때나 나타나고 잡지 않으면 떠납니다. 시간이 다 되거나 탄을 다 쓰면 끝납니다.`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "누른 채로 가만히 기다리면 흔들림이 잦아들고 가늠자가 가늠쇠 쪽으로 돌아옵니다. 점 세 개가 초록으로 빛날 때 떼면 거의 맞습니다.",
        "클레이는 접시가 지나갈 자리를 미리 누르고 기다렸다가, 접시가 가늠쇠에 닿는 순간 떼면 쉽습니다.",
        "비비탄 사격은 불이 켜진 과녁을 잇달아 맞혀 콤보를 이어 가는 것이 고득점의 비결입니다.",
        "사냥에서는 큰 동물일수록 여러 발이 필요합니다. 머리를 노리면 빨리 잡지만 작아서 어렵습니다.",
      ),
    ),
  help: "마우스·터치: 누르고 있으면 조준, 끌어서 겨누고, 떼면 발사<br>키보드: 스페이스나 Enter를 누르고 있는 동안 조준하며 방향키로 겨누고, 떼면 발사",
  sides: ["나", ""],
  startWord: "사대에 서기",
};
