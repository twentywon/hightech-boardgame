import { roundRect, type CardSkin } from "../cards/table-view";
import type { BettingConfig } from "../../ui/betting-game";
import { seotda } from "./game";
import { ANTE, START_CHIPS, type State } from "./rules";

// One motif colour per month, in the spirit of the twelve-month flower cards.
const MONTH = ["", "#2f6d4f", "#c0477a", "#d86a8c", "#6a4a8c", "#3f6fb0", "#b0355a", "#a8452f", "#5d6470", "#c9952b", "#b3441f"];
/** Hwatu-style cards drawn from scratch: a month numeral and a mark for its kind. */
export const seotdaSkin: CardSkin = {
  width: 0.92,
  height: 1.44,
  pixels: [230, 360],
  lines: ["섯다", "두 장의 족보로 겨룹니다"],
  compact: true,
  back(ctx, w, h) {
    ctx.fillStyle = "#8f2416";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#5d150c";
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.strokeStyle = "rgba(255, 220, 190, 0.18)";
    ctx.lineWidth = 3;
    for (let i = -h; i < w; i += 22) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + h, h);
      ctx.stroke();
    }
  },
  face(ctx, w, h, key) {
    const month = parseInt(key, 10),
      kind = key.slice(-1);
    ctx.fillStyle = "#fbf7ec";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#8f2416";
    ctx.lineWidth = 12;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // A band of the month's colour across the lower half.
    ctx.fillStyle = MONTH[month];
    roundRect(ctx, 26, h * 0.5, w - 52, h * 0.36, 16);
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#16181a";
    ctx.font = `800 ${month === 10 ? 110 : 132}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(String(month), w / 2, h * 0.27);
    const mark = kind === "g" ? "光" : kind === "y" ? "열" : "";
    if (mark) {
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.68, 46, 0, Math.PI * 2);
      ctx.fillStyle = kind === "g" ? "#f3d27a" : "#fbf7ec";
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = kind === "g" ? "#a3791b" : "#16181a";
      ctx.stroke();
      ctx.fillStyle = "#16181a";
      ctx.font = '800 52px "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
      ctx.fillText(mark, w / 2, h * 0.685);
    }
  },
};
export const seotdaConfig: BettingConfig<State> = {
  game: seotda,
  skin: seotdaSkin,
  name: "섯다",
  english: "Seotda",
  intro: `<p>화투 두 장, 한 번의 승부.<br>족보가 높은 쪽이 판돈을 가져갑니다.</p><ul class="rule-list"><li>광땡 &gt; 땡 &gt; 알리·독사·구삥·장삥·장사·세륙 &gt; 끗</li><li>땡잡이·암행어사·구사 같은 특수 족보가 있습니다</li><li>체크·콜·하프·올인·다이로 베팅합니다</li></ul>`,
  meta: `나 + 컴퓨터 1–3명 · 화투 20장 · 시작 칩 ${START_CHIPS.toLocaleString("ko-KR")} · 기본 판돈 ${ANTE}`,
  art: `<div class="sd-mini"><i class="sd-mini-card back"></i><i class="sd-mini-card">3<b>光</b></i><i class="sd-mini-card">8<b>光</b></i></div><span>TWO CARDS, ONE CALL</span>`,
  artLabel: "섯다 테이블 미리보기",
  artClass: "seotda-art",
  tableLabel: "THE SEOTDA TABLE",
  tableNote: "화투 20장 · 2장 섯다",
  dealWord: "패 받기",
  rulesTitle: "두 장으로 겨루는 족보",
  rules: `<ol><li>판마다 모두 기본 판돈 ${ANTE}을 내고 화투 두 장을 받습니다. 내 패만 볼 수 있습니다.</li><li>차례가 오면 <b>체크/콜</b>(맞추기), <b>하프</b>(판돈의 절반을 더 걸기, 한 번에 세 번까지), <b>올인</b>, <b>다이</b>(포기) 중 하나를 고릅니다.</li><li>한 명만 남으면 그 사람이 판돈을 가져갑니다. 둘 이상 남으면 패를 공개해 족보를 겨룹니다.</li></ol><p><b>족보</b>(높은 순): 38광땡 › 18광땡 › 13광땡 › 장땡 › 9땡 … 1땡 › 알리(1·2) › 독사(1·4) › 구삥(1·9) › 장삥(1·10) › 장사(4·10) › 세륙(4·6) › 갑오(9끗) › 8끗 … 1끗 › 망통(0끗).</p><p><b>특수 족보</b>: 땡잡이(3광·7열)는 1–9땡을 이기고 그 밖에는 망통입니다. 암행어사(4열·7열)는 13·18광땡을 이기고 그 밖에는 1끗입니다. 구사(4·9)는 상대 최고 패가 알리 이하일 때, 멍텅구리구사(4열·9열)는 9땡 이하일 때 판을 무효로 하고 재경기합니다.</p><p>최고 패가 같으면 판돈을 그대로 두고 그 사람들끼리 재경기합니다. 칩이 모자라 올인하면 낸 만큼만 겨룹니다. 가상 칩만 쓰며 새로고침하면 처음으로 돌아갑니다.</p>`,
};
