import type { CardSkin } from "../cards/table-view";
import { CARD, drawBack, drawFace } from "../cards/faces";
import type { BettingConfig } from "../../ui/betting-game";
import { poker } from "./game";
import { ANTE, START_CHIPS, type State } from "./rules";

/** The shared deck (see `../cards/faces.ts`). */
export const pokerSkin: CardSkin = {
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
  rules: `<ol><li>판마다 모두 기본 판돈 ${ANTE}을 내고 세 장을 엎어서 받습니다. 그중 한 장을 골라 모두에게 공개합니다.</li><li>보이는 카드가 가장 좋은 사람부터 베팅합니다. <b>체크/콜</b>, <b>하프</b>(판돈의 절반을 더 걸기, 한 번에 세 번까지), <b>올인</b>, <b>다이</b> 중 하나를 고릅니다.</li><li>네 번째, 다섯 번째, 여섯 번째 카드는 펴서 받고 일곱 번째 카드는 엎어서 받으며, 받을 때마다 베팅합니다. 일곱 번째 카드는 덮개를 아래로 밀어(또는 버튼으로) 확인합니다.</li><li>한 명만 남으면 그 사람이, 끝까지 가면 일곱 장으로 만든 가장 좋은 다섯 장이 높은 사람이 판돈을 가져갑니다.</li></ol><h3>족보 (높은 순)</h3><dl class="piece-moves"><dt>로열 스트레이트 플러시</dt><dd>같은 무늬의 10·J·Q·K·A.</dd><dt>스트레이트 플러시</dt><dd>같은 무늬로 숫자가 이어지는 다섯 장.</dd><dt>포카드</dt><dd>같은 숫자 네 장.</dd><dt>풀하우스</dt><dd>같은 숫자 세 장 + 같은 숫자 두 장.</dd><dt>플러시</dt><dd>같은 무늬 다섯 장.</dd><dt>스트레이트</dt><dd>숫자가 이어지는 다섯 장. A-2-3-4-5가 가장 낮습니다.</dd><dt>트리플</dt><dd>같은 숫자 세 장.</dd><dt>투페어</dt><dd>같은 숫자 두 장이 두 쌍.</dd><dt>원페어</dt><dd>같은 숫자 두 장.</dd><dt>하이카드</dt><dd>아무것도 없을 때. 가장 높은 카드로 겨룹니다.</dd></dl><p>같은 족보끼리는 족보를 이루는 숫자, 그다음 남은 카드의 숫자가 높은 쪽이 이깁니다(A가 가장 높음). 무늬에는 순위가 없으며 완전히 같으면 판돈을 나눕니다.</p><p>다이하면 카드를 엎어 둡니다. 칩이 모자라 올인하면 낸 만큼만 겨루고, 나머지는 따로 겨룹니다. 가상 칩만 쓰며 새로고침하면 처음으로 돌아갑니다.</p>`,
};
