import { part, steps, notes, table } from "../../ui/guide";
import { roundRect, type CardSkin } from "../cards/table-view";
import type { BettingConfig } from "../../ui/betting-game";
import { seotda } from "./game";
import { ANTE, START_CHIPS, type State } from "./rules";

// The card pictures, inlined so the game still needs no network requests.
// Keys are the painter's face keys: month and the first letter of the kind.
const pictures = new Map<string, HTMLImageElement>();
const sources = import.meta.glob<string>("./cards/*.webp", {
  query: "?inline",
  import: "default",
  eager: true,
});
export const picture = (month: number, kind: "gwang" | "yeol" | "plain") =>
  sources[`./cards/${month}-${kind}.webp`];
// Decoded once when the app loads, long before a table is opened.
if (typeof Image !== "undefined")
  for (const [path, url] of Object.entries(sources)) {
    const [, month, kind] = path.match(/(\d+)-(\w)/)!,
      image = new Image();
    image.src = url;
    pictures.set(`${month}${kind}`, image);
  }
// Fallback colours for a card whose picture has not decoded: one per month.
const MONTH = ["", "#2f6d4f", "#c0477a", "#d86a8c", "#6a4a8c", "#3f6fb0", "#b0355a", "#a8452f", "#5d6470", "#c9952b", "#b3441f"];
/**
 * Hwatu cards. The pictures come from Wikimedia Commons (see
 * public/hwatu-license.txt); a small month number is added for readability.
 */
export const seotdaSkin: CardSkin = {
  width: 0.9,
  height: 1.476,
  pixels: [250, 410],
  lines: ["섯다", "두 장의 족보로 겨룹니다"],
  compact: true,
  secretLeft: true,
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
      kind = key.slice(-1),
      image = pictures.get(key);
    if (image?.complete && image.naturalWidth) {
      ctx.drawImage(image, 0, 0, w, h);
      // The pictures carry no numerals; mark the month in a corner.
      ctx.beginPath();
      ctx.arc(w - 40, h - 40, 27, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(22, 24, 26, 0.86)";
      ctx.fill();
      ctx.fillStyle = "#fbf7ec";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${month === 10 ? 28 : 34}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(String(month), w - 40, h - 38);
      return;
    }
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
  intro: `<p>화투 두 장으로 겨루는 족보.<br>두 장 섯다와 세 장 섯다를 고를 수 있습니다.</p><ul class="rule-list"><li>광땡 &gt; 땡 &gt; 알리·독사·구삥·장삥·장사·세륙 &gt; 끗</li><li>땡잡이·암행어사·구사 같은 특수 족보가 있습니다</li><li>체크·콜·하프·올인·다이로 베팅합니다</li></ul>`,
  meta: `나 + 컴퓨터 1–3명 · 화투 20장 · 시작 칩 ${START_CHIPS.toLocaleString("ko-KR")} · 기본 판돈 ${ANTE}`,
  art: `<div class="sd-mini"><i class="sd-mini-card back"></i><img class="sd-mini-card" src="${picture(3, "gwang")}" alt=""><img class="sd-mini-card" src="${picture(8, "gwang")}" alt=""></div><span>TWO CARDS, ONE CALL</span>`,
  artLabel: "섯다 테이블 미리보기",
  artClass: "seotda-art",
  tableLabel: "THE SEOTDA TABLE",
  tableNote: "화투 20장 · 두 장 또는 세 장",
  dealWord: "패 받기",
  peekWord: "세 번째 패",
  variants: [
    { value: "two", label: "두 장 섯다" },
    { value: "three", label: "세 장 섯다" },
  ],
  rulesTitle: "두 장으로 겨루는 족보",
  rules: `${part("기본 규칙", steps(`판마다 모두 기본 판돈 ${ANTE}을 내고 화투 두 장을 받습니다. 내 패만 볼 수 있습니다.`, "차례가 오면 베팅을 고릅니다.", "한 명만 남으면 그 사람이 판돈을 가져갑니다.", "둘 이상 남으면 패를 공개해 <b>족보</b>가 높은 사람이 가져갑니다."))}${part("베팅", table(["체크 / 콜", "앞사람이 건 만큼 맞춥니다. 걸린 것이 없으면 그냥 넘깁니다."], ["하프", "판돈의 절반을 더 겁니다. 한 번의 베팅 차례에 세 번까지입니다."], ["올인", "가진 칩을 모두 겁니다. 칩이 모자라면 낸 만큼만 겨룹니다."], ["다이", "포기합니다. 패는 엎어 둡니다."]))}${part("세 장 섯다", steps("두 장을 받아 그중 한 장을 골라 공개하고 베팅합니다.", "세 번째 패를 엎어서 받습니다. 덮개를 아래로 밀거나 버튼을 눌러 확인합니다.", "세 장을 든 채 한 번 더 베팅합니다.", "베팅이 모두 끝나면 <b>맨 마지막에</b> 족보로 쓸 두 장을 골라 겨룹니다."))}<h3>족보 (높은 순)</h3><dl class="piece-moves"><dt>38광땡</dt><dd>3광 + 8광. 가장 높은 패입니다.</dd><dt>18광땡</dt><dd>1광 + 8광.</dd><dt>13광땡</dt><dd>1광 + 3광.</dd><dt>장땡</dt><dd>10월 두 장.</dd><dt>9땡 – 1땡</dt><dd>같은 월 두 장. 월이 높을수록 높습니다.</dd><dt>알리</dt><dd>1월 + 2월.</dd><dt>독사</dt><dd>1월 + 4월.</dd><dt>구삥</dt><dd>1월 + 9월.</dd><dt>장삥</dt><dd>1월 + 10월.</dd><dt>장사</dt><dd>4월 + 10월.</dd><dt>세륙</dt><dd>4월 + 6월.</dd><dt>갑오</dt><dd>두 월을 더한 끝자리가 9(9끗).</dd><dt>8끗 – 1끗</dt><dd>두 월을 더한 끝자리. 클수록 높습니다.</dd><dt>망통</dt><dd>끝자리가 0. 가장 낮은 패입니다.</dd></dl><h3>특수 족보</h3><dl class="piece-moves"><dt>땡잡이</dt><dd>3광 + 7열. 1땡–9땡을 이깁니다. 그 밖에는 망통입니다.</dd><dt>암행어사</dt><dd>4열 + 7열. 13광땡·18광땡을 이깁니다. 그 밖에는 1끗입니다.</dd><dt>구사</dt><dd>4월 + 9월. 상대 최고 패가 알리 이하이면 판을 무효로 하고 재경기합니다. 그 밖에는 3끗입니다.</dd><dt>멍텅구리구사</dt><dd>4열 + 9열. 상대 최고 패가 9땡 이하이면 재경기합니다. 그 밖에는 3끗입니다.</dd></dl>${part("조작", table(["버튼", "내 자리 오른쪽의 버튼으로 베팅합니다."], ["패 고르기", "공개할 패나 족보로 쓸 패는 판 위의 패를 직접 눌러도 됩니다."], ["새 게임", "설정 창이 뜹니다. 상대 수와 두 장·세 장을 고르고 칩을 처음으로 되돌립니다."]))}${part("그 밖에", notes("내 자리 쪽에 지금 만들 수 있는 가장 높은 족보 이름이 나옵니다.", "최고 패가 같으면 판돈을 그대로 두고 그 사람들끼리 재경기합니다.", "가상 칩만 쓰며 저장하지 않습니다. 새로고침하면 처음으로 돌아갑니다."))}<p class="credit">화투 그림: Mliu92·Spenĉjo, 위키미디어 공용, CC BY-SA 4.0. 오른쪽 아래 숫자는 이 게임에서 덧붙인 월 표시입니다.</p>`,
};
