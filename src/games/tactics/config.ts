import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { chooseMove } from "./ai";
import { ANGEL_RANGE, AIM_ACT, AIM_MOVE, CANCEL, FIELDS, HEAL, JOBS, LIMIT, SIDES, UNDO, WAIT, activeUnit, fieldOf, tactics, type State } from "./rules";
import { SIDE_COLORS } from "./figures";
import { TacticsView } from "./view";

/** A unit's line in the guide's table: what it is, its numbers, and what its strike reaches. */
const unitRow = (job: keyof typeof JOBS): [string, string] => {
  const s = JOBS[job];
  return [s.name, `체력 ${s.hp} · ${job === "healer" ? `회복 ${HEAL}` : `공격 ${s.power}`} · 방어 ${s.def} · 속도 ${s.speed} · 이동 ${s.move}칸 · 오르내림 ${s.jump}단. 사거리: ${s.reach}. ${s.note}`];
};
export const tacticsConfig: PointConfig<State> = {
  // The computer weighs every place and strike of the unit whose turn it is, and carries its plan out a command at a time.
  game: { ...tactics, choose: (state, level, random) => chooseMove(state, level, random) },
  view: (host, quality, variant, mode) => new TacticsView(host, quality, variant, mode),
  variants: FIELDS.map((f) => ({ value: f.id, label: f.name })),
  variantLabel: "전장",
  colors: SIDE_COLORS,
  // The field turns a quarter at a time; 시점 전환 brings it back to the first view.
  turnable: true,
  // 되돌리기 takes a move back within a unit's turn; nothing else is taken back.
  noUndo: true,
  // The commands of the ring by the unit, for the keyboard and readers; the ring does the same on the table.
  tools: [
    { label: "이동", point: AIM_MOVE, onBoard: true },
    { label: "공격", point: AIM_ACT, onBoard: true, text: (state) => (activeUnit(state).job === "healer" ? "회복" : "공격") },
    { label: "되돌리기", point: UNDO, onBoard: true },
    { label: "대기", point: WAIT, onBoard: true },
    { label: "취소", point: CANCEL, onBoard: true },
  ],
  // A unit's first command waits a moment, so that one can see whose turn it is; the rest of its turn follows at once.
  ponder: (state) => (state.moved || state.acted ? -150 : 200),
  // A healer left alone becomes the angel: it is called across the table once the light has faded.
  cheer: (_before, state) => (state.last?.angels?.length ? "천사 강림!" : null),
  cheerOnRest: true,
  // Footsteps on grass, a blade on armour, an arrow striking home, a blast of fire, a ring of light, a heal.
  contact: (sound, state) => {
    const last = state.last;
    if (!last || last.kind === "move" || last.kind === "undo" || last.kind === "wait") return sound.soft(4);
    if (last.job === "fire") return sound.explosion();
    if (last.job === "light") return sound.sparkle();
    if (last.job === "healer") return sound.pop();
    if (last.job === "angel") return sound.space();
    if (last.job === "archer") return sound.wood(3);
    return sound.knock(3);
  },
  firstNote: "컴퓨터 대전에서는 내가 청군을 이끕니다. 빠른 병사부터 움직입니다.",
  name: "전술 대전",
  english: "Tactical Battle",
  number: "NO. 82 — SPEED DECIDES",
  intro: `<p>높낮이가 있는 전장에서 여섯 명씩의 부대가 맞섭니다.<br>빠른 병사부터 차례가 오고, 높은 곳과 등 뒤를 잡으면 더 세게 칩니다. 플래시 게임 '택틱스 코어'를 떠올리게 하는 쿼터뷰 전술 게임입니다.</p>`,
  meta: `2인 · 6 대 6 · ${FIELDS.map((f) => f.name).join(" / ")}`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SPEED DECIDES</span>`,
  artClass: "morris-art",
  artLabel: "전술 대전 미리보기",
  tableLabel: "THE BATTLEFIELD",
  tableNote: (variant) => `${fieldOf(variant).name} · 6 대 6`,
  rulesTitle: "빠른 자가 먼저, 높은 곳과 등 뒤를 노리세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "청군과 홍군이 여섯 명씩 전장의 양쪽 끝에서 시작합니다. 상대 병사를 <b>모두 쓰러뜨리면</b> 이깁니다.",
        "차례는 편이 아니라 <b>병사마다</b> 옵니다. 위쪽 줄에 다음에 움직일 여덟 명이 나옵니다.",
        "자기 차례가 온 병사는 <b>이동</b>과 <b>공격</b>을 한 번씩 할 수 있습니다. 순서는 자유입니다(옮기고 치기, 치고 물러나기). 둘 다 하면 차례가 끝납니다.",
        "하나만 하거나 아무것도 하지 않을 때는 <b>대기</b>로 차례를 마칩니다. 공격하기 전이라면 <b>되돌리기</b>로 옮긴 것을 되돌릴 수 있습니다.",
        "공격을 고르면 닿는 칸이 붉게 보입니다. 한 번 누르면 맞는 범위가 보이고, 같은 칸을 다시 누르면(또는 <b>공격!</b>) 공격합니다. 아군이 휘말리는 칸은 주황색입니다.",
        `${LIMIT}번의 차례가 지나도 승부가 나지 않으면 비깁니다.`,
      ),
    ) +
    part("병사", table(unitRow("knight"), unitRow("archer"), unitRow("fire"), unitRow("healer"), unitRow("assassin"), unitRow("light"))) +
    part(
      "피해",
      table(
        ["기본", "공격 − 방어만큼 체력이 줄어듭니다. 아무리 단단해도 1은 줄어듭니다."],
        ["높이", "더 높은 칸에서 치면 25% 더, 더 낮은 칸에서 치면 25% 덜 들어갑니다."],
        ["방향", "병사는 마지막으로 움직이거나 공격한 쪽을 바라봅니다. 옆에서 치면 25%, 등 뒤에서 치면 50% 더 들어갑니다. 그림자 암살자는 등 뒤에서 두 배로 칩니다."],
        ["범위 공격", "불꽃 마법사의 십자 불길과 빛의 마법사의 빛줄기는 그 안의 모든 병사를 맞힙니다. 아군도, 불꽃 마법사 자신도 맞습니다."],
        ["회복", `치유사는 바로 옆의 다친 아군이나 자신의 체력을 ${HEAL}만큼 되돌립니다. 최대 체력을 넘지는 않습니다.`],
      ),
    ) +
    part(
      "차례와 지형",
      table(
        ["충전", "병사마다 충전이 속도만큼 차오르고, 100이 되면 차례가 옵니다. 속도가 같으면 정해진 순서를 따릅니다."],
        ["대기", "이동도 공격도 하지 않고 대기하면 충전이 50만 줄어, 다음 차례가 더 빨리 옵니다. 무엇이든 했다면 100이 줄어듭니다."],
        ["높이", "칸의 높이는 0부터 3까지입니다. 한 걸음에 오르내릴 수 있는 높이는 병사마다 다릅니다."],
        ["물·바위·나무", "들어갈 수 없습니다. 상대 병사도 지나갈 수 없지만, 아군은 지나갈 수 있습니다. 화살은 무엇이든 넘어 날아가고, 빛줄기는 바위와 나무에서 멈춥니다."],
        ["상태", "병사를 누르거나 길게 누르면 체력, 공격, 방어, 속도, 충전과 바라보는 방향이 나옵니다."],
      ),
    ) +
    part(
      "전장",
      table(
        ["숲 속 공터", "나무 사이의 풀밭입니다. 양옆의 언덕이 높고, 가운데에 작은 연못이 있습니다."],
        ["성벽 앞", "허물어진 성벽이 가운데를 가로지릅니다. 계단으로 성벽 위에 오를 수 있고, 성문은 아래로 지나갑니다."],
        ["강가 다리", "강이 전장을 가릅니다. 건너는 길은 다리 두 개뿐이지만, 화살과 불길은 강을 넘어갑니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "기사를 앞세우고 궁수와 마법사는 그 뒤 높은 곳에 두세요.",
        "적이 바라보는 방향을 살피세요. 그림자 암살자로 등 뒤를 잡으면 한 번에 큰 피해를 줍니다.",
        "불꽃과 빛줄기는 아군도 맞힙니다. 주황색 칸이 보이면 한 번 더 생각하세요.",
        "할 일이 없으면 움직이지 말고 대기하세요. 다음 차례가 더 빨리 옵니다.",
        `비밀 하나: 치유사가 자기 편에 홀로 남으면 <b>천사</b>로 변합니다. ${ANGEL_RANGE}칸 안의 어떤 적이든 한 번에 쓰러뜨리지만, 한 대만 맞아도 쓰러집니다.`,
      ),
    ),
  help: "마우스·터치: 병사 옆의 이동·공격·대기·되돌리기를 누른 뒤 칸을 누릅니다<br>키보드: 방향키로 칸을 고르고 Enter, M 이동 · A 공격 · W 대기 · U 되돌리기 · Q/E 시점",
  sides: SIDES,
  startWord: "전장에 나서기",
};
