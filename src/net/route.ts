import { allGames } from "../core/catalog";
import { josa } from "../core/josa";
import { joinProblem, readRoomCode, type LanSelf, type RoomCode } from "./lan";
import { codeProblem, gameTag, readInvite } from "./sdp";

/**
 * The collection's 참가하기 (whatever game is chosen): a room's QR code (`roomCode`, inside the app), a room tapped in
 * the app's list, or the host's two-way invite (`WTGG:<GAME>/WTG1…`, any browser) is routed to the game it is of, so
 * that the page opens that game's table straight in Wi-Fi mode as a guest. Free of the page and of Three.js.
 */
/** A game of this edition: its id (the catalog's English name in lower case, spaces as hyphens) and its Wi-Fi play. */
export interface Playable {
  id: string;
  name: string;
  /** Whether the game has 와이파이 여럿이. */
  wifi: boolean;
}
/** The games with a screen of their own that have 와이파이 여럿이 (the point games say so by `PointConfig.net`). */
export const OWN_WIFI = ["gomoku", "reversi", "chess", "janggi", "yut-nori", "yacht-dice", "world-tour", "continent-conquest"];
export const idOf = (en: string) => en.toLowerCase().replaceAll(" ", "-");
/** A game's Korean title from its id, in any edition (a room of a game this one lacks still has a name). */
export const titleOf = (id: string) => allGames.find((g) => idOf(g.en) === id)?.name ?? id;

/** Where a room's code (or announcement) takes this page: the game to open, or the words why not. */
export type Route = { game: string } | { problem: string };
/** Words for a game this edition does not have, or that has no Wi-Fi play. */
function missing(id: string, title: string, self: LanSelf, here: Playable[]): string | null {
  const game = here.find((g) => g.id === id);
  if (game) return game.wifi ? null : `${game.name}${josa(game.name, "은", "는")} 와이파이 여럿이가 없는 게임입니다.`;
  const known = allGames.some((g) => idOf(g.en) === id),
    name = title && title !== id ? title : titleOf(id);
  // A game of the catalog left out of this edition (the student app has no betting games), or a game newer than this app.
  if (known) return `${name}${josa(name, "은", "는")} ${self.edition === "student" ? "학생용 앱에는" : "이 앱에는"} 없는 게임입니다.`;
  return `이 앱에는 없는 게임의 방입니다${name !== id ? `(${name})` : ""}. 두 기기에 같은 버전의 앱을 설치해 주세요.`;
}
/**
 * The game a room is of, if this page may join it: the same protocol and app version first (another version may
 * have other games), then a game this edition has with Wi-Fi play, then the same edition.
 */
export function routeRoom(room: Pick<RoomCode, "game" | "edition" | "protocol" | "app"> & { title?: string }, self: LanSelf, here: Playable[]): Route {
  const title = room.title || titleOf(room.game),
    version = joinProblem({ ...room, title, game: room.game }, { ...self, edition: room.edition }, room.game);
  if (version) return { problem: `${version}. 두 기기에 같은 버전의 같은 앱을 설치해 주세요.` };
  const lack = missing(room.game, title, self, here);
  if (lack) return { problem: lack };
  const edition = joinProblem({ ...room, title }, self, room.game);
  if (edition) return { problem: `${edition}. 두 기기에 같은 앱을 설치해 주세요.` };
  return { game: room.game };
}

/** What a scanned or pasted text holds for the collection's 참가하기. */
export type Taken =
  /** A room's QR code (inside the app): its game and address. */
  | { kind: "room"; game: string; address: string }
  /** The host's two-way invite naming its game. */
  | { kind: "invite"; game: string; code: string }
  | { kind: "problem"; problem: string };
/** A scanned or pasted text routed: a room's code, a tagged invite, or the words why it cannot be taken here. */
export function routeText(text: string, self: LanSelf, here: Playable[]): Taken {
  const room = readRoomCode(text);
  if (room) {
    const route = routeRoom(room, self, here);
    return "game" in route ? { kind: "room", game: route.game, address: room.address } : { kind: "problem", problem: route.problem };
  }
  const problem = codeProblem(text);
  if (problem) return { kind: "problem", problem: text.trim() ? problem : "방장의 기기에 나온 QR 코드를 찍거나, 초대 코드를 붙여 넣어 주세요." };
  const { tag, code } = readInvite(text);
  if (tag === null)
    return { kind: "problem", problem: "이 초대 코드에는 게임이 적혀 있지 않습니다(이전 버전의 코드). 방장과 같은 게임을 먼저 고른 뒤 그 게임의 와이파이 여럿이 → 참가하기에서 넣어 주세요." };
  const game = here.find((g) => gameTag(g.id) === tag) ?? allGames.map((g) => ({ id: idOf(g.en), name: g.name, wifi: false })).find((g) => gameTag(g.id) === tag);
  if (!game) return { kind: "problem", problem: "이 앱에는 없는 게임의 초대 코드입니다. 두 기기에 같은 버전의 앱을 설치해 주세요." };
  const lack = missing(game.id, game.name, self, here);
  return lack ? { kind: "problem", problem: lack } : { kind: "invite", game: game.id, code };
}
