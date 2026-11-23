import { NOBODY } from "../net/match";
import type { BoardNet } from "../net/boards";
import type { NetMove, SeatInfo } from "../net/protocol";
import type { GuestRoom, HostRoom } from "../net/room";
import type { GameOptions, Move } from "../games/points/types";
import { openLobby, roomGone, type AnyRoom, type Lobby } from "./net-lobby";

/**
 * 와이파이 여럿이 for a screen of its own (chess, gomoku, Reversi, janggi), as the point-game screen plays it: the
 * room's window, the room's events, the status line while this device does not move, the request this device must
 * answer, and the 새 게임 window as a request. The screen keeps its table and its rules; it hands its moves here
 * instead of playing them, and shows what the room tells it (`begin`, `show`), each move once its table rests.
 */
export interface NetTableHooks<S> {
  net: BoardNet<S>;
  title: string;
  /** The options the host's room begins with (its own setup's). */
  options(): GameOptions;
  /** A game of the room begins (`fresh`) or was rebuilt from its move list (an undo, a return): lay it at once. */
  begin(state: S, fresh: boolean): void;
  /** A move the room told, to be shown on the table. */
  show(state: S, move: NetMove): void;
  /** Whether the table is up and rests, so that a told move may be shown. */
  resting(): boolean;
  /** Whether the screen's table is in the page. */
  table(): boolean;
  /** The status line and buttons drawn again. */
  update(): void;
  /** The seats changed (someone dropped or came back): the host's computer may have a seat to play now. */
  resume(): void;
  /** The room's window closed before any game of it, with no table behind: back to the collection. */
  back(): void;
}
export type Outcome = "win" | "lose" | "draw";
const REFUSED = "둘 수 없는 수입니다.";

export class NetTable<S> {
  room: AnyRoom<S> | null = null;
  private lobby: Lobby | null = null;
  /** States the room told and the table has still to show, each in turn once it rests. */
  private inbox: { state: S; move: NetMove }[] = [];
  /** A move of mine sent to the host and not yet told back. */
  private sending = false;
  /** Why the host was lost. */
  private lost = "";
  /** A line of the room's (or a refusal), said in the status line while the table shows `state`. */
  private warned: { state: S | null; text: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly hooks: NetTableHooks<S>) {}

  /** A room is open (a game over Wi-Fi is being played, or about to be). */
  get active() {
    return !!this.room;
  }
  /** A game of the room is under way on this device. */
  get playing() {
    return !!this.room?.match;
  }
  /** My seat (null: only watching). */
  get seat(): number | null {
    return this.room?.mySeat ?? null;
  }
  get host() {
    return !!this.room?.host;
  }
  private get online() {
    const room = this.room;
    return !!room && (room.host || (room as GuestRoom<S>).online);
  }
  /** The room's window: the lobby before a game, the room as it stands during one. */
  open() {
    if (this.lobby) return;
    const net = this.hooks.net;
    this.lobby = openLobby({
      game: document.documentElement.dataset.game ?? net.game,
      title: this.hooks.title,
      variant: "",
      options: this.hooks.options(),
      seats: net.seats.map((s): SeatInfo => ({ ...s, kind: "open", person: null })),
      least: 2,
      rules: net,
      room: this.room ?? undefined,
      opened: (room) => this.listen(room),
      cancelled: () => {
        this.lobby = null;
        this.leave();
        if (!this.hooks.table()) this.hooks.back();
        else this.hooks.update();
      },
    });
    this.lobby.dialog.addEventListener("close", () => {
      this.lobby = null;
      setTimeout(() => this.hooks.table() && this.hooks.update(), 0);
    });
  }
  private listen(room: AnyRoom<S>) {
    this.room = room;
    this.lost = "";
    const here = () => this.room === room && this.hooks.table();
    room.events = {
      changed: () => {
        this.lobby?.refresh();
        if (!here()) return;
        this.hooks.update();
        if (room.match && this.computer(room.match.state)) this.hooks.resume();
      },
      started: () => {
        this.lobby?.close();
        this.lobby = null;
        this.reset();
        if (room.match) this.hooks.begin(room.match.state, true);
        this.renderAsk();
      },
      moved: (state, move) => {
        this.sending = false;
        this.inbox.push({ state, move });
        this.drain();
      },
      synced: () => {
        this.reset();
        if (room.match && this.hooks.table()) this.hooks.begin(room.match.state, false);
      },
      asked: () => this.renderAsk(),
      settled: () => {
        this.renderAsk();
        if (here()) this.hooks.update();
      },
      notice: (text) => this.notice(text),
      refused: (text) => {
        this.sending = false;
        this.notice(text);
      },
      lost: (reason) => {
        if ((room as GuestRoom<S>).hostLeft) {
          this.leave();
          return roomGone();
        }
        this.lost = reason;
        this.sending = false;
        this.lobby?.refresh();
        this.renderAsk();
        if (here()) this.hooks.update();
      },
    };
  }
  private reset() {
    this.inbox = [];
    this.sending = false;
    this.warned = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  /** Shows the next state the room told once the table rests (and tries again a moment later while it does not). */
  drain() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.room || !this.inbox.length) return;
    if (!this.hooks.table() || !this.hooks.resting()) {
      this.timer = setTimeout(() => this.drain(), 100);
      return;
    }
    const next = this.inbox.shift()!;
    this.warned = null;
    this.hooks.show(next.state, next.move);
    if (this.inbox.length) this.timer = setTimeout(() => this.drain(), 100);
  }
  /** Leaves the room (if any): the others are told. */
  leave() {
    this.lobby?.close();
    this.lobby = null;
    this.reset();
    this.lost = "";
    if (!this.room) return;
    this.room.events = {};
    this.room.leave();
    this.room = null;
  }

  /** The seat to move in `state` (NOBODY when over). */
  private toMove(state: S) {
    return this.hooks.net.toMove(state);
  }
  /** Whether this device may move in `state` now: its seat's turn, nothing on the way. */
  mine(state: S) {
    if (!this.room?.match) return false;
    const to = this.toMove(state);
    return !this.sending && this.online && !this.inbox.length && to >= 0 && to === this.seat;
  }
  /** Whether the host's computer plays the seat to move: a computer's seat, or one whose device dropped. */
  computer(state: S) {
    const room = this.room,
      to = this.toMove(state);
    if (!room?.host || !room.match || to < 0 || this.inbox.length) return false;
    return room.seats[to]?.kind === "computer" || room.away(to);
  }
  /** A move of mine (or, with `seat`, of the host's computer for that seat): null, or the words why not. */
  commit(move: Move, seat?: number): string | null {
    const room = this.room;
    if (!room?.match) return "게임이 시작되지 않았습니다.";
    if (seat !== undefined) return room.host ? (room as HostRoom<S>).play(move, seat) : "방장의 컴퓨터만 둘 수 있습니다.";
    const state = room.match.state;
    if (!this.mine(state)) {
      this.warn(state);
      return this.warned?.text ?? "상대 차례입니다.";
    }
    const text = room.host ? (room as HostRoom<S>).play(move, this.seat!) : (room as GuestRoom<S>).play(move);
    if (text) {
      // A refusal of the rules is the screen's to word; the room's own words are said here.
      if (text !== REFUSED) this.notice(text);
      return text;
    }
    if (!room.host) {
      this.sending = true;
      this.hooks.update();
    }
    return null;
  }
  /** A tap while this device may not move: the status line says why. */
  warn(state: S) {
    const room = this.room;
    if (!room) return;
    this.notice(
      !this.online ? "방장과 연결되어 있지 않습니다." : this.sending ? "보내는 중입니다." : this.seat === null ? "구경하는 중입니다." : this.toMove(state) === NOBODY ? "게임이 끝났습니다." : "상대 차례입니다.",
      state,
    );
  }
  /** A line said in the status line until the table shows another state. */
  notice(text: string, state: S | null = this.room?.match?.state ?? null) {
    this.warned = { state, text };
    if (this.hooks.table()) this.hooks.update();
  }
  /** Undo over Wi-Fi is a request the other accepts. */
  undo() {
    const text = this.room?.request("undo");
    if (text) this.notice(text);
    this.hooks.update();
  }
  canUndo() {
    const room = this.room,
      seat = this.seat;
    return !!room?.match && seat !== null && room.match.undoFor(seat) !== null && !room.pending && this.online && this.toMove(room.match.state) !== NOBODY;
  }

  /** Who sits on a seat, with the side: 나 (백), 민수 (흑), 컴퓨터 (흑). */
  who(seat: number) {
    const room = this.room,
      label = this.hooks.net.seats[seat]?.label ?? "";
    return room ? `${room.nameOf(seat) || "빈자리"} (${label})` : label;
  }
  /** The end for the person at this device. */
  outcome(state: S): Outcome {
    const r = this.hooks.net.result(state);
    if (r === null || r === "draw" || this.seat === null) return "draw";
    return r === this.seat ? "win" : "lose";
  }
  /** The result's first words for this device: 이겼습니다! / 졌습니다. / 무승부. */
  verdict(state: S) {
    const r = this.hooks.net.result(state);
    if (r === null) return "";
    if (r === "draw") return "무승부입니다.";
    if (this.seat === null) return `${this.who(r)} 승리!`;
    return r === this.seat ? "이겼습니다!" : `졌습니다. ${this.who(r)} 승리.`;
  }
  /**
   * The status line while this device does not move (null: the screen's own words for my turn): the host lost, a
   * request waiting, a move being sent, a notice, or whose turn it is.
   */
  line(state: S): string | null {
    const room = this.room;
    if (!room) return null;
    if (!this.online) return `${this.lost || "방장과 연결되어 있지 않습니다."} 방 버튼으로 다시 참가할 수 있습니다.`;
    if (room.pending) {
      const kind = room.pending.kind === "undo" ? "무르기" : "새 게임";
      if (room.mustAnswer) return `${kind} 요청 — 수락이나 거절을 누르세요.`;
      if (room.pending.from === room.me) return `${room.pending.kind === "undo" ? "무르기를" : "새 게임을"} 요청했습니다. 대답을 기다리는 중…`;
    }
    if (this.sending) return "보내는 중…";
    // A notice is said while this device waits; in my turn the screen's own words ask for my move.
    const to = this.toMove(state);
    if (to < 0 || this.mine(state)) return null;
    if (this.warned && (this.warned.state === state || this.warned.state === null)) return this.warned.text;
    if (room.host && this.computer(state) && room.seats[to]?.kind === "computer") return "컴퓨터가 생각 중…";
    if (room.away(to)) return `${room.person(room.seats[to].person)?.name ?? ""} 님의 연결이 끊겼습니다.${room.host ? " 컴퓨터가 대신 둡니다." : ""}`;
    return `${this.who(to)} 차례입니다.`;
  }

  /** The table's own controls over Wi-Fi: the room's button over the table, and the place where a request is answered. */
  dress(root: ParentNode = document) {
    const button = document.createElement("button");
    button.id = "net-room";
    button.textContent = "방";
    button.onclick = () => this.open();
    root.querySelector(".game-actions")?.insertBefore(button, root.querySelector("#restart"));
    const ask = document.createElement("div");
    ask.id = "net-ask";
    ask.className = "net-ask";
    ask.hidden = true;
    root.querySelector(".board-area")?.append(ask);
    this.renderAsk();
  }
  /** A request this device must answer, over the table with 수락 and 거절. */
  renderAsk() {
    const box = document.getElementById("net-ask"),
      room = this.room;
    if (!box || !room) return;
    const ask = room.pending;
    if (!ask || !room.mustAnswer) {
      box.hidden = true;
      box.replaceChildren();
      return;
    }
    const line = document.createElement("p"),
      yes = document.createElement("button"),
      no = document.createElement("button");
    line.textContent = `${room.person(ask.from)?.name ?? ""} 님이 ${ask.kind === "undo" ? "무르기를" : "새 게임을"} 요청했습니다.`;
    yes.className = "net-yes primary";
    yes.textContent = "수락";
    no.className = "net-no";
    no.textContent = "거절";
    const answer = (agree: boolean) => {
      room.answer(ask.id, agree);
      box.hidden = true;
      box.replaceChildren();
      this.hooks.update();
    };
    yes.onclick = () => answer(true);
    no.onclick = () => answer(false);
    box.replaceChildren(line, yes, no);
    box.hidden = false;
  }
  /** 새 게임 over Wi-Fi (the window over the table): a request to begin again with the same seats, or leaving the room. */
  newGame(host: HTMLElement) {
    const dialog = host.closest("dialog");
    host.innerHTML = `<div class="net-new"><p>다른 사람이 모두 수락하면 같은 자리로 새 게임을 시작합니다.</p><button id="net-new" class="primary">새 게임 요청</button><button id="net-leave" class="net-leave">방에서 나가기</button></div>`;
    const ask = host.querySelector<HTMLButtonElement>("#net-new")!;
    ask.onclick = () => {
      const text = this.room?.request("new");
      if (text) this.notice(text);
      this.hooks.update();
    };
    host.querySelector<HTMLButtonElement>("#net-leave")!.onclick = () => {
      dialog?.close();
      dialog?.remove();
      document.getElementById("back")?.click();
    };
    // The window names its start 새 게임 시작 once it is filled; here the start is a request.
    queueMicrotask(() => {
      ask.textContent = "새 게임 요청";
      const note = dialog?.querySelector(".setup-note");
      if (note) note.textContent = "와이파이로 함께 하는 중입니다. 새 게임은 모두가 수락해야 시작합니다.";
    });
  }
  dispose() {
    this.leave();
  }
}
