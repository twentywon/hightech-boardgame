import { roundRect, type CardSkin } from "../cards/table-view";
import type { BettingConfig } from "../../ui/betting-game";
import { poker } from "./game";
import { ANTE, START_CHIPS, type State } from "./rules";

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SYMBOL = '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
export const pokerSkin: CardSkin = {
  width: 1,
  height: 1.4,
  pixels: [300, 420],
  lines: ["세븐 포커", "일곱 장 가운데 다섯 장으로 겨룹니다"],
  back(ctx, w, h) {
    ctx.fillStyle = "#f4efe2";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#22355c";
    roundRect(ctx, 16, 16, w - 32, h - 32, 14);
    ctx.fill();
    ctx.strokeStyle = "#d9b96a";
    ctx.lineWidth = 2;
    for (let i = -h; i < w + h; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, 16);
      ctx.lineTo(i + h, h - 16);
      ctx.moveTo(i + h, 16);
      ctx.lineTo(i, h - 16);
      ctx.stroke();
    }
    ctx.fillStyle = "#f4efe2";
    ctx.fillRect(0, 0, w, 16);
    ctx.fillRect(0, h - 16, w, 16);
    ctx.fillRect(0, 0, 16, h);
    ctx.fillRect(w - 16, 0, 16, h);
  },
  face(ctx, w, h, key) {
    const suit = key.slice(-1),
      rank = key.slice(0, -1);
    ctx.fillStyle = "#fbf8f0";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#cfc8b8";
    ctx.lineWidth = 6;
    roundRect(ctx, 5, 5, w - 10, h - 10, 20);
    ctx.stroke();
    ctx.fillStyle = suit === "H" || suit === "D" ? "#c8321f" : "#16181a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const index = () => {
      ctx.font = `700 ${rank === "10" ? 76 : 88}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(rank, 58, 66);
      ctx.font = `70px ${SYMBOL}`;
      ctx.fillText(GLYPH[suit], 58, 146);
    };
    index();
    ctx.save();
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    index();
    ctx.restore();
    ctx.font = `170px ${SYMBOL}`;
    ctx.fillText(GLYPH[suit], 168, 222);
  },
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
  rules: `<ol><li>판마다 모두 기본 판돈 ${ANTE}을 내고 세 장을 엎어서 받습니다. 그중 한 장을 골라 모두에게 공개합니다.</li><li>보이는 카드가 가장 좋은 사람부터 베팅합니다. <b>체크/콜</b>, <b>하프</b>(판돈의 절반을 더 걸기, 한 번에 세 번까지), <b>올인</b>, <b>다이</b> 중 하나를 고릅니다.</li><li>네 번째, 다섯 번째, 여섯 번째 카드는 펴서 받고 일곱 번째 카드는 엎어서 받으며, 받을 때마다 베팅합니다. 일곱 번째 카드는 덮개를 아래로 밀어(또는 버튼으로) 확인합니다.</li><li>한 명만 남으면 그 사람이, 끝까지 가면 일곱 장으로 만든 가장 좋은 다섯 장이 높은 사람이 판돈을 가져갑니다.</li></ol><p><b>족보</b>(높은 순): 로열 스트레이트 플러시 › 스트레이트 플러시 › 포카드 › 풀하우스 › 플러시 › 스트레이트 › 트리플 › 투페어 › 원페어 › 하이카드. A-2-3-4-5는 가장 낮은 스트레이트입니다. 무늬에는 순위가 없으며 족보가 완전히 같으면 판돈을 나눕니다.</p><p>다이하면 카드를 엎어 둡니다. 칩이 모자라 올인하면 낸 만큼만 겨루고, 나머지는 따로 겨룹니다. 가상 칩만 쓰며 새로고침하면 처음으로 돌아갑니다.</p>`,
};
