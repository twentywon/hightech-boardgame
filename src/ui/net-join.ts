import { cleanName } from "../net/room";
import { webrtcAvailable } from "../net/peer";
import { cameraProblem, scan, type CameraTrouble } from "../net/scan";
import { codeProblem, PREFIX } from "../net/sdp";
import { APP_VERSION } from "../net/protocol";
import { appLan, readRoomCode, typedAddress, LAN_PORT, type RoomAd } from "../net/lan";
import { routeRoom, routeText, type Playable } from "../net/route";
import { EDITION } from "../core/catalog";
import { typedName, type JoinPlan } from "./net-lobby";

/**
 * The collection's 참가하기 (the user asked: "메인화면에 참가하기 버튼을 만들어서 게임에 관계없이 방장이 생성한 qr을 찍으면 그
 * 게임의 방에 들어가게"): whatever game the host chose, its code or its room leads straight to that game's table in
 * Wi-Fi mode as a guest, with no setup window between (the host decides the variant and options).
 *
 * Inside the Android app (`window.wtgNet`): QR 찍기 reads the host's room code (`roomCode`), and below it every
 * room on the Wi-Fi is listed whatever its game (another version's, edition's or a game this edition lacks greyed
 * with the reason); a pasted room code or the address of a listed room joins too. In a plain browser the guest's side
 * of the two-way QR: the host's invite (which names its game, `tagInvite`) read by the camera or pasted; the answer
 * is then shown in that game's room window. The window only routes: `go` opens the game, and its room window joins
 * by the `JoinPlan` (`planJoin`).
 */
export interface JoinWindow {
  /** The games of this edition and whether each has Wi-Fi play. */
  games: Playable[];
  /** A room was chosen: open its game as a guest that joins it at once. */
  go(plan: JoinPlan): void;
}
/** Whether this page can take part in a room from the collection (the app's rooms, or the two-way QR way). */
export const canJoin = () => !!appLan({ app: APP_VERSION, edition: EDITION }) || webrtcAvailable();

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ELSEWHERE = "아래 방 목록에서 방을 누르거나, 방장의 기기에 나온 주소를 주소 입력에 넣어 주세요.";
const CAMERA_WORDS: Record<CameraTrouble, string> = {
  unsupported: `이 기기에서는 카메라로 찍을 수 없습니다. ${ELSEWHERE}`,
  denied: `카메라 사용이 허락되지 않았습니다. ${ELSEWHERE} 찍으려면 휴대폰 설정에서 이 앱의 카메라를 허용해 주세요.`,
  missing: `이 기기에서 카메라를 찾지 못했습니다. ${ELSEWHERE}`,
  broken: `카메라를 켤 수 없습니다. ${ELSEWHERE}`,
};
/** The picture on the QR 찍기 button: a QR code's three corners and a few modules. */
export const QR_MARK = `<svg class="net-qr-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 3h7v7H3zm2 2v3h3V5zm9-2h7v7h-7zm2 2v3h3V5zM3 14h7v7H3zm2 2v3h3v-3zm9-2h2v2h-2zm2 2h2v2h-2zm2-2h3v2h-3zm-4 4h2v3h-2zm4 0h3v3h-3zm-2 2h2v1h-2z"/></svg>`;

export function openJoin(o: JoinWindow) {
  const lan = appLan({ app: APP_VERSION, edition: EDITION });
  let closed = false,
    scanning = false,
    note = "",
    stopScan: (() => void) | null = null;
  const d = document.createElement("dialog");
  d.className = "setup-dialog net-lobby net-join";
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES · 와이파이 여럿이</div><h2>참가하기</h2><p class="setup-note">${
    lan
      ? "방장이 고른 게임으로 바로 들어갑니다. 방장의 기기에 나온 QR 코드를 찍거나, 같은 와이파이의 방을 누르세요."
      : "방장의 기기에 나온 초대 QR 코드를 읽거나 초대 코드를 붙여 넣으면, 방장이 고른 게임으로 바로 들어갑니다."
  }</p><div class="dialog-body net-body"></div><div class="dialog-actions"><button id="net-cancel">← 뒤로</button></div>`;
  const body = d.querySelector<HTMLElement>(".net-body")!;
  document.body.append(d);
  // The rooms on the Wi-Fi are looked for while the window is open; the list is drawn again as they come and go.
  const stopFind = lan?.find() ?? null,
    unwatch = lan?.watch(() => {
      const list = body.querySelector(".net-rooms");
      if (!list || closed) return;
      list.outerHTML = roomList();
      bindRooms();
    });
  const finish = () => {
    if (closed) return;
    closed = true;
    stopScan?.();
    stopFind?.();
    unwatch?.();
    if (d.open) d.close();
    d.remove();
  };
  d.querySelector<HTMLButtonElement>("#net-cancel")!.onclick = finish;
  d.addEventListener("close", finish);
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish();
  });
  const name = () => cleanName(body.querySelector<HTMLInputElement>("#net-name")?.value ?? "");
  /** The room's game opened as a guest that joins it. */
  const go = (plan: Omit<JoinPlan, "name">) => {
    const who = name();
    finish();
    o.go({ ...plan, name: who });
  };
  const say = (text: string) => {
    note = text;
    const line = body.querySelector(".net-pair-note");
    if (line) line.textContent = text;
  };

  const roomItem = (ad: RoomAd) => {
    const route = routeRoom(ad, lan!.self, o.games),
      problem = "problem" in route ? route.problem : "";
    return `<li><button class="net-room${problem ? " other" : ""}" data-room="${escape(ad.name)}" ${problem ? "disabled" : ""}><span class="net-room-title"><b>${escape(ad.title)}</b></span><span class="net-room-meta">${escape(ad.host)}의 방 · ${ad.people}/${ad.seats}명${ad.playing ? " · 게임 중" : ""}</span>${problem ? `<small class="net-room-why">${escape(problem.replace(/\. 두 기기에.*$/, ""))}</small>` : `<span class="net-room-go">들어가기</span>`}</button></li>`;
  };
  const roomList = () => {
    const rooms = lan!.list("").map((ad) => ({ ad, open: "game" in routeRoom(ad, lan!.self, o.games) }));
    rooms.sort((a, b) => Number(b.open) - Number(a.open));
    return `<ul class="net-rooms" aria-label="같은 와이파이의 방">${
      rooms.length
        ? rooms.map((r) => roomItem(r.ad)).join("")
        : `<li class="net-rooms-empty">${escape(lan!.findProblem || "방을 찾는 중… 같은 와이파이에서 방장이 게임을 고르고 와이파이 여럿이 → 방 만들기를 누르면 여기에 나옵니다.")}</li>`
    }</ul>`;
  };
  function bindRooms() {
    body.querySelectorAll<HTMLButtonElement>(".net-room").forEach(
      (b) =>
        (b.onclick = () => {
          const ad = lan?.rooms.get(b.dataset.room ?? "");
          if (!ad) return;
          const route = routeRoom(ad, lan!.self, o.games);
          if ("game" in route) go({ game: route.game, address: ad.address });
          else say(route.problem);
        }),
    );
  }
  /** A scanned or pasted code: its game opened, or the words why not. */
  function take(text: string) {
    const taken = routeText(text, { app: APP_VERSION, edition: EDITION }, o.games);
    if (taken.kind === "room") {
      if (!lan) return say("방 주소 QR 코드는 앱끼리만 씁니다. 방장의 기기에서 다음 사람 연결을 누르고 그 초대 QR 코드를 읽어 주세요.");
      return go({ game: taken.game, address: taken.address });
    }
    if (taken.kind === "invite") return webrtcAvailable() ? go({ game: taken.game, offer: taken.code }) : say("이 기기에서는 초대 코드로 연결할 수 없습니다. 방 목록이나 방 주소 QR 코드를 써 주세요.");
    say(taken.problem);
  }

  function render() {
    if (closed) return;
    stopScan?.();
    stopScan = null;
    const typed = body.querySelector<HTMLInputElement>("#net-name")?.value ?? typedName(),
      address = body.querySelector<HTMLInputElement>("#net-address-in")?.value ?? "",
      pasted = body.querySelector<HTMLTextAreaElement>("#net-offer-in")?.value ?? "";
    const nameField = `<label class="net-name-field">내 이름<input id="net-name" maxlength="12" value="${escape(typed)}" placeholder="플레이어" autocomplete="nickname"></label>`;
    const noteLine = `<p class="net-pair-note" role="status">${escape(note)}</p>`;
    if (lan) {
      const camera = scanning
        ? `<div class="net-scan net-room-scan"><video playsinline muted></video><p>방장의 기기에 나온 QR 코드를 화면에 비추세요.</p><button id="net-scan-stop" class="net-scan-stop">그만 찍기</button></div>`
        : `<button id="net-scan-room" class="net-scan-room net-scan-big">${QR_MARK}<span><b>QR 찍기</b><small>방장의 기기에 나온 QR 코드를 찍으면 그 게임의 방으로 바로 들어갑니다</small></span></button>`;
      body.innerHTML = `${nameField}<section class="net-find net-join-find"><div class="net-join-camera">${camera}</div><div class="net-join-rooms"><div class="net-find-head"><h3>같은 와이파이의 방</h3><span class="net-find-tools"><button id="net-refind" class="net-link">다시 찾기</button></span></div>${roomList()}<div class="net-dial"><label for="net-address-in">주소 입력</label><input id="net-address-in" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="192.168.0.12:${LAN_PORT}"><button id="net-dial" class="net-go">연결</button></div>${noteLine}</div></section>`;
    } else {
      body.innerHTML = `${nameField}<section class="net-pair net-join-pair"><ol class="net-steps"><li>방장: 게임을 고르고 와이파이 여럿이 → 방 만들기 → 다음 사람 연결을 누릅니다.</li><li>여기서 방장의 기기에 나온 초대 QR 코드를 읽거나, 초대 코드를 붙여 넣고 들어가기를 누릅니다.</li><li>그 게임의 방이 열리고 답 QR 코드가 나옵니다. 방장의 기기로 읽게 하면 연결됩니다.</li></ol><div class="net-paste"><label>방장의 초대 코드<textarea id="net-offer-in" rows="2" spellcheck="false" autocapitalize="characters" placeholder="WTGG:…/${PREFIX}…"></textarea></label><div class="net-paste-actions"><button class="net-scan-start">카메라로 읽기</button><button id="net-accept" class="net-go">들어가기</button></div><div class="net-scan" hidden><video playsinline muted></video><button class="net-scan-stop">그만 읽기</button></div></div>${noteLine}</section>`;
    }
    const field = body.querySelector<HTMLInputElement>("#net-address-in");
    if (field) field.value = address;
    const paste = body.querySelector<HTMLTextAreaElement>("#net-offer-in");
    if (paste) paste.value = pasted;
    bind();
  }
  function bind() {
    const press = (selector: string, fn: () => void) => {
      const b = body.querySelector<HTMLButtonElement>(selector);
      if (b) b.onclick = fn;
    };
    bindRooms();
    press("#net-refind", () => lan?.refind());
    press("#net-scan-room", () => {
      scanning = true;
      note = "";
      render();
    });
    press("#net-scan-stop", () => {
      scanning = false;
      render();
    });
    press("#net-dial", () => {
      const value = body.querySelector<HTMLInputElement>("#net-address-in")?.value ?? "";
      if (readRoomCode(value)) return take(value);
      const typed = typedAddress(value);
      if ("text" in typed) return say(typed.text);
      // A bare address does not tell its game: a room listed at it does.
      const ad = [...(lan?.rooms.values() ?? [])].find((r) => r.address === typed.address);
      if (!ad) return say("주소만으로는 어떤 게임의 방인지 알 수 없습니다. 방장의 기기에 나온 QR 코드를 찍거나, 방장과 같은 게임을 고른 뒤 그 게임의 와이파이 여럿이 → 참가하기에서 주소를 넣어 주세요.");
      const route = routeRoom(ad, lan!.self, o.games);
      if ("game" in route) go({ game: route.game, address: ad.address });
      else say(route.problem);
    });
    const field = body.querySelector<HTMLInputElement>("#net-address-in");
    if (field) field.onkeydown = (e) => e.key === "Enter" && body.querySelector<HTMLButtonElement>("#net-dial")?.click();
    // A new code typed or pasted: the words about the last one go.
    const pasting = body.querySelector<HTMLTextAreaElement>("#net-offer-in");
    if (pasting) pasting.oninput = () => note && say("");
    press("#net-accept", () => take(body.querySelector<HTMLTextAreaElement>("#net-offer-in")?.value ?? ""));
    if (scanning) {
      const view = body.querySelector<HTMLElement>(".net-room-scan"),
        video = view?.querySelector("video");
      if (view && video) {
        view.scrollIntoView?.({ block: "nearest" });
        stopScan = scan(
          video,
          (text) => !!readRoomCode(text) || !codeProblem(text),
          (text) => {
            stopScan = null;
            scanning = false;
            render();
            take(text);
          },
          (_words, why) => {
            stopScan = null;
            scanning = false;
            note = CAMERA_WORDS[why];
            render();
          },
        );
      }
    }
    // The browser's camera beside the paste field, as in a room window.
    const start = body.querySelector<HTMLButtonElement>(".net-scan-start");
    if (start) {
      const problem = cameraProblem();
      if (problem) {
        start.disabled = true;
        start.title = problem;
      }
      start.onclick = () => {
        const box = start.closest(".net-paste")!,
          view = box.querySelector<HTMLElement>(".net-scan")!,
          video = view.querySelector("video")!,
          field = box.querySelector<HTMLTextAreaElement>("textarea")!;
        view.hidden = false;
        stopScan?.();
        stopScan = scan(
          video,
          (text) => !codeProblem(text),
          (text) => {
            stopScan = null;
            view.hidden = true;
            field.value = text;
            take(text);
          },
          (words) => {
            stopScan = null;
            view.hidden = true;
            say(words);
          },
        );
        view.querySelector<HTMLButtonElement>(".net-scan-stop")!.onclick = () => {
          stopScan?.();
          stopScan = null;
          view.hidden = true;
        };
      };
    }
  }
  render();
  d.showModal();
  return { dialog: d, close: finish };
}
