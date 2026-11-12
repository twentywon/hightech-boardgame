import { part, steps, notes, table } from "../../ui/guide";
import type { CardSkin } from "../cards/table-view";
import { CARD, drawBack, drawFace } from "../cards/faces";
import type { BettingConfig } from "../../ui/betting-game";
import { poker } from "./game";
import { ANTE, START_CHIPS, type State } from "./rules";

/** The shared deck (see `../cards/faces.ts`). */
export const pokerSkin: CardSkin = {
  secretLeft: true,
  ...CARD,
  lines: ["세븐 포커", "일곱 장 가운데 다섯 장으로 겨룹니다"],
  back: drawBack,
  face: drawFace,
};
export const pokerConfig: BettingConfig<State> = {
  game: poker,
  skin: pokerSkin,
  name: "세븐 포커",
  english: "Seven-Card Stud",
  intro: `<p>일곱 장 가운데 가장 좋은 다섯 장.<br>상대의 보이는 카드를 읽고 판돈을 겨루세요.</p><ul class="rule-list"><li>처음 세 장 가운데 한 장을 골라 공개합니다</li><li>네 번째–여섯 번째는 펴서, 일곱 번째는 엎어서 받아 직접 확인합니다</li><li>카드를 받을 때마다 베팅합니다</li></ul>`,
  meta: `나 + 컴퓨터 1–3명 · 카드 52장 · 시작 칩 ${START_CHIPS.toLocaleString("ko-KR")} · 기본 판돈 ${ANTE}`,
  art: `<div class="pk-mini"><i class="bj-mini-card back"></i><i class="bj-mini-card back"></i><i class="bj-mini-card">A<b>♠</b></i><i class="bj-mini-card red">A<b>♥</b></i><i class="bj-mini-card">K<b>♣</b></i></div><span>SEVEN CARDS, FIVE COUNT</span>`,
  artLabel: "세븐 포커 테이블 미리보기",
  artClass: "poker-art",
  tableLabel: "THE POKER TABLE",
  tableNote: "세븐 카드 스터드",
  dealWord: "카드 받기",
  peekWord: "마지막 카드",
  rulesTitle: "일곱 장으로 만드는 다섯 장",
  rules: `${part("기본 규칙", steps(`판마다 모두 기본 판돈 ${ANTE}을 내고 세 장을 엎어서 받습니다. 그중 한 장을 골라 모두에게 공개합니다.`, "보이는 카드가 가장 좋은 사람부터 베팅합니다.", "네 번째·다섯 번째·여섯 번째 카드는 펴서, 일곱 번째 카드는 엎어서 받습니다. 받을 때마다 베팅합니다.", "한 명만 남으면 그 사람이 판돈을 가져갑니다.", "끝까지 가면 일곱 장으로 만든 <b>가장 좋은 다섯 장</b>이 높은 사람이 가져갑니다."))}${part("베팅", table(["체크 / 콜", "앞사람이 건 만큼 맞춥니다. 걸린 것이 없으면 그냥 넘깁니다."], ["하프", "판돈의 절반을 더 겁니다. 한 번의 베팅 차례에 세 번까지입니다."], ["올인", "가진 칩을 모두 겁니다. 낸 만큼만 겨루고 나머지는 따로 겨룹니다."], ["다이", "포기합니다. 카드는 엎어 둡니다."]))}<h3>족보 (높은 순)</h3><dl class="piece-moves"><dt>로열 스트레이트 플러시</dt><dd>같은 무늬의 10·J·Q·K·A.</dd><dt>스트레이트 플러시</dt><dd>같은 무늬로 숫자가 이어지는 다섯 장.</dd><dt>포카드</dt><dd>같은 숫자 네 장.</dd><dt>풀하우스</dt><dd>같은 숫자 세 장 + 같은 숫자 두 장.</dd><dt>플러시</dt><dd>같은 무늬 다섯 장.</dd><dt>스트레이트</dt><dd>숫자가 이어지는 다섯 장. A-2-3-4-5가 가장 낮습니다.</dd><dt>트리플</dt><dd>같은 숫자 세 장.</dd><dt>투페어</dt><dd>같은 숫자 두 장이 두 쌍.</dd><dt>원페어</dt><dd>같은 숫자 두 장.</dd><dt>하이카드</dt><dd>아무것도 없을 때. 가장 높은 카드로 겨룹니다.</dd></dl>${part("같은 족보일 때", notes("족보를 이루는 숫자가 높은 쪽이 이깁니다. A가 가장 높습니다.", "그것도 같으면 남은 카드의 숫자로 겨룹니다.", "무늬에는 순위가 없습니다. 완전히 같으면 판돈을 나눕니다."))}${part("조작", table(["버튼", "내 자리 오른쪽의 버튼으로 베팅합니다."], ["카드 고르기", "공개할 카드는 판 위의 카드를 직접 눌러도 됩니다."], ["일곱 번째 카드", "덮개를 아래로 밀거나 버튼을 눌러 확인합니다."], ["새 게임", "설정 창이 뜹니다. 상대 수를 고르고 칩을 처음으로 되돌립니다."]))}${part("그 밖에", notes("가상 칩만 쓰며 저장하지 않습니다. 새로고침하면 처음으로 돌아갑니다."))}`,
};
