import { HOST_ONLY } from "../../net/match";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { eraWar, type State } from "./rules";
import { ABILITY_COOL, ARMY, ERAS, KILL_GOLD, MOMENTUM, QUEUE, RANK_BOOST, RANK_GOLD, RANK_MORE, SELL_BACK, SLOTS, XP_NEXT, type Level } from "./sim";
import { ERA_WAR_COLORS, EraWarView } from "./view";

const NAMES = ["1번", "2번"] as const;
const eras = ERAS.map((e) => e.name).join(" → ");
const unitRows = ERAS.map((e, k) => [`${e.name} 시대`, `${e.units.map((u) => `${u.name}(${u.cost})`).join(" · ")}. 포탑: ${e.turret.name}(${e.turret.cost}). 특수 공격: ${e.ability.name}.${k ? "" : " 처음 시대입니다."}`]);
export const eraWarConfig: PointConfig<State> = {
  game: eraWar,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  computerOnly: true,
  view: (host, quality, _variant, _mode, level, _net, live) => new EraWarView(host, quality, level as Level, live),
  // Over Wi-Fi (와이파이 여럿이) two devices each lead a base, the lane run by the host's (`src/net/live.ts`); the end is the
  // host's move alone. A dropped player's base is played by the host's computer until they come back.
  net: {
    seats: () => NAMES.map((label, p) => ({ label, color: ERA_WAR_COLORS[p], kinds: ["computer"] })),
    toMove: () => HOST_ONLY,
    hint: (_s, seat) => (seat === 0 || seat === 1 ? `내 기지는 ${NAMES[seat]}(${seat ? "파랑" : "빨강"})입니다. 화면 왼쪽이 내 기지입니다. 병사를 뽑아 상대 기지를 무너뜨리세요.` : "구경하는 중입니다."),
    reason: (s) => eraWar.reason(s),
  },
  colors: ERA_WAR_COLORS,
  // Clubs and swords, a sling's whirr and a bow, muskets, guns and cannon, rocks and shells landing, a base struck,
  // a special attack, a new era, a turret built or sold, a soldier out of the door, a base falling.
  knock: ((sound, kind: string, strength) => {
    if (kind === "click") sound.tap();
    else if (kind === "spawn") sound.soft(1, 0.25);
    else if (kind === "melee0") sound.bonk();
    else if (kind === "melee1") sound.clasp();
    else if (kind === "melee2") sound.clack();
    else if (kind === "melee3") sound.thud();
    else if (kind === "shoot-rock") sound.whoosh(0.25);
    else if (kind === "shoot-arrow") sound.bow();
    else if (kind === "shoot-bullet") sound.gunshot("rifle");
    else if (kind === "shoot-ball" || kind === "shoot-shell") sound.explosion();
    else if (kind === "boom") sound.explosion();
    else if (kind === "rock") sound.crunch(true);
    else if (kind === "hit-rock") sound.stone();
    else if (kind === "hit-arrow" || kind === "hit-fallArrow") sound.thud();
    else if (kind === "hit-bullet") sound.knock(2);
    else if (kind === "base") sound.boardKnock(strength);
    else if (kind === "ability") sound.rumble();
    else if (kind === "era") {
      sound.chime();
      sound.heavenly();
    } else if (kind === "turret") sound.reload("done");
    else if (kind === "sell") sound.coin(0.8);
    else if (kind === "die") sound.hollow(strength);
    else if (kind === "fall") {
      sound.crunch(true);
      sound.explosion();
    }
  }) as PointConfig<State>["knock"],
  movingText: "전쟁 중…",
  name: "시대 전쟁",
  english: "Era War",
  number: "NO. 117 — FROM STONE TO STEEL",
  intro: `<p>한 줄기 길의 양 끝에 두 기지가 있습니다.<br>병사를 뽑아 보내고, 포탑을 세우고, 적을 물리친 경험으로 시대를 넘어가세요. ${eras}. 상대 기지를 먼저 무너뜨리면 이깁니다.</p>`,
  meta: "컴퓨터 대전 · 와이파이 여럿이 · 실시간 · 시대 4개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FROM STONE TO STEEL</span>`,
  artClass: "foosball-art",
  artLabel: "시대 전쟁 전장 미리보기",
  tableLabel: "THE LANE OF AGES",
  tableNote: () => "실시간 · 기지가 무너질 때까지",
  firstNote: "내 기지는 왼쪽 빨간 기지입니다. 컴퓨터는 오른쪽 파란 기지에서 옵니다.",
  rulesTitle: "상대 기지를 먼저 무너뜨리세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "길의 왼쪽 끝이 내 기지, 오른쪽 끝이 상대 기지입니다. 와이파이 여럿이에서는 저마다 자기 기지가 왼쪽에 보입니다.",
        `금화로 병사를 뽑습니다. 한 번에 ${QUEUE}명까지 줄을 세울 수 있고, 한 명씩 훈련을 마치면 기지 문으로 나와 상대 쪽으로 걸어갑니다. 길 위에는 한 편에 ${ARMY}명까지 설 수 있습니다.`,
        "병사는 앞에 있는 우리 편 뒤에서 멈추고, 손이 닿는(활과 총은 사정거리 안의) 적이나 적 기지가 있으면 싸웁니다. 원거리 병사는 앞의 우리 편 너머로 쏩니다.",
        `적을 쓰러뜨리면 그 병사 값의 ${Math.round(KILL_GOLD * 100)}%만큼 금화와 경험치를 얻습니다. 내 병사가 쓰러져도 경험치가 조금 쌓입니다. 금화는 시간이 지나면서 조금씩 저절로 들어옵니다.`,
        `경험치가 차면 <b>다음 시대</b> 버튼으로 시대를 넘어갑니다(${eras}, 경험치 ${XP_NEXT.join(" · ")}). 새 시대에는 더 강한 병사와 포탑, 특수 공격을 쓸 수 있고 기지도 더 튼튼해집니다. 이미 줄에 선 병사는 그 시대 병사로 나옵니다.`,
        `마지막 현대 시대에는 남는 금화로 <b>강화</b>를 삽니다(${RANK_GOLD}골드부터 한 번마다 ${RANK_MORE}씩 비싸짐). 강화 한 번마다 그 뒤에 뽑는 병사의 체력과 공격, 특수 공격이 ${Math.round(RANK_BOOST * 100)}%씩 세집니다. 현대 병사는 <b>기세</b>도 있어서 길 가운데를 넘어 적 기지 쪽으로 밀고 들어갈수록 더 세게 싸웁니다(적 기지 앞에서 ${Math.round(MOMENTUM * 100)}% 더).`,
        "상대 기지의 체력을 0으로 만들면 이깁니다. 시간 제한은 없습니다. 기지가 무너질 때까지 싸웁니다.",
      ),
    ) +
    part(
      "포탑과 특수 공격",
      table(
        ["포탑", `기지에 포탑 자리가 ${SLOTS}개 있습니다. 빈자리를 누르면 지금 시대의 포탑을 세웁니다. 포탑은 기지 앞으로 다가오는 가장 가까운 적을 쏩니다. 세운 포탑을 두 번 누르면 값의 ${Math.round(SELL_BACK * 100)}%를 받고 팝니다(새 시대 포탑으로 바꿀 때).`],
        ["특수 공격", `준비되면 버튼이 빛납니다. 누르면 적의 맨 앞 병사들 위로 하늘에서 쏟아집니다(돌, 화살, 포탄, 폭격기의 폭탄). 한 번 쓰면 ${ABILITY_COOL}초 뒤에 다시 쓸 수 있습니다. 기지는 맞지 않습니다.`],
        ["강화", "현대 시대에는 <b>다음 시대</b> 버튼이 <b>강화</b> 버튼이 됩니다. 금화로 사며, 강화한 뒤에 뽑은 병사는 머리 위 별로 표시됩니다."],
      ),
    ) +
    part("시대마다", table(...(unitRows as [string, string][]))) +
    part(
      "조작",
      table(
        ["병사", "아래 막대의 병사 버튼(이름과 값)을 누르면 줄에 섭니다. 옆의 작은 칸들이 줄이고, 막대가 훈련 진행입니다. 키보드 1 2 3."],
        ["포탑", "포탑 칸을 누르면 세우고, 세운 칸을 한 번 더 누른 뒤 다시 누르면 팝니다. 키보드 Z X C(Shift와 함께 누르면 팔기)."],
        ["특수 공격 · 다음 시대(강화)", "오른쪽 끝의 두 버튼. 키보드 Q(또는 스페이스)와 E."],
        ["화면", "화면은 싸움이 벌어지는 곳을 따라갑니다. 화면을 옆으로 끌거나 A D(← →) 키로 다른 곳을 볼 수 있고, 위쪽 띠 지도를 누르면 그곳으로 갑니다. 조금 지나면 다시 싸움터를 따라갑니다."],
        ["일시정지", "오른쪽 위 버튼이나 P 키."],
      ),
    ) +
    part(
      "모드와 레벨",
      table(
        ["컴퓨터 대전", "내가 왼쪽 빨간 기지, 컴퓨터가 오른쪽 파란 기지입니다."],
        ["와이파이 여럿이", "두 기기가 기지를 하나씩 맡습니다. 방장이 1번(빨강), 들어온 사람이 2번(파랑)이고, 저마다 자기 기지를 왼쪽에 두고 봅니다. 한 사람이 일시정지하면 모두 멈춥니다. 연결이 끊긴 사람의 기지는 다시 들어올 때까지 방장 기기의 컴퓨터가 맡습니다."],
        ["쉬움", "컴퓨터가 느긋하게 아무 병사나 뽑고, 시대도 늦게 넘어가며 강화도 늦습니다. 금화도 덜 법니다."],
        ["보통", "알맞게 섞어 뽑고 포탑을 세웁니다."],
        ["어려움", "앞줄과 원거리 병사를 맞춰 뽑고, 큰 병사로 밀고, 특수 공격을 적이 몰린 곳에 쓰며, 남는 금화로 바로 강화합니다. 금화도 더 법니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "근접 병사 두셋 뒤에 원거리 병사 하나를 두면 오래 버팁니다.",
        "경험치가 차면 바로 다음 시대로 넘어가세요. 한 시대 차이면 병사 힘이 크게 납니다.",
        "적이 길 가운데에 몰렸을 때 특수 공격을 쓰면 한 번에 많이 쓰러뜨립니다.",
        "포탑은 기지 앞을 지켜 줍니다. 금화가 남으면 세워 두세요.",
        "현대 시대에 금화가 쌓이면 강화하세요. 강화가 앞서는 쪽이 길을 밀고 나갑니다.",
      ),
    ),
  help: "병사 1 2 3 · 포탑 Z X C (Shift: 팔기) · 특수 공격 Q · 다음 시대(강화) E<br>화면 옮기기: 끌기 또는 A D(← →)",
  sides: ["빨강", "파랑"],
  startWord: "전쟁 시작",
};
