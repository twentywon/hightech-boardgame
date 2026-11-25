import { describe, expect, test } from "vitest";
import { allGames } from "../src/core/catalog";
import { roomCode, type LanSelf } from "../src/net/lan";
import { APP_VERSION, PROTOCOL } from "../src/net/protocol";
import { OWN_WIFI, idOf, routeRoom, routeText, type Playable } from "../src/net/route";
import { codeProblem, gameTag, packSignal, readInvite, tagInvite, unpackSignal } from "../src/net/sdp";
import type { PointConfig } from "../src/ui/point-game";

/*
 * The collection's 참가하기: a room's code (inside the app), a room announced on the Wi-Fi, or the host's two-way
 * invite (any browser) is routed to the game it is of; a game this edition lacks, one without Wi-Fi play, and
 * another version or edition are answered with words. The invite names its game in front of the old code.
 */
const configs = import.meta.glob<Record<string, unknown>>("../src/games/*/config.ts", { eager: true });
/** The point games with 와이파이 여럿이, by their catalog id. */
const netPoints = Object.values(configs)
  .flatMap((module) => Object.values(module))
  .filter((c): c is PointConfig<unknown> => !!c && typeof c === "object" && "english" in c && "game" in c && !!(c as PointConfig<unknown>).net)
  .map((c) => idOf(c.english));
const full: LanSelf = { app: APP_VERSION, edition: "full" },
  student: LanSelf = { app: APP_VERSION, edition: "student" };
const playable = (excluded: string[] = []): Playable[] =>
  allGames
    .filter((g) => g.available && !excluded.includes(g.en))
    .map((g) => ({ id: idOf(g.en), name: g.name, wifi: OWN_WIFI.includes(idOf(g.en)) || netPoints.includes(idOf(g.en)) }));
const STUDENT_OUT = ["BLACKJACK", "SEOTDA", "SEVEN POKER", "TEXAS HOLDEM", "GO-STOP", "COIN PUSHER", "SLOT MACHINE"];
const ADDRESS = "192.168.0.12:47297";

describe("routing a room to its game", () => {
  test("every game with Wi-Fi play is found, and each is a game of the catalog", () => {
    const wifi = [...OWN_WIFI, ...netPoints];
    expect(netPoints.length).toBeGreaterThanOrEqual(26);
    expect(wifi).toEqual(expect.arrayContaining(["chess", "gomoku", "janggi", "world-tour", "tic-tac-toe", "ludo", "hex-conquest", "nine-men's-morris"]));
    for (const id of wifi) expect(allGames.some((g) => idOf(g.en) === id)).toBe(true);
  });
  test("a room's QR code of every Wi-Fi game routes to that game with its address, in either edition", () => {
    for (const game of [...OWN_WIFI, ...netPoints]) {
      expect(routeText(roomCode(ADDRESS, full, game), full, playable())).toEqual({ kind: "room", game, address: ADDRESS });
      // The betting games have Wi-Fi play in the full edition only: the student app has no such game.
      const out = STUDENT_OUT.includes(allGames.find((g) => idOf(g.en) === game)!.en);
      expect(routeText(roomCode(ADDRESS, student, game), student, playable(STUDENT_OUT))).toEqual(
        out ? { kind: "problem", problem: expect.stringContaining("학생용 앱에는 없는 게임") } : { kind: "room", game, address: ADDRESS },
      );
    }
  });
  test("an announced room routes the same way, read from its attributes", () => {
    const ad = { game: "yut-nori", title: "윷놀이", edition: "full", protocol: PROTOCOL, app: APP_VERSION };
    expect(routeRoom(ad, full, playable())).toEqual({ game: "yut-nori" });
  });
  test("a game without Wi-Fi play, and one this edition does not have, are said in words", () => {
    expect(routeText(roomCode(ADDRESS, full, "minesweeper"), full, playable())).toEqual({ kind: "problem", problem: "지뢰찾기는 와이파이 여럿이가 없는 게임입니다." });
    // The student app scanning a full-edition room of a betting game.
    expect(routeRoom({ game: "seotda", title: "섯다", edition: "full", protocol: PROTOCOL, app: APP_VERSION }, student, playable(STUDENT_OUT))).toEqual({ problem: "섯다는 학생용 앱에는 없는 게임입니다." });
    // A game newer than this app (its version the same, say a test build).
    const problem = routeRoom({ game: "space-chess", title: "우주 체스", edition: "full", protocol: PROTOCOL, app: APP_VERSION }, full, playable());
    expect("problem" in problem && problem.problem).toContain("이 앱에는 없는 게임의 방입니다(우주 체스)");
  });
  test("another version or edition is refused before the game is looked at", () => {
    const old = routeText(roomCode(ADDRESS, { app: "2025.01-old", edition: "full" }, "space-chess"), full, playable());
    expect(old.kind === "problem" && old.problem).toMatch(/^버전이 다릅니다/);
    const edition = routeText(roomCode(ADDRESS, full, "chess"), student, playable(STUDENT_OUT));
    expect(edition.kind === "problem" && edition.problem).toContain("버전이 다릅니다 (일반 앱)");
  });
  test("text that is no code is answered in words", () => {
    expect(routeText("", full, playable()).kind).toBe("problem");
    expect(routeText("hello", full, playable())).toEqual({ kind: "problem", problem: "이 게임의 연결 코드가 아닙니다." });
  });
});

describe("the invite names its game", () => {
  const SDP = "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=audio 9 RTP/AVP 0\r\n";
  test("tagged in capitals for the QR's alphanumeric mode, read back with the code untouched", async () => {
    const code = await packSignal({ type: "offer", sdp: SDP }),
      tagged = tagInvite(code, "nine-men's-morris");
    expect(gameTag("nine-men's-morris")).toBe("NINE-MENS-MORRIS");
    expect(tagged).toBe(`WTGG:NINE-MENS-MORRIS/${code}`);
    expect(readInvite(` ${tagged}\n`)).toEqual({ tag: "NINE-MENS-MORRIS", code });
    expect(readInvite(code)).toEqual({ tag: null, code });
    expect(codeProblem(tagged)).toBeNull();
    expect(await unpackSignal(tagged)).toEqual(await unpackSignal(code));
  });
  test("a cut or broken tagged code is told so", async () => {
    const code = await packSignal({ type: "offer", sdp: SDP });
    expect(codeProblem("WTGG:CHESS")).toBe("코드가 끝까지 복사되지 않았습니다.");
    expect(codeProblem("WTGG:CHESS/WT")).toBe("코드가 끝까지 복사되지 않았습니다.");
    expect(codeProblem(tagInvite(code, "chess").slice(0, -1))).toBe("코드가 끝까지 복사되지 않았습니다.");
    expect(codeProblem("WTGG:CHESS/HELLO")).toBe("코드가 손상되었습니다. 다시 복사해 주세요.");
  });
  test("routed to its game; an old invite without one asks to open the game first", async () => {
    const code = await packSignal({ type: "offer", sdp: SDP });
    expect(routeText(tagInvite(code, "gomoku"), full, playable())).toEqual({ kind: "invite", game: "gomoku", code });
    expect(routeText(tagInvite(code, "nine-men's-morris"), full, playable())).toEqual({ kind: "invite", game: "nine-men's-morris", code });
    const old = routeText(code, full, playable());
    expect(old.kind === "problem" && old.problem).toContain("게임이 적혀 있지 않습니다");
    const lacking = routeText(tagInvite(code, "seotda"), student, playable(STUDENT_OUT));
    expect(lacking).toEqual({ kind: "problem", problem: "섯다는 학생용 앱에는 없는 게임입니다." });
    const unknown = routeText(tagInvite(code, "space-chess"), full, playable());
    expect(unknown.kind === "problem" && unknown.problem).toContain("없는 게임의 초대 코드");
  });
});
