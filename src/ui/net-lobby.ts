import { GuestRoom, HostRoom, cleanName, type Link } from "../net/room";
import { answerInvite, invite, webrtcAvailable, type PeerLink } from "../net/peer";
import { qrSvg } from "../net/qr";
import { codeProblem, gameTag, readInvite, PREFIX } from "../net/sdp";
import { cameraProblem, scan, type CameraTrouble } from "../net/scan";
import type { NetRules } from "../net/match";
import type { Camps } from "../net/points";
import { APP_VERSION, type SeatInfo, type SeatKind } from "../net/protocol";
import { appLan, joinProblem, readRoomCode, roomCode, typedAddress, LAN_PORT, type RoomAd } from "../net/lan";
import { allGames, EDITION } from "../core/catalog";
import { idOf } from "../net/route";
import type { GameOptions } from "../games/points/types";
import { getPlayerName, setPlayerName } from "../core/storage";
import { modal } from "./dialog";

/**
 * The window of a room played over one Wi-Fi (와이파이 여럿이): who is in, who sits where, and the pairing of a new
 * device by QR codes both ways (the host shows an offer, the guest reads it and shows its answer, the host reads
 * that). Every code is also shown as text with a copy button and taken pasted (no camera: a page opened from a file,
 * a browser test). Before a game it is the lobby; during one, the 방 button over the table opens it again (people
 * and their connection, the host's 다음 사람 연결 for someone coming back, a guest's 다시 참가).
 *
 * Inside the Android app (`window.wtgNet`, `src/net/lan.ts`) no code is needed: 방 만들기 opens the room at once and
 * announces it on the Wi-Fi (its address shown for typing where announcements do not get through), and 참가하기
 * lists the rooms found, joined with one tap; a guest that dropped taps its room again to return to its seat. The
 * host's window also shows the room's address as a QR code (`roomCode`), which a guest's QR 찍기 reads once to join
 * at once, with the same checks as a tap (and again to come back after a drop). The two-way QR way stays there
 * behind QR로 연결.
 */
export type AnyRoom<S> = HostRoom<S> | GuestRoom<S>;
export interface LobbyOptions<S> {
  game: string;
  title: string;
  variant: string;
  options: GameOptions;
  seats: SeatInfo[];
  /** The fewest people seated before the host may start. */
  least: number;
  rules: NetRules<S>;
  /** The seats are two teams, shown as two camps with the watchers between them (축구). */
  camps?: Camps;
  /** A room already made (the 방 button during a game). */
  room?: AnyRoom<S>;
  /** A room was made: the screen listens to it from now on. */
  opened(room: AnyRoom<S>): void;
  /** The window was closed while no game of its room had begun. */
  cancelled(room: AnyRoom<S> | null): void;
}
export interface Lobby {
  readonly dialog: HTMLDialogElement;
  refresh(): void;
  close(): void;
}
/** The name typed last; it is kept on the device (`getPlayerName`), so every game's room and the collection's
 * 참가하기 window start with it (the user asked). */
let lastName = getPlayerName();
export const typedName = () => getPlayerName() || lastName;
/** Keeps what is typed in the name field (#net-name) as it is typed, so a name set once comes back in every room. */
export function keepName(body: HTMLElement) {
  body.addEventListener("input", (e) => {
    const field = e.target as HTMLInputElement;
    if (field.id === "net-name") setPlayerName(cleanName(field.value, "").trim());
  });
}
/**
 * The host left, and the room with it (the user asked: "방장이 방을 나가면 방이 폭파"): the guest's room has been left
 * by the caller; the guest is told, and 확인 takes it back to the collection.
 */
export function roomGone() {
  document.querySelectorAll<HTMLDialogElement>("dialog.net-lobby").forEach((d) => {
    d.close();
    d.remove();
  });
  modal("방이 없어졌습니다", "<p>방장이 방을 나가서 이 방은 끝났습니다. 컬렉션으로 돌아갑니다.</p>", [
    { text: "확인", action: () => document.querySelector<HTMLButtonElement>("#back")?.click() },
  ]);
}
/**
 * The window opens with nothing focused: a name field focused at once would bring the phone's keyboard up over the
 * window (the user asked). The dialog itself takes the focus, so the keyboard keys still work from there.
 */
export function openQuietly(d: HTMLDialogElement) {
  d.tabIndex = -1;
  d.showModal();
  if (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
  d.focus({ preventScroll: true });
}
/**
 * A room the collection's 참가하기 chose (`src/ui/net-join.ts`): the next room window of that game opens as a guest
 * with this name and joins at once, at the app's `address` or by the host's two-way `offer`, with no 참가하기 to press.
 */
export interface JoinPlan {
  game: string;
  name: string;
  address?: string;
  offer?: string;
}
let planned: JoinPlan | null = null;
export function planJoin(plan: JoinPlan | null) {
  planned = plan;
}
/** Whether a plan is still waiting for its room window (none opened: the game has no Wi-Fi play after all). */
export const joinPending = () => !!planned;
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const KIND_WORD: Partial<Record<SeatKind, string>> = { open: "비어 있음", computer: "컴퓨터", closed: "닫힘" };
/** A game's Korean title from its id (the catalog's English name in lower case, spaces as hyphens). */
const titleOf = (id: string) => allGames.find((g) => idOf(g.en) === id)?.name ?? id;
/** Where a guest whose camera cannot read the room's code turns instead. */
const ELSEWHERE = "위 방 목록에서 방을 누르거나, 방장의 기기에 나온 주소를 주소 입력에 넣어 주세요.";
const CAMERA_WORDS: Record<CameraTrouble, string> = {
  unsupported: `이 기기에서는 카메라로 찍을 수 없습니다. ${ELSEWHERE}`,
  denied: `카메라 사용이 허락되지 않았습니다. ${ELSEWHERE} 찍으려면 휴대폰 설정에서 이 앱의 카메라를 허용해 주세요.`,
  missing: `이 기기에서 카메라를 찾지 못했습니다. ${ELSEWHERE}`,
  broken: `카메라를 켤 수 없습니다. ${ELSEWHERE}`,
};

async function copy(text: string, field: HTMLTextAreaElement | null) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Without the clipboard (a page opened from a file): the text is selected for the person's own copy.
    field?.focus();
    field?.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

export function openLobby<S>(o: LobbyOptions<S>): Lobby {
  let room: AnyRoom<S> | null = o.room ?? null,
    stopScan: (() => void) | null = null,
    closed = false,
    // The pairing in hand: the host's invite for the next guest, or a guest's answer.
    pairing: { link: PeerLink; accept?: (answer: string) => Promise<string | null>; code: string } | null = null,
    pairNote = "",
    busy = false;
  // The app's Wi-Fi rooms (null in a plain browser), whether the QR way is chosen there, and the search for rooms.
  const lan = appLan({ app: APP_VERSION, edition: EDITION });
  let qr = !lan,
    stopFind: (() => void) | null = null,
    // A guest's camera is reading the host's room code (QR 찍기).
    roomScan = false;
  const unwatch = lan?.watch(() => lanChanged()) ?? null;
  const d = document.createElement("dialog");
  d.className = "setup-dialog net-lobby";
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES · 와이파이 여럿이</div><h2></h2><p class="setup-note">같은 와이파이에 있는 기기끼리 ${lan ? "" : "QR 코드로 "}바로 연결합니다. 인터넷도 서버도 쓰지 않습니다.</p><div class="dialog-body net-body"></div><div class="dialog-actions"><button id="net-cancel">← 뒤로</button></div>`;
  d.querySelector("h2")!.textContent = o.title;
  const body = d.querySelector<HTMLElement>(".net-body")!,
    cancel = d.querySelector<HTMLButtonElement>("#net-cancel")!;
  keepName(body);
  document.body.append(d);
  const started = () => !!room?.match;
  const host = () => (room?.host ? (room as HostRoom<S>) : null);
  const guest = () => (room && !room.host ? (room as GuestRoom<S>) : null);
  const finish = () => {
    if (closed) return;
    closed = true;
    stopScan?.();
    stopFind?.();
    unwatch?.();
    // A pairing never finished is let go (a link that opened belongs to the room by now).
    if (pairing && !(pairing.link as PeerLink).open) pairing.link.close();
    pairing = null;
    if (d.open) d.close();
    d.remove();
    if (!started()) o.cancelled(room);
  };
  cancel.onclick = finish;
  d.addEventListener("close", finish);
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    finish();
  });

  /** Who is in the room. */
  const peopleList = () =>
    room
      ? `<ul class="net-people" aria-label="방에 있는 사람">${room.people
          .map((p) => `<li class="${p.connected ? "" : "away"}"><b>${escape(p.name)}</b>${p.id === room!.me ? " <small>(나)</small>" : ""}${p.host ? " <small>방장</small>" : ""}${p.connected ? "" : " <small>연결 끊김</small>"}</li>`)
          .join("")}</ul>`
      : "";
  /** Who sits where; the host may make a seat a computer's or closed, anyone may take an open one. */
  const seatList = () => {
    if (!room) return "";
    const fixed = started();
    return `<ul class="net-seats" aria-label="자리">${room.seats
      .map((s, i) => {
        const who = s.kind === "person" ? (s.person === room!.me ? "나" : escape(room!.person(s.person)?.name ?? "")) : KIND_WORD[s.kind];
        const sit = !fixed && (s.kind === "open" || (room!.host && s.kind !== "person")) && room!.mySeat !== i ? `<button class="net-sit" data-seat="${i}">앉기</button>` : "";
        const stand = !fixed && room!.mySeat === i ? `<button class="net-stand" data-seat="${i}">일어나기</button>` : "";
        const kinds =
          !fixed && room!.host && s.kind !== "person"
            ? [...s.kinds, "open" as SeatKind]
                .filter((k) => k !== s.kind)
                .map((k) => `<button class="net-kind" data-seat="${i}" data-kind="${k}">${k === "open" ? "비우기" : KIND_WORD[k]}</button>`)
                .join("")
            : "";
        return `<li class="net-seat ${s.kind}" data-seat="${i}"><i class="net-dot" style="background:${escape(s.color)}"></i><b>${escape(s.label)}</b><span class="net-who">${who}${room!.away(i) ? " (연결 끊김)" : ""}</span><span class="net-seat-actions">${sit}${stand}${kinds}</span></li>`;
      })
      .join("")}</ul>`;
  };
  /**
   * The seats as two camps (축구, the user asked for a two-camp waiting room): a column for each team and one between
   * them for who only watches, each person a row (mine in gold), each computer a row. A column's head moves me (or,
   * for the host, the row picked) into it; the host adds a computer to a team's empty place and takes one away.
   */
  let picked: string | null = null;
  const campsBlock = () => {
    const c = o.camps!,
      r = room!,
      seats = r.seats,
      fixed = started(),
      isHost = r.host,
      chosen = isHost ? (picked && (picked.startsWith("cpu:") ? seats[Number(picked.slice(4))]?.kind === "computer" : r.person(picked)) ? picked : r.me) : r.me,
      seated = new Set(seats.filter((x) => x.kind === "person").map((x) => x.person));
    const personRow = (id: string, away: boolean) => {
      const p = r.person(id),
        mine = id === r.me;
      return `<li><button type="button" class="so-row person${mine ? " me" : ""}${chosen === id ? " picked" : ""}" data-pick="${escape(id)}" ${!isHost || fixed ? "disabled" : ""} aria-pressed="${chosen === id}"><i class="so-mark" aria-hidden="true"></i><span>${mine ? "나" : escape(p?.name ?? "")}${p?.host ? " <small>방장</small>" : ""}${away ? " <small>연결 끊김</small>" : ""}</span></button></li>`;
    };
    const column = (team: 0 | 1 | null) => {
      const rows: string[] = [];
      let count = 0,
        cap = 0;
      if (team === null) for (const p of r.people) {
        if (!seated.has(p.id)) rows.push(personRow(p.id, !p.connected));
      }
      else
        seats.forEach((seat, i) => {
          if (c.teamOf(i) !== team) return;
          cap++;
          if (seat.kind === "person" && seat.person) {
            count++;
            rows.push(personRow(seat.person, r.away(i)));
          } else if (seat.kind === "computer") {
            count++;
            const id = `cpu:${i}`;
            rows.push(`<li><button type="button" class="so-row cpu${chosen === id ? " picked" : ""}" data-pick="${id}" ${!isHost || fixed ? "disabled" : ""} aria-pressed="${chosen === id}"><i class="so-mark" aria-hidden="true"></i><span>컴퓨터</span></button>${isHost && !fixed ? `<button type="button" class="so-x net-kind" data-seat="${i}" data-kind="open" aria-label="컴퓨터 빼기">×</button>` : ""}</li>`);
          } else rows.push(`<li class="so-empty">${isHost && !fixed && seat.kinds.includes("computer") ? `<button type="button" class="so-add net-kind" data-seat="${i}" data-kind="computer" aria-label="빈자리에 컴퓨터 넣기">+ 컴퓨터</button>` : "<span>빈자리</span>"}</li>`);
        });
      const name = team === null ? "관전 · 대기" : c.names[team],
        cls = team === null ? "wait" : `t${team}`;
      return `<section class="so-camp ${cls}"><button type="button" class="so-camp-head" data-camp="${team === null ? "wait" : team}" ${fixed ? "disabled" : ""}>${name}${team === null ? "" : ` <small>${count}/${cap}</small>`}</button><ul class="so-list" aria-label="${name}">${rows.join("") || (team === null ? `<li class="so-none">없음</li>` : "")}</ul></section>`;
    };
    const why = !fixed && isHost ? (c.problem?.(seats) ?? null) : null;
    return `<div class="so-room net-camps"><div class="so-room-top"><div class="so-room-title"><b>${escape(o.title)} 대기실</b><small>${escape(c.label?.(seats) ?? "")}</small></div></div><div class="so-camps">${column(0)}${column(null)}${column(1)}</div><p class="so-room-note">${fixed ? "경기 중입니다." : escape(why ?? (isHost ? "이름을 누른 뒤 레드·관전·블루 머리를 누르면 그쪽으로 옮깁니다. 빈자리에는 컴퓨터를 넣을 수 있습니다." : "레드나 블루 머리를 누르면 그 팀에 들어갑니다. 관전을 누르면 구경만 합니다."))}</p></div>`;
  };
  /** A camp's head pressed: me (or the host's picked row) into that team, or to the watchers. */
  function toCamp(to: 0 | 1 | null) {
    const c = o.camps!,
      r = room!,
      h = host(),
      id = h ? (picked ?? r.me) : r.me;
    if (started()) return;
    const free = (team: 0 | 1) => r.seats.findIndex((seat, i) => c.teamOf(i) === team && seat.kind === "open");
    if (id.startsWith("cpu:")) {
      const from = Number(id.slice(4));
      if (!h || r.seats[from]?.kind !== "computer") return;
      if (to === null) {
        h.setKind(from, "open");
        picked = null;
        return;
      }
      if (c.teamOf(from) === to) return;
      const target = free(to);
      if (target < 0) return;
      h.setKind(from, "open");
      h.setKind(target, "computer");
      picked = `cpu:${target}`;
      return;
    }
    const at = r.seatOf(id);
    if (to === null) {
      if (at === null) return;
      if (h) h.sit(null, id);
      else (r as GuestRoom<S>).sit(null);
      return;
    }
    if (at !== null && c.teamOf(at) === to) return;
    const target = free(to);
    if (target < 0) return note(`${c.names[to]} 팀에 빈자리가 없습니다.`);
    if (h) h.sit(target, id);
    else (r as GuestRoom<S>).sit(target);
  }
  /** A code shown as a QR picture, as text and with a copy button. */
  const codeBlock = (code: string, id: string, what: string) =>
    `<div class="net-code"><div class="net-qr-box">${qrSvg(code, `${what} QR 코드`)}</div><label class="net-text">${what} (글자로)<textarea id="${id}" readonly rows="3" spellcheck="false">${escape(code)}</textarea></label><button class="net-copy" data-copy="${id}">코드 복사</button></div>`;
  /** A field to paste a code into, with the camera beside it; the camera button names whose QR it reads (the user asked). */
  const pasteBlock = (id: string, what: string, go: string, goId: string, scan: string) =>
    `<div class="net-paste"><label>${what}<textarea id="${id}" rows="2" spellcheck="false" autocapitalize="characters" placeholder="${PREFIX}…"></textarea></label><div class="net-paste-actions"><button class="net-scan-start" data-for="${id}">${scan}</button><button id="${goId}" class="net-go">${go}</button></div><div class="net-scan" hidden><video playsinline muted></video><button class="net-scan-stop">그만 찍기</button></div></div>`;

  /**
   * The host's address (inside the app): as a QR code for a guest's QR 찍기, as text for typing, with the way to the
   * two-way QR codes while they are not shown.
   */
  const addressBlock = () => {
    if (!lan) return "";
    const code = lan.address ? roomCode(lan.address, lan.self, o.game) : "",
      picture = code ? `<div id="net-room-code" class="net-room-code" data-code="${escape(code)}">${qrSvg(code, "방 주소 QR 코드")}</div>` : "";
    return `<div class="net-address${code ? " coded" : ""}">${picture}<div class="net-address-text">${code ? `<p class="net-room-code-line">참가자 앱에서 '방장 QR 찍기'로 찍으면 바로 들어옵니다.</p>` : ""}<span>목록에 안 보이면 참가하는 기기의 주소 입력에:</span><b id="net-address">${escape(lan.address || (lan.problem ? "주소 없음" : "주소를 여는 중…"))}</b>${qr ? "" : `<button id="net-qr" class="net-link">QR로 연결</button>`}</div></div>${lan.problem ? `<p class="net-problem net-lan-problem">${escape(lan.problem)}</p>` : ""}`;
  };
  /** The person id of the host this guest was with (its room in the list is marked). */
  const myHost = () => room?.people.find((p) => p.host)?.id ?? "";
  /** One room found on the Wi-Fi: its title, game and people; another version's or game's is shown greyed. */
  const roomItem = (ad: RoomAd) => {
    const problem = joinProblem(ad, lan!.self, o.game),
      mine = !!myHost() && ad.id === myHost();
    return `<li><button class="net-room${problem ? " other" : ""}${mine ? " mine" : ""}" data-room="${escape(ad.name)}" ${problem ? "disabled" : ""}><span class="net-room-title"><b>${escape(ad.host)}의 방</b>${mine ? "<small>내가 있던 방</small>" : ""}</span><span class="net-room-meta">${escape(ad.title)} · ${ad.people}/${ad.seats}명${ad.playing ? " · 게임 중" : ""}</span>${problem ? `<small class="net-room-why">${escape(problem)}</small>` : `<span class="net-room-go">${mine ? "돌아가기" : "들어가기"}</span>`}</button></li>`;
  };
  const roomList = () => {
    const rooms = lan!.list(o.game);
    return `<ul class="net-rooms" aria-label="같은 와이파이의 방">${
      rooms.length
        ? rooms.map(roomItem).join("")
        : `<li class="net-rooms-empty">${escape(lan!.findProblem || "방을 찾는 중… 같은 와이파이에서 방장이 방 만들기를 누르면 여기에 나옵니다.")}</li>`
    }</ul>`;
  };
  /** The camera reading the host's room code, while QR 찍기 is on. */
  const roomScanBlock = () =>
    roomScan
      ? `<div class="net-scan net-room-scan"><video playsinline muted></video><p>방장의 기기에 나온 QR 코드를 화면에 비추세요.</p><button id="net-scan-stop" class="net-scan-stop">그만 찍기</button></div>`
      : "";
  /** The rooms on the Wi-Fi, the camera for the host's room code, a field for a typed address, and the way to the QR codes. */
  const findBlock = () =>
    `<section class="net-find${roomScan ? " scanning" : ""}"><div class="net-find-head"><h3>같은 와이파이의 방</h3><span class="net-find-tools"><button id="net-refind" class="net-link">다시 찾기</button><button id="net-scan-room" class="net-scan-room" ${busy || roomScan ? "disabled" : ""}>방장 QR 찍기</button></span></div>${roomScanBlock()}${roomList()}<div class="net-dial"><label for="net-address-in">주소 입력</label><input id="net-address-in" inputmode="decimal" autocomplete="off" spellcheck="false" placeholder="192.168.0.12:${LAN_PORT}"><button id="net-dial" class="net-go" ${busy ? "disabled" : ""}>연결</button></div><p class="net-pair-note" role="status">${escape(pairNote)}</p><button id="net-qr" class="net-link">QR로 연결</button></section>`;

  function render() {
    if (closed) return;
    stopScan?.();
    stopScan = null;
    const net = webrtcAvailable() || !!lan;
    // What is being typed stays through a redraw.
    const typed = body.querySelector<HTMLInputElement>("#net-address-in")?.value ?? "";
    let html = "",
      finding = false;
    if (!room) {
      html = net
        ? `<label class="net-name-field">내 이름<input id="net-name" maxlength="12" value="${escape(typedName())}" placeholder="플레이어" autocomplete="nickname"></label><div class="net-roles"><button id="net-host" class="net-role"><b>방 만들기</b><small>${lan ? "이 기기가 방장이 됩니다. 같은 와이파이의 기기들이 방 목록에서 바로 들어옵니다." : "이 기기가 방장이 됩니다. 다른 기기를 한 대씩 연결하고 시작합니다."}</small></button><button id="net-join" class="net-role"><b>참가하기</b><small>${lan ? "같은 와이파이에 열린 방 목록에서 골라 들어갑니다. 같은 게임을 고른 뒤 누르세요." : "방장의 기기에 나온 QR 코드를 읽어 들어갑니다. 같은 게임을 고른 뒤 누르세요."}</small></button></div>`
        : `<p class="net-problem">이 브라우저에서는 기기끼리 바로 연결(WebRTC)을 쓸 수 없습니다. 최신 Chrome에서 열어 주세요.</p>`;
    } else if (room.host) {
      const h = room as HostRoom<S>,
        problem = h.startProblem(o.least) ?? o.camps?.problem?.(h.seats) ?? null;
      // While a device is being paired its codes come first (the QR code must be in view to be read).
      const status = started()
          ? `<p class="net-status">게임 중입니다. 연결이 끊긴 사람은 ${lan ? "방 목록에서 이 방을 다시 누르거나 아래 QR 코드를 찍으면 같은 자리로 돌아옵니다" : "다음 사람 연결로 다시 들어올 수 있습니다"}.</p>`
          : `<p class="net-status">${lan ? "방을 열었습니다. 같은 와이파이의 기기에서 이 게임의 참가하기를 누르면 이 방이 보입니다." : "방을 열었습니다. 다음 사람 연결을 눌러 기기를 한 대씩 연결하세요."}</p>`,
        room_ = o.camps ? campsBlock() : `<h3>자리</h3>${seatList()}<h3>사람 <small>${room.people.length}/8</small></h3>${peopleList()}`,
        pair = pairing
          ? `<section class="net-pair"><h3>다음 사람 연결</h3><ol class="net-steps"><li>참가할 기기에서 같은 게임 → 와이파이 여럿이 → 참가하기를 누르고 '방장 QR 찍기'로 이 QR 코드를 찍습니다.</li><li>그 기기에 나온 답 QR 코드를 '참가자 QR 찍기'로 찍거나, 답 코드를 붙여 넣고 연결을 누릅니다.</li></ol>${codeBlock(pairing.code, "net-offer", "초대 코드")}${pasteBlock("net-answer-in", "참가하는 기기의 답 코드", "연결", "net-connect", "참가자 QR 찍기")}<p class="net-pair-note" role="status">${escape(pairNote)}</p></section>`
          : qr
            ? `<button id="net-invite" class="net-invite" ${busy || room.people.length >= 8 ? "disabled" : ""}>${busy ? "초대 코드를 만드는 중…" : "다음 사람 연결"}</button>${pairNote ? `<p class="net-pair-note" role="status">${escape(pairNote)}</p>` : ""}`
            : pairNote
              ? `<p class="net-pair-note" role="status">${escape(pairNote)}</p>`
              : "",
        begin = started() ? "" : `<p class="net-problem" ${problem ? "" : "hidden"}>${escape(problem ?? "")}</p><button id="net-start" class="primary" ${problem ? "disabled" : ""}>시작</button>`;
      html = pairing ? pair + room_ + begin : status + addressBlock() + room_ + pair + begin;
    } else {
      const g = room as GuestRoom<S>;
      finding = !!lan && !qr && !g.online && !pairing;
      const status = g.online
        ? started()
          ? "게임 중입니다."
          : `${escape(g.hostName)} 님의 방에 들어왔습니다. 자리를 고르고 방장이 시작하기를 기다리세요.`
        : pairing
          ? "방장이 '참가자 QR 찍기'로 아래 답 QR 코드를 찍게 하거나, 답 코드를 복사해 방장에게 보내세요. 연결되면 자리가 나옵니다."
          : finding
            ? g.match
              ? `${escape(g.reason || "방장과의 연결이 끊겼습니다.")} 목록에서 방을 다시 누르면 같은 자리로 돌아갑니다.`
              : g.reason
                ? `${escape(g.reason)} 목록에서 방을 다시 골라 주세요.`
                : "같은 와이파이에 열린 방입니다. 들어갈 방을 누르거나, 방장의 기기에 나온 QR 코드를 방장 QR 찍기로 찍으세요."
            : g.match
              ? `${escape(g.reason || "방장과의 연결이 끊겼습니다.")} 방장이 다음 사람 연결을 누르면 새 초대 코드로 다시 참가하세요.`
              : g.reason
                ? `${escape(g.reason)} 다시 하려면 새 초대 코드를 넣으세요.`
                : "'방장 QR 찍기'로 방장의 기기에 나온 초대 QR 코드를 찍거나, 초대 코드를 붙여 넣으세요.";
      html =
        `<p class="net-status" role="status">${status}</p>` +
        (g.online
          ? o.camps
            ? campsBlock()
            : `<h3>자리</h3>${seatList()}<h3>사람</h3>${peopleList()}`
          : pairing
            ? `<section class="net-pair">${codeBlock(pairing.code, "net-answer", "답 코드")}<p class="net-pair-note" role="status">${escape(pairNote)}</p></section>`
            : finding
              ? findBlock()
              : `<section class="net-pair">${pasteBlock("net-offer-in", "방장의 초대 코드", "다음", "net-accept", "방장 QR 찍기")}<p class="net-pair-note" role="status">${escape(pairNote)}</p>${lan ? `<button id="net-list" class="net-link">방 목록으로</button>` : ""}</section>`);
    }
    // The app looks for rooms only while their list is shown.
    if (!finding) roomScan = false;
    if (finding && !stopFind) stopFind = lan!.find();
    else if (!finding && stopFind) {
      stopFind();
      stopFind = null;
    }
    body.innerHTML = html;
    const field = body.querySelector<HTMLInputElement>("#net-address-in");
    if (field && typed) field.value = typed;
    cancel.textContent = started() ? "닫기" : "← 뒤로";
    bind();
  }
  /** The app's rooms or address changed: only those parts are drawn again (a typed address stays). */
  function lanChanged() {
    if (closed || !lan) return;
    const list = body.querySelector(".net-rooms");
    if (list) {
      list.outerHTML = roomList();
      bindRooms();
    }
    const address = body.querySelector(".net-address");
    if (address) {
      body.querySelector(".net-lan-problem")?.remove();
      address.outerHTML = addressBlock();
      onPress("#net-qr", chooseQr);
    }
  }
  function bindRooms() {
    body.querySelectorAll<HTMLButtonElement>(".net-room").forEach(
      (b) =>
        (b.onclick = () => {
          const ad = lan?.rooms.get(b.dataset.room ?? "");
          if (ad && !joinProblem(ad, lan!.self, o.game)) join(ad.address);
        }),
    );
  }
  /** The QR way inside the app: the host's next invite code, or the guest's field for one. */
  function chooseQr() {
    qr = true;
    pairNote = "";
    if (room?.host) return startInvite();
    render();
  }
  /** A guest joins the room at `address` (a tapped room, or one typed). */
  function join(address: string) {
    const g = guest();
    if (!g || !lan || busy) return;
    busy = true;
    note("연결하는 중…");
    body.querySelectorAll<HTMLButtonElement>(".net-room, #net-dial, #net-scan-room").forEach((b) => (b.disabled = true));
    lan.dial(address).then(
      (link) => {
        busy = false;
        if (closed) return link.close();
        pairNote = "";
        // A drop later on is mended by dialling the same address again, with no tap.
        const app = lan!;
        g.redial = () => app.dial(address);
        g.connect(link as Link);
        render();
      },
      (error: Error) => {
        busy = false;
        pairNote = `연결하지 못했습니다(${error.message}). 두 기기가 같은 와이파이에 있는지(손님용·IoT 와이파이는 기기끼리의 연결을 막습니다), 방이 아직 열려 있는지 확인하세요.`;
        render();
      },
    );
  }
  /** A room's code read by the camera or pasted: joined at once, as a tap in the list, with the same checks. */
  function takeRoomCode(text: string) {
    roomScan = false;
    const code = readRoomCode(text);
    if (!code) {
      // The host's invite of the two-way QR way: taken up as there.
      if (!codeProblem(text)) {
        qr = true;
        pairNote = "";
        render();
        return void takeOffer(text);
      }
      pairNote = "방 주소 QR 코드가 아닙니다. 방장의 기기에서 방 만들기 뒤에 나온 QR 코드를 찍어 주세요.";
      return render();
    }
    const problem = joinProblem({ ...code, title: titleOf(code.game) }, lan!.self, o.game);
    if (problem) {
      pairNote = problem.startsWith("버전")
        ? `${problem}. 두 기기에 같은 버전의 같은 앱을 설치해 주세요.`
        : `다른 게임의 방입니다: ${titleOf(code.game)}. 첫 화면(게임 컬렉션)의 참가하기로 찍으면 그 게임으로 바로 들어갑니다.`;
      return render();
    }
    render();
    join(code.address);
  }
  /** Starts the camera of QR 찍기 into the view just drawn. */
  function startRoomScan() {
    const view = body.querySelector<HTMLElement>(".net-room-scan"),
      video = view?.querySelector("video");
    if (!view || !video) return;
    // On a phone on its side the window is short: the camera's picture and its stop button are brought into view.
    view.scrollIntoView?.({ block: "nearest" });
    stopScan?.();
    stopScan = scan(
      video,
      (text) => !!readRoomCode(text) || !codeProblem(text),
      (text) => {
        stopScan = null;
        takeRoomCode(text);
      },
      (_words, why) => {
        stopScan = null;
        roomScan = false;
        pairNote = CAMERA_WORDS[why];
        render();
      },
    );
  }

  const onPress = (selector: string, fn: () => void) => {
    const button = body.querySelector<HTMLButtonElement>(selector);
    if (button) button.onclick = fn;
  };
  function bind() {
    onPress("#net-host", () => {
      lastName = cleanName(body.querySelector<HTMLInputElement>("#net-name")!.value);
      room = new HostRoom({ game: o.game, title: o.title, name: lastName, variant: o.variant, options: o.options, seats: o.seats }, o.rules);
      o.opened(room);
      // Inside the app the room is open to the Wi-Fi at once.
      lan?.host(room as HostRoom<unknown>);
      render();
    });
    onPress("#net-join", () => {
      lastName = cleanName(body.querySelector<HTMLInputElement>("#net-name")!.value);
      room = new GuestRoom({ game: o.game, title: o.title, name: lastName }, o.rules);
      o.opened(room);
      render();
    });
    onPress("#net-invite", startInvite);
    onPress("#net-connect", () => takeAnswer(body.querySelector<HTMLTextAreaElement>("#net-answer-in")!.value));
    onPress("#net-accept", () => takeOffer(body.querySelector<HTMLTextAreaElement>("#net-offer-in")!.value));
    onPress("#net-start", () => host()?.begin());
    onPress("#net-qr", chooseQr);
    onPress("#net-list", () => {
      qr = false;
      pairNote = "";
      render();
    });
    onPress("#net-refind", () => lan?.refind());
    onPress("#net-scan-room", () => {
      roomScan = true;
      pairNote = "";
      render();
    });
    onPress("#net-scan-stop", () => {
      roomScan = false;
      render();
    });
    if (roomScan) startRoomScan();
    onPress("#net-dial", () => {
      const value = body.querySelector<HTMLInputElement>("#net-address-in")?.value ?? "";
      // A room's code pasted whole joins as when it is scanned.
      if (readRoomCode(value)) return takeRoomCode(value);
      const typed = typedAddress(value);
      if ("text" in typed) return note(typed.text);
      join(typed.address);
    });
    const field = body.querySelector<HTMLInputElement>("#net-address-in");
    if (field) field.onkeydown = (e) => e.key === "Enter" && body.querySelector<HTMLButtonElement>("#net-dial")?.click();
    bindRooms();
    body.querySelectorAll<HTMLButtonElement>(".net-sit").forEach((b) => (b.onclick = () => sit(Number(b.dataset.seat))));
    body.querySelectorAll<HTMLButtonElement>(".net-stand").forEach((b) => (b.onclick = () => sit(null)));
    body.querySelectorAll<HTMLButtonElement>(".net-kind").forEach((b) => (b.onclick = () => host()?.setKind(Number(b.dataset.seat), b.dataset.kind as SeatKind)));
    body.querySelectorAll<HTMLButtonElement>(".so-row[data-pick]").forEach(
      (b) =>
        (b.onclick = () => {
          picked = b.dataset.pick ?? null;
          render();
        }),
    );
    body.querySelectorAll<HTMLButtonElement>(".so-camp-head").forEach((b) => (b.onclick = () => toCamp(b.dataset.camp === "wait" ? null : (Number(b.dataset.camp) as 0 | 1))));
    body.querySelectorAll<HTMLButtonElement>(".net-copy").forEach(
      (b) =>
        (b.onclick = async () => {
          const field = body.querySelector<HTMLTextAreaElement>(`#${b.dataset.copy}`);
          const done = await copy(field?.value ?? "", field);
          b.textContent = done ? "복사했습니다" : "글자를 길게 눌러 복사하세요";
        }),
    );
    body.querySelectorAll<HTMLButtonElement>(".net-scan-start").forEach((b) => {
      const problem = cameraProblem();
      if (problem) {
        b.disabled = true;
        b.title = problem;
      }
      b.onclick = () => {
        const box = b.closest(".net-paste")!,
          view = box.querySelector<HTMLElement>(".net-scan")!,
          video = view.querySelector("video")!,
          field = box.querySelector<HTMLTextAreaElement>("textarea")!;
        view.hidden = false;
        stopScan?.();
        stopScan = scan(
          video,
          // Inside the app the host's room code (the QR code its window shows first) is read here too: both
          // buttons are called 방장 QR 찍기, and this one used to look past that code for ever.
          (text) => !codeProblem(text) || (!!lan && !!readRoomCode(text)),
          (text) => {
            view.hidden = true;
            field.value = text;
            box.querySelector<HTMLButtonElement>(".net-go")?.click();
          },
          (words) => {
            view.hidden = true;
            note(words);
          },
        );
        view.querySelector<HTMLButtonElement>(".net-scan-stop")!.onclick = () => {
          stopScan?.();
          view.hidden = true;
        };
      };
    });
  }
  const note = (text: string) => {
    pairNote = text;
    const line = body.querySelector(".net-pair-note");
    if (line) line.textContent = text;
    else render();
  };
  function sit(seat: number | null) {
    if (room?.host) (room as HostRoom<S>).sit(seat);
    else (room as GuestRoom<S>)?.sit(seat);
  }
  /** The host makes an offer for the next guest. */
  async function startInvite() {
    const h = host();
    if (!h || busy) return;
    busy = true;
    pairNote = "";
    render();
    try {
      const made = await invite(o.game);
      if (closed) return made.link.close();
      pairing = made;
      made.link.opened.then(
        () => {
          if (pairing?.link === made.link) pairing = null;
          h.connect(made.link as Link);
          pairNote = "연결되었습니다. 다음 사람이 있으면 다시 누르세요.";
          render();
        },
        () => {
          if (pairing?.link !== made.link) return;
          pairing = null;
          pairNote = "연결하지 못했습니다. 두 기기가 같은 와이파이에 있는지 확인하고 다시 해 보세요.";
          render();
        },
      );
    } catch {
      pairNote = "초대 코드를 만들지 못했습니다.";
    }
    busy = false;
    render();
  }
  async function takeAnswer(code: string) {
    const h = host(),
      p = pairing;
    if (!h || !p?.accept) return;
    const problem = codeProblem(code);
    if (problem) return note(problem);
    note("연결하는 중…");
    const refused = await p.accept(code.trim());
    if (refused) return note(refused);
    // On one Wi-Fi it opens within a second or two; if it never does the two devices cannot see each other.
    setTimeout(() => {
      if (pairing?.link === p.link && !p.link.open) note("아직 연결되지 않았습니다. 두 기기가 같은 와이파이에 있는지, 학교·회사 와이파이가 기기끼리의 연결을 막지 않는지 확인하세요.");
    }, 12000);
  }
  async function takeOffer(code: string) {
    const g = guest();
    if (!g || busy) return;
    // Inside the app a room's code scanned or pasted here joins as it does from the list of rooms.
    if (lan && readRoomCode(code)) return takeRoomCode(code);
    const problem = codeProblem(code);
    if (problem) return note(problem);
    // An invite names its game: one of another game is not answered here.
    const tag = readInvite(code).tag;
    if (tag && tag !== gameTag(o.game)) {
      const other = allGames.find((g) => gameTag(idOf(g.en)) === tag)?.name ?? tag;
      return note(`다른 게임의 초대 코드입니다: ${other}. 첫 화면(게임 컬렉션)의 참가하기에서 넣으면 그 게임으로 바로 들어갑니다.`);
    }
    busy = true;
    note("답 코드를 만드는 중…");
    const made = await answerInvite(code.trim());
    busy = false;
    if (typeof made === "string") return note(made);
    if (closed) return made.link.close();
    pairing = made;
    pairNote = "";
    made.link.opened.then(
      () => {
        pairing = null;
        pairNote = "";
        g.connect(made.link as Link);
        render();
      },
      () => {
        if (pairing?.link !== made.link) return;
        pairing = null;
        pairNote = "연결하지 못했습니다. 방장에게 새 초대 코드를 받아 다시 해 보세요.";
        render();
      },
    );
    render();
  }

  // Chosen in the collection's 참가하기: a guest at once, joining the room it chose.
  const plan = !room && planned?.game === o.game ? planned : null;
  planned = null;
  if (plan) {
    lastName = plan.name;
    room = new GuestRoom({ game: o.game, title: o.title, name: lastName }, o.rules);
    o.opened(room);
    if (plan.offer) qr = true;
  }
  render();
  openQuietly(d);
  if (plan?.offer) void takeOffer(plan.offer);
  else if (plan?.address) join(plan.address);
  return {
    dialog: d,
    refresh() {
      // Typing in a field is not interrupted: only what the room shows is drawn again.
      if (closed) return;
      const typing = body.querySelector<HTMLTextAreaElement>("#net-answer-in, #net-offer-in");
      if (typing?.value && !room?.match) {
        const seats = body.querySelector(".net-seats"),
          people = body.querySelector(".net-people"),
          camps = body.querySelector(".net-camps");
        if (seats) seats.outerHTML = seatList();
        if (people) people.outerHTML = peopleList();
        if (camps) camps.outerHTML = campsBlock();
        bind();
        return;
      }
      render();
    },
    close() {
      closed = true;
      stopScan?.();
      stopFind?.();
      unwatch?.();
      if (d.open) d.close();
      d.remove();
    },
  };
}
