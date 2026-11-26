import { mirrorStatus } from "./banner";
import { RESULT_WINDOWS, dress, finale, resultArt } from "./chrome";
import { mountChess, type ChessController } from "./chess";
import { mountBlackjack, type BlackjackController } from "./blackjack";
import { mountYacht, type YachtController, type YachtOptions } from "./yacht";
import { mountYut, type YutController, type YutOptions } from "./yut";
import { mountPointGame, type PointController, type PointOptions } from "./point-game";
import { hexaConfig } from "../games/hexa/config";
import { morrisConfig } from "../games/morris/config";
import { gonuConfig } from "../games/gonu/config";
import { checkersConfig } from "../games/checkers/config";
import { dotsConfig } from "../games/dots/config";
import { hexConfig } from "../games/hex/config";
import { mancalaConfig } from "../games/mancala/config";
import { snakesConfig } from "../games/snakes/config";
import { seaBattleConfig } from "../games/seabattle/config";
import { fourRowConfig } from "../games/fourrow/config";
import { twistConfig } from "../games/twist/config";
import { hareConfig } from "../games/hare/config";
import { hitBlowConfig } from "../games/hitblow/config";
import { wallRaceConfig } from "../games/wallrace/config";
import { dominoConfig } from "../games/domino/config";
import { alkkagiConfig } from "../games/alkkagi/config";
import { carromConfig } from "../games/carrom/config";
import { tileRummyConfig } from "../games/tilerummy/config";
import { starHopConfig } from "../games/starhop/config";
import { ludoConfig } from "../games/ludo/config";
import { poolConfig } from "../games/pool/config";
import { indianConfig } from "../games/indian/config";
import { gostopConfig } from "../games/gostop/config";
import { foosballConfig } from "../games/foosball/config";
import { blocksConfig } from "../games/blocks/config";
import { mergeConfig } from "../games/merge/config";
import { bricksConfig } from "../games/bricks/config";
import { pegConfig } from "../games/peg/config";
import { marbleConfig } from "../games/marble/config";
import { pourConfig } from "../games/pour/config";
import { riverConfig } from "../games/river/config";
import { hanoiConfig } from "../games/hanoi/config";
import { lightsConfig } from "../games/lights/config";
import { queensConfig } from "../games/queens/config";
import { knightConfig } from "../games/knight/config";
import { tiltConfig } from "../games/tilt/config";
import { hauntConfig } from "../games/haunt/config";
import { skylineConfig } from "../games/skyline/config";
import { balanceConfig } from "../games/scale/config";
import { snakeConfig } from "../games/snake/config";
import { whackConfig } from "../games/whack/config";
import { fishingConfig } from "../games/fishing/config";
import { valetConfig } from "../games/valet/config";
import { slotMachineConfig } from "../games/slots/config";
import { tictactoeConfig } from "../games/tictactoe/config";
import { airHockeyConfig } from "../games/airhockey/config";
import { tableTennisConfig } from "../games/pingpong/config";
import { badmintonConfig } from "../games/badminton/config";
import { basketballConfig } from "../games/basketball/config";
import { clawConfig } from "../games/claw/config";
import { foxGeeseConfig } from "../games/foxgeese/config";
import { taflConfig } from "../games/tafl/config";
import { urConfig } from "../games/ur/config";
import { tentsConfig } from "../games/tents/config";
import { amazonsConfig } from "../games/amazons/config";
import { backgammonConfig } from "../games/backgammon/config";
import { oneCardConfig } from "../games/onecard/config";
import { hulaConfig } from "../games/hula/config";
import { oldMaidConfig } from "../games/oldmaid/config";
import { curlingConfig } from "../games/curling/config";
import { starBattleConfig } from "../games/starbattle/config";
import { pipesConfig } from "../games/pipes/config";
import { goConfig } from "../games/go/config";
import { bridgesConfig } from "../games/bridges/config";
import { tracksConfig } from "../games/tracks/config";
import { parkingConfig } from "../games/parking/config";
import { glideConfig } from "../games/glide/config";
import { trapCatConfig } from "../games/trapcat/config";
import { bulbLinkConfig } from "../games/bulblink/config";
import { telescopeConfig } from "../games/telescope/config";
import { lightCableConfig } from "../games/lightcable/config";
import { mahjongConfig } from "../games/mahjong/config";
import { minesConfig } from "../games/mines/config";
import { fruitConfig } from "../games/fruit/config";
import { grillConfig } from "../games/grill/config";
import { slideConfig } from "../games/slide/config";
import { dartsConfig } from "../games/darts/config";
import { bowlingConfig } from "../games/bowling/config";
import { minigolfConfig } from "../games/minigolf/config";
import { frogConfig } from "../games/frog/config";
import { laserConfig } from "../games/laser/config";
import { nimConfig } from "../games/nim/config";
import { tacticsConfig } from "../games/tactics/config";
import { numberCodeConfig } from "../games/numbercode/config";
import { caromConfig } from "../games/carom/config";
import { laserChessConfig } from "../games/laserchess/config";
import { archeryConfig } from "../games/archery/config";
import { tuhoConfig } from "../games/tuho/config";
import { coinPusherConfig } from "../games/coinpusher/config";
import { rouletteConfig } from "../games/roulette/config";
import { shootingConfig } from "../games/shooting/config";
import { marblePushConfig } from "../games/push/config";
import { hexConquestConfig } from "../games/hexconquest/config";
import { slotCarConfig } from "../games/slotcar/config";
import { soccerConfig } from "../games/soccer/config";
import { goldRaidConfig } from "../games/goldraid/config";
import { bowDuelConfig } from "../games/bowduel/config";
import type { PointConfig } from "./point-game";
import { thumb } from "./thumbs";
import { mountSpider, type SpiderController, type SpiderOptions } from "./spider";
import { mountPatience, type PatienceController } from "./patience";
import { klondikeConfig, type KlondikeOptions } from "../games/klondike/config";
import { freecellConfig, type FreeCellOptions } from "../games/freecell/config";
import { mountTour, type TourController, type TourOptions } from "./tour";
import { CONQUEST_DEFAULTS, mountConquest, type ConquestController, type ConquestOptions } from "./conquest";
import {
  mountBettingGame,
  type BettingController,
  type BettingOptions,
} from "./betting-game";
import { seotdaConfig } from "../games/seotda/skin";
import { pokerConfig } from "../games/poker/skin";
import { holdemConfig } from "../games/holdem/skin";
import { mountJanggi, type JanggiController, type JanggiOptions } from "./janggi";
import { mountReversi, type ReversiController } from "./reversi";
import { getOptions as getReversiOptions, setOptions as setReversiOptions } from "../games/reversi/storage";
import { entryDialog, modal, setupDialog } from "./dialog";
import { EDITION, games } from "../core/catalog";
import { UPDATES } from "../core/updates";
import {
  getSettings,
  setSettings,
  type Mode,
  getAIOptions,
  setAIOptions,
  getStats,
  addResult,
  type Record as Tally,
} from "../core/storage";
import {
  createGame,
  play,
  undo,
  type Point,
  type Player,
} from "../games/gomoku/rules";
import { AIClient } from "../games/gomoku/ai/client";
import {
  profiles,
  difficulties,
  type Difficulty,
  type ColorChoice,
} from "../games/gomoku/ai/difficulty";
import { BoardView } from "../engine/board-view";
import { Sound } from "../engine/sound";
import { music } from "../engine/music";
import { NetTable } from "./net-table";
import { canJoin, openJoin, QR_MARK } from "./net-join";
import { joinPending, planJoin, type JoinPlan } from "./net-lobby";
import { idOf, OWN_WIFI, type Playable } from "../net/route";
import { gomokuMove, gomokuNet } from "../net/boards";
const app = document.querySelector<HTMLDivElement>("#app")!;
let state = createGame(),
  mode: Mode = "local",
  settings = getSettings(),
  view: BoardView | null = null,
  candidate: Point | null = null,
  timer: ReturnType<typeof setTimeout> | null = null,
  resultTimer: ReturnType<typeof setTimeout> | null = null,
  lockedUntil = 0;
let resultPending = false;
let reversi: ReversiController | null = null;
let chess: ChessController | null = null;
let blackjack: BlackjackController | null = null;
let yacht: YachtController | null = null;
let betting: BettingController | null = null;
let janggi: JanggiController | null = null;
let janggiOptions: JanggiOptions = {
  mode: "local",
  difficulty: "normal",
  color: "black",
  formation: "NENE",
  rivalFormation: "NENE",
};
// Kept for this page only, per betting game.
const bettingOptions: Record<string, BettingOptions> = {
  seotda: { opponents: 2, variant: "two" },
  "seven-poker": { opponents: 3 },
  "texas-holdem": { opponents: 3 },
};
// Kept for this page only, like the chess preferences.
let yachtOptions: YachtOptions = { mode: "solo" };
let yut: YutController | null = null;
let yutOptions: YutOptions = { mode: "ai", players: 2, names: [] };
let points: PointController | null = null;
let spider: SpiderController | null = null;
let spiderOptions: SpiderOptions = { suits: "1" };
/** Klondike and FreeCell share the patience screen; what was last chosen for each is kept for this page only. */
let patience: PatienceController | null = null;
let klondikeOptions: KlondikeOptions = { draw: "1" };
let freecellOptions: FreeCellOptions = { deal: "random", number: "1" };
let tour: TourController | null = null;
let tourOptions: TourOptions = { opponents: 1, humans: 1, names: [] };
let conquest: ConquestController | null = null;
let conquestOptions: ConquestOptions = { ...CONQUEST_DEFAULTS, names: [] };
/** The games that share the point-board screen, and what was last chosen for each. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pointGames: Record<string, { config: PointConfig<any>; options: PointOptions }> = {
  "hexa-germ-war": { config: hexaConfig, options: { mode: "ai", variant: "classic", level: "normal" } },
  "nine-men's-morris": { config: morrisConfig, options: { mode: "ai", variant: "", level: "normal" } },
  gonu: { config: gonuConfig, options: { mode: "ai", variant: "well", level: "normal" } },
  checkers: { config: checkersConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "dots-and-boxes": { config: dotsConfig, options: { mode: "ai", variant: "5", level: "normal" } },
  hex: { config: hexConfig, options: { mode: "ai", variant: "9", level: "normal" } },
  mancala: { config: mancalaConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "snakes-and-ladders": { config: snakesConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "battleship": { config: seaBattleConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "four-in-a-row": { config: fourRowConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "twist-five": { config: twistConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "hare-and-hounds": { config: hareConfig, options: { mode: "ai", variant: "hounds", level: "normal" } },
  "number-baseball": { config: hitBlowConfig, options: { mode: "ai", variant: "3", level: "normal" } },
  "wall-race": { config: wallRaceConfig, options: { mode: "ai", variant: "", level: "normal" } },
  dominoes: { config: dominoConfig, options: { mode: "ai", variant: "", level: "normal" } },
  alkkagi: { config: alkkagiConfig, options: { mode: "ai", variant: "go-5", level: "normal" } },
  carrom: { config: carromConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "tile-rummy": { config: tileRummyConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "chinese-checkers": { config: starHopConfig, options: { mode: "ai", variant: "", level: "normal" } },
  ludo: { config: ludoConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "pocket-ball": { config: poolConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "indian-poker": { config: indianConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "go-stop": { config: gostopConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "table-soccer": { config: foosballConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "falling-blocks": { config: blocksConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "2048": { config: mergeConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "brick-breaker": { config: bricksConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "peg-solitaire": { config: pegConfig, options: { mode: "ai", variant: "full", level: "normal" } },
  "marble-shot": { config: marbleConfig, options: { mode: "ai", variant: "6", level: "normal" } },
  "water-pouring": { config: pourConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "river-crossing": { config: riverConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "tower-of-hanoi": { config: hanoiConfig, options: { mode: "ai", variant: "3", level: "normal" } },
  "lights-on": { config: lightsConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "queens-on-the-board": { config: queensConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "knight-tour": { config: knightConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "turning-maze": { config: tiltConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "haunted-mirrors": { config: hauntConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "building-puzzle": { config: skylineConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "balance-quiz": { config: balanceConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  snake: { config: snakeConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "whack-a-mole": { config: whackConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  fishing: { config: fishingConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "valet-parking": { config: valetConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "slot-machine": { config: slotMachineConfig, options: { mode: "ai", variant: "1000", level: "normal" } },
  "tic-tac-toe": { config: tictactoeConfig, options: { mode: "ai", variant: "classic", level: "normal" } },
  "air-hockey": { config: airHockeyConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "table-tennis": { config: tableTennisConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  badminton: { config: badmintonConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  basketball: { config: basketballConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "claw-machine": { config: clawConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "fox-and-geese": { config: foxGeeseConfig, options: { mode: "ai", variant: "geese", level: "normal" } },
  hnefatafl: { config: taflConfig, options: { mode: "ai", variant: "defenders", level: "normal" } },
  "royal-game-of-ur": { config: urConfig, options: { mode: "ai", variant: "", level: "normal" } },
  tents: { config: tentsConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "game-of-the-amazons": { config: amazonsConfig, options: { mode: "ai", variant: "", level: "normal" } },
  backgammon: { config: backgammonConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "one-card": { config: oneCardConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "old-maid": { config: oldMaidConfig, options: { mode: "ai", variant: "", level: "normal" } },
  hula: { config: hulaConfig, options: { mode: "ai", variant: "3", level: "normal" } },
  curling: { config: curlingConfig, options: { mode: "ai", variant: "3", level: "normal" } },
  "star-battle": { config: starBattleConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  pipes: { config: pipesConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  // Titled 하시 (HASHI) at the user's request; its id follows the catalog's English name.
  hashi: { config: bridgesConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "train-tracks": { config: tracksConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "parking-escape": { config: parkingConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "glide-cube": { config: glideConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "trap-the-cat": { config: trapCatConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "bulb-link": { config: bulbLinkConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "telescope-push": { config: telescopeConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "light-cable": { config: lightCableConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "mahjong-solitaire": { config: mahjongConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  minesweeper: { config: minesConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "fruit-merge": { config: fruitConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "meat-grill": { config: grillConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  go: { config: goConfig, options: { mode: "ai", variant: "19", level: "normal" } },
  "sliding-puzzle": { config: slideConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  darts: { config: dartsConfig, options: { mode: "ai", variant: "countup", level: "normal" } },
  bowling: { config: bowlingConfig, options: { mode: "ai", variant: "duel", level: "normal" } },
  "mini-golf": { config: minigolfConfig, options: { mode: "ai", variant: "duel", level: "normal" } },
  "frog-hop": { config: frogConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "laser-reflection": { config: laserConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  nim: { config: nimConfig, options: { mode: "ai", variant: "nim", level: "normal" } },
  "tactical-battle": { config: tacticsConfig, options: { mode: "ai", variant: "dungeon", level: "normal" } },
  "number-code": { config: numberCodeConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "carom-billiards": { config: caromConfig, options: { mode: "ai", variant: "four", level: "normal" } },
  "laser-chess": { config: laserChessConfig, options: { mode: "ai", variant: "classic", level: "normal" } },
  archery: { config: archeryConfig, options: { mode: "ai", variant: "match", level: "normal" } },
  tuho: { config: tuhoConfig, options: { mode: "ai", variant: "1", level: "normal" } },
  "coin-pusher": { config: coinPusherConfig, options: { mode: "ai", variant: "30", level: "normal" } },
  roulette: { config: rouletteConfig, options: { mode: "ai", variant: "", level: "normal" } },
  shooting: { config: shootingConfig, options: { mode: "ai", variant: "bb", level: "normal" } },
  "marble-push": { config: marblePushConfig, options: { mode: "ai", variant: "standard", level: "normal" } },
  // 헥스 정복전 is a territory game like 대륙 쟁탈전, played on the point-game screen.
  "hex-conquest": { config: hexConquestConfig, options: { mode: "ai", variant: "", level: "normal" } },
  // 슬롯 카: the course is the variant; laps, computers and people are its settings.
  "slot-car": { config: slotCarConfig, options: { mode: "ai", variant: "eight", level: "normal" } },
  // 축구: the variant is the pitch (flat or gravity); the waiting room's teams and the limits are its settings.
  soccer: { config: soccerConfig, options: { mode: "ai", variant: "flat", level: "normal" } },
  // 금화 쟁탈전: the variant is the castle's size (60, 100 or 150 gold) or three minutes on the clock.
  "gold-raid": { config: goldRaidConfig, options: { mode: "ai", variant: "100", level: "normal" } },
  // 활잡이 결투: the variant is the field (windy or calm); the gap and the mounds are laid afresh each game.
  "archer-duel": { config: bowDuelConfig, options: { mode: "ai", variant: "wind", level: "normal" } },
};
let chessOptions = { difficulty: "normal", color: "white" } as import("../core/ai").AIOptions;
const ai = new AIClient();
/** Whether a stone may make two open threes at once (삼삼); kept for this page only. */
let allowDoubleThree = true;
/** Why the last point chosen was refused, shown until the next choice. */
let refusal = "";
const tally = (t: Tally) => `${t.win}승 ${t.loss}패 ${t.draw}무`;
let reversiOptions = getReversiOptions();
let aiOptions = getAIOptions(),
  difficulty: Difficulty = aiOptions.difficulty,
  human: Player = 1;
let sessionGeneration = 0;
let aiError = "";
/** Gomoku over Wi-Fi (와이파이 여럿이): the room's game is on the table; `wantWifi`, the setup chose it. */
let wifi = false,
  wantWifi = false;
const isAITurn = () => (wifi ? gomokuRoom.computer(state) : mode === "ai" && state.turn !== human);
const gomokuRoom: NetTable<typeof state> = new NetTable<typeof state>({
  net: gomokuNet,
  title: "오목",
  // 삼삼 is the host's choice.
  options: () => ({ noDoubleThree: !allowDoubleThree }),
  begin(next, fresh) {
    wifi = true;
    mode = "local";
    difficulty = aiOptions.difficulty;
    if (fresh) {
      state = next;
      lockedUntil = 0;
      refusal = "";
      game();
      return;
    }
    // Rebuilt from the room's list (an undo, a return): shown at once.
    sessionGeneration++;
    ai.cancel();
    if (timer) clearTimeout(timer);
    if (resultTimer) clearTimeout(resultTimer);
    timer = resultTimer = null;
    resultPending = false;
    state = next;
    candidate = null;
    refusal = "";
    aiError = "";
    lockedUntil = performance.now() + 200;
    view?.renderState(state, false);
    update();
    scheduleAI();
  },
  show: (next) => accept(next),
  resting: () => !!view && !view.animating && performance.now() >= lockedUntil,
  table: () => !!view && !!document.getElementById("undo"),
  update: () => update(),
  resume: () => scheduleAI(),
  back: () => leave(),
});
function newMatch() {
  // Keep the current selection even when browser storage is unavailable.
  difficulty = aiOptions.difficulty;
  human =
    aiOptions.color === "white"
      ? 2
      : aiOptions.color === "random"
        ? Math.random() < 0.5
          ? 1
          : 2
        : 1;
  state = createGame(!allowDoubleThree);
  lockedUntil = 0;
  refusal = "";
}
function difficultyOptions(selected: Difficulty) {
  return difficulties
    .map(
      (d) =>
        `<option value="${d}" ${d === selected ? "selected" : ""}>${profiles[d].label}</option>`,
    )
    .join("");
}
function aiForm() {
  return `<div id="ai-options" class="ai-options" ${mode === "ai" ? "" : "hidden"}><label>AI 난이도<select id="ai-difficulty">${difficultyOptions(aiOptions.difficulty)}</select></label><label>플레이어 색상<select id="ai-color"><option value="black" ${aiOptions.color === "black" ? "selected" : ""}>흑돌</option><option value="white" ${aiOptions.color === "white" ? "selected" : ""}>백돌</option><option value="random" ${aiOptions.color === "random" ? "selected" : ""}>무작위</option></select></label><small>선택한 설정은 새 대국부터 적용됩니다.</small><small id="ai-stats" class="stats"></small></div>`;
}
const sound = new Sound();
sound.enabled = settings.sound;
music.enabled = settings.music;
music.attach();
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
function header() {
  return `<header><button class="brand" id="home" aria-label="World Table Games 홈"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><span class="brand-name">World Table Games<small>세계의 게임, 한 테이블에서</small></span></button><button class="icon-button" id="settings" aria-label="설정"><span aria-hidden="true">⚙</span></button></header>`;
}
function bindHeader() {
  $("home").onclick = () => menu();
  $("settings").onclick = showSettings;
}
function clear() {
  janggi?.dispose();
  janggi = null;
  betting?.dispose();
  betting = null;
  yacht?.dispose();
  yacht = null;
  yut?.dispose();
  yut = null;
  points?.dispose();
  points = null;
  spider?.dispose();
  spider = null;
  patience?.dispose();
  patience = null;
  tour?.dispose();
  tour = null;
  conquest?.dispose();
  conquest = null;
  blackjack?.dispose();
  blackjack = null;
  chess?.dispose();
  chess = null;
  reversi?.dispose();
  reversi = null;
  sessionGeneration++;
  ai.cancel();
  if (timer) clearTimeout(timer);
  if (resultTimer) clearTimeout(resultTimer);
  timer = resultTimer = null;
  view?.dispose();
  view = null;
  candidate = null;
  aiError = "";
  resultPending = false;
}
type GameSelection =
  | "gomoku"
  | "reversi"
  | "chess"
  | "blackjack"
  | "yacht-dice"
  | "seotda"
  | "seven-poker"
  | "texas-holdem"
  | "janggi"
  | "yut-nori"
  | "hexa-germ-war"
  | "nine-men's-morris"
  | "gonu"
  | "checkers"
  | "dots-and-boxes"
  | "hex"
  | "mancala"
  | "snakes-and-ladders"
  | "spider"
  | "klondike"
  | "freecell"
  | "world-tour"
  | "continent-conquest"
  | "hex-conquest"
  | "battleship"
  | "four-in-a-row"
  | "twist-five"
  | "hare-and-hounds"
  | "number-baseball"
  | "wall-race"
  | "dominoes"
  | "alkkagi"
  | "carrom"
  | "tile-rummy"
  | "chinese-checkers"
  | "ludo"
  | "pocket-ball"
  | "indian-poker"
  | "go-stop"
  | "table-soccer"
  | "falling-blocks"
  | "2048"
  | "brick-breaker"
  | "peg-solitaire"
  | "marble-shot"
  | "water-pouring"
  | "river-crossing"
  | "tower-of-hanoi"
  | "lights-on"
  | "queens-on-the-board"
  | "knight-tour"
  | "turning-maze"
  | "haunted-mirrors"
  | "building-puzzle"
  | "balance-quiz"
  | "snake"
  | "whack-a-mole"
  | "fishing"
  | "valet-parking"
  | "slot-machine"
  | "tic-tac-toe"
  | "air-hockey"
  | "table-tennis"
  | "badminton"
  | "basketball"
  | "claw-machine"
  | "fox-and-geese"
  | "hnefatafl"
  | "royal-game-of-ur"
  | "tents"
  | "game-of-the-amazons"
  | "backgammon"
  | "one-card"
  | "old-maid"
  | "hula"
  | "curling"
  | "star-battle"
  | "pipes"
  | "hashi"
  | "train-tracks"
  | "parking-escape"
  | "glide-cube"
  | "trap-the-cat"
  | "bulb-link"
  | "telescope-push"
  | "light-cable"
  | "mahjong-solitaire"
  | "minesweeper"
  | "fruit-merge"
  | "meat-grill"
  | "go"
  | "sliding-puzzle"
  | "darts"
  | "bowling"
  | "mini-golf"
  | "frog-hop"
  | "laser-reflection"
  | "nim"
  | "tactical-battle"
  | "number-code"
  | "carom-billiards"
  | "laser-chess"
  | "archery"
  | "tuho"
  | "coin-pusher"
  | "roulette"
  | "shooting"
  | "marble-push"
  | "slot-car"
  | "soccer"
  | "gold-raid"
  | "archer-duel"
  | null;
function gomokuSetup() {
  return `<section class="featured"><div class="feature-copy"><span class="game-number">NO. 01 — STRATEGY</span><h2>오목 <span>Gomoku</span></h2><p>다섯 개의 돌, 무한한 가능성.<br>단순한 규칙 속 깊은 한 수를 만나보세요.</p><div class="game-meta">2인 · 약 10분 · 전략 보드게임</div><div class="mode-select"><label><input type="radio" name="mode" value="local" ${mode === "local" && !wantWifi ? "checked" : ""}> 로컬 2인</label><label><input type="radio" name="mode" value="ai" ${mode === "ai" && !wantWifi ? "checked" : ""}> 컴퓨터 대전</label><label><input type="radio" name="mode" value="net" ${wantWifi ? "checked" : ""}> 와이파이 여럿이</label></div>${aiForm()}<label class="rule-option"><input type="checkbox" id="allow-33" ${allowDoubleThree ? "checked" : ""}> 삼삼(3-3) 허용<small>끄면 열린 삼을 한 번에 두 개 만드는 수를 둘 수 없습니다.</small></label><button class="primary" id="start">테이블에 앉기 <span>↗</span></button></div><div class="feature-art" role="img" aria-label="나무 오목판 미리보기"><div class="mini-board"><div class="mini-grid">${[35, 36, 37, 48, 49, 61, 62, 73].map((n, i) => `<i style="--r:${Math.floor(n / 11)};--c:${n % 11}" class="${i % 2 ? "white" : "black"}"></i>`).join("")}</div></div><span>한 수에 담긴 작은 여행</span></div></section>`;
}
/** Wires the gomoku setup panel, in the collection or in the new-game dialog. */
function bindGomokuSetup() {
  const rememberAI = () => {
    aiOptions = {
      difficulty: $<HTMLSelectElement>("ai-difficulty").value as Difficulty,
      color: $<HTMLSelectElement>("ai-color").value as ColorChoice,
    };
    setAIOptions(aiOptions);
  };
  const showStats = () => {
    const d = $<HTMLSelectElement>("ai-difficulty").value as Difficulty;
    $("ai-stats").textContent = `${profiles[d].label} 전적 · ${tally(getStats()[d])}`;
  };
  showStats();
  $("ai-difficulty").onchange = () => {
    rememberAI();
    showStats();
  };
  $("ai-color").onchange = rememberAI;
  // Over Wi-Fi only the computer's level is asked (for a seat the host gives the computer); sides are taken in the room.
  const arrange = (chosen: string) => {
    $("ai-options").hidden = chosen === "local";
    $("ai-color").closest("label")!.hidden = chosen === "net";
  };
  arrange(document.querySelector<HTMLInputElement>("input[name=mode]:checked")!.value);
  document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((input) =>
    (input.onchange = () => arrange(document.querySelector<HTMLInputElement>("input[name=mode]:checked")!.value)),
  );
  $("start").onclick = () => {
    const chosen = document.querySelector<HTMLInputElement>("input[name=mode]:checked")!.value;
    allowDoubleThree = $<HTMLInputElement>("allow-33").checked;
    wantWifi = chosen === "net";
    // Over Wi-Fi the room's window comes first; the game begins when the host starts it.
    if (wantWifi) return gomokuRoom.open();
    gomokuRoom.leave();
    wifi = false;
    mode = chosen as Mode;
    newMatch();
    game();
  };
}
/** The new-game dialog: the same panel as in the collection. */
function askNewGame() {
  setupDialog(fillGomokuSetup);
}
/** The setup in a window over the table: over Wi-Fi a request to the room instead. */
function fillGomokuSetup(host: HTMLElement) {
  if (wifi && gomokuRoom.playing) return gomokuRoom.newGame(host);
  host.innerHTML = gomokuSetup();
  bindGomokuSetup();
}
/**
 * Leaves a table for the collection and brings the game that was played back into view, its tile in the middle of
 * the screen and in focus (the user asked: not the top of the page).
 */
/**
 * A tile pressed enters its game at once (the user asked): the setup is laid where the panel used to be (unseen),
 * the page behind becomes the game's own table (its picture), and the setup is carried into the entry window over
 * it. Nothing is played until its start is pressed, so a game begins once, with what was chosen.
 */
function enter(id: Exclude<GameSelection, null>, category: string, people: string) {
  menu(id, category, people);
  const panel = document.getElementById("game-detail"),
    game = games.find((g) => g.en.toLowerCase().replaceAll(" ", "-") === id);
  if (!panel || !game) return;
  const shot = thumb(id);
  // The panel itself goes into the window, so that a setup that draws itself again (the tour's names, a game whose
  // choices change its form) draws there; the window's body is now the region its name was given to.
  panel.removeAttribute("role");
  panel.removeAttribute("aria-label");
  // The window offers the game's own 게임 방법 too (the user asked), over it, and back to it when closed.
  const rules = id === "gomoku" ? showRules : (reversi ?? chess ?? betting ?? janggi ?? spider ?? patience ?? tour ?? conquest ?? points ?? yut ?? yacht ?? blackjack)?.rules;
  app.innerHTML = `<main class="entry-backdrop" aria-hidden="true">${shot ? `<img src="${shot}" alt="">` : ""}</main>`;
  entryDialog(game.name, `${game.name} 대국 설정`, [panel], leave, rules);
}
/** The games of this edition, each with whether it has 와이파이 여럿이 (the collection's 참가하기 routes to them). */
function wifiGames(): Playable[] {
  return games.filter((g) => g.available).map((g) => {
    const id = idOf(g.en);
    return { id, name: g.name, wifi: OWN_WIFI.includes(id) || !!pointGames[id]?.config.net };
  });
}
/**
 * A room chosen in the collection's 참가하기: its game is mounted as a tile press would (its setup laid unseen),
 * the setup's 와이파이 여럿이 is chosen and its start pressed, and the room window that opens joins as a guest by the
 * plan, over the game's picture. No setup window comes between; the host's room decides the rest.
 */
function joinRoom(plan: JoinPlan) {
  planJoin(plan);
  menu(plan.game as Exclude<GameSelection, null>);
  const panel = document.getElementById("game-detail"),
    wifiPill = panel?.querySelector<HTMLInputElement>('.mode-select input[value="net"]');
  if (panel && wifiPill) {
    wifiPill.checked = true;
    wifiPill.dispatchEvent(new Event("change", { bubbles: true }));
    // A setup that draws itself again on a change has a new start button by now.
    panel.querySelector<HTMLButtonElement>(".feature-copy button.primary")?.click();
  }
  if (joinPending()) {
    // Nothing took the plan (a game without Wi-Fi play here): back to the collection.
    planJoin(null);
    return leave();
  }
  const shot = thumb(plan.game);
  app.innerHTML = `<main class="entry-backdrop" aria-hidden="true">${shot ? `<img src="${shot}" alt="">` : ""}</main>`;
}
function leave() {
  const id = document.documentElement.dataset.game;
  menu();
  const entry = id ? document.querySelector<HTMLElement>(`.game-entry[data-game="${CSS.escape(id)}"]`) : null;
  if (!entry) return;
  entry.scrollIntoView({ block: "center", behavior: "auto" });
  entry.querySelector<HTMLButtonElement>(".game-card")?.focus({ preventScroll: true });
}
function menu(selected: GameSelection = null, category = "전체", people = "전체") {
  // The table sat down at from here plays this game's music (Korean or Indian for some, arcade pop or rock for some
  // arcade games, jazz for the rest).
  if (selected) {
    music.game = selected;
    // The table sat down at knows which game it is (its information is laid over the table for some).
    document.documentElement.dataset.game = selected;
  }
  // A gomoku room over Wi-Fi is left with its table.
  gomokuRoom.leave();
  wifi = false;
  clear();
  app.innerHTML = header() +
    `<main class="library"><section class="hero"><div class="hero-copy"><div class="eyebrow">The world, at your table${EDITION === "student" ? `<span class="edition-mark">학생용</span>` : ""}</div><h1>World <em>Table</em> Games</h1><p class="made-by">made by KSK</p><p class="intro">오래도록 사랑받은 게임들, 새로운 테이블 위에서.<br>잠깐의 여유를 위한 당신만의 게임 컬렉션.</p></div><div class="hero-actions">${canJoin() ? `<button id="join-room" class="hero-join" aria-haspopup="dialog">${QR_MARK}<span><b>참가하기</b><small>방장의 QR 찍고 바로 입장</small></span></button>` : ""}<button id="update-log" class="hero-log" aria-haspopup="dialog"><span><b>업데이트 로그</b><small>새로 추가된 기능</small></span></button></div></section><div class="collection-heading"><h2>게임 컬렉션 <span>${String(games.filter(g => g.available).length).padStart(2,"0")} / ${String(games.length).padStart(2,"0")}</span></h2><div class="filters" role="group" aria-label="게임 카테고리">${["전체", "보드게임", "카드게임", "주사위게임", "퍼즐게임", "아케이드게임", "스포츠게임"].map((x) => `<button class="filter ${x === category ? "active" : ""}" data-category="${x}" aria-label="${x}" aria-pressed="${x === category}">${x}<span aria-hidden="true">${x === "전체" ? games.length : games.filter((g) => g.category === x).length}</span></button>`).join("")}</div><div class="filters people" role="group" aria-label="인원">${["전체", "1인용", "2인용"].map((x) => `<button class="filter ${x === people ? "active" : ""}" data-players="${x}" aria-label="인원 ${x}" aria-pressed="${x === people}">${x === "전체" ? "인원 전체" : x}<span aria-hidden="true">${x === "전체" ? games.length : games.filter((g) => g.players === x).length}</span></button>`).join("")}</div></div><div class="collection game-list game-grid" id="game-rail">${games.map((g, i) => {
      const id = g.en.toLowerCase().replaceAll(" ", "-"), expanded = selected === id;
      const out = (category !== "전체" && category !== g.category) || (people !== "전체" && people !== g.players);
      return `<article class="game-entry ${expanded ? "expanded" : ""}" data-game="${id}" data-category="${g.category}" data-players="${g.players}" ${out ? "hidden" : ""}><button class="game-card" id="select-game-${i}" ${g.available ? `aria-label="${g.name} 살펴보기" aria-haspopup="dialog"` : `disabled aria-label="${g.name} 개발 예정"`}><span class="card-index" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span class="game-icon icon-${i}${thumb(id) ? " shot" : ""}" aria-hidden="true">${thumb(id) ? `<img src="${thumb(id)}" alt="" loading="lazy">` : g.icon}</span><span class="card-copy"><span class="card-title">${g.name}</span><small>${g.en}</small></span><span class="card-category">${g.available ? `${g.category} · ${g.players}` : "개발 예정"}</span></button></article>${
        // The chosen game's setup is laid in a panel that is never shown: it is carried into the window the game is
        // entered through (`enter`).
        expanded ? `<div class="game-stage" data-category="${g.category}" data-players="${g.players}" hidden><div id="game-detail" class="game-detail" role="region" aria-label="${g.name} 대국 설정">${selected === "gomoku" ? gomokuSetup() : ""}</div></div>` : ""
      }`;
    }).join("")}</div><footer><span>World Table Games</span><span>설치 없이, 함께 즐기는 세계의 게임</span></footer></main>`;
  bindHeader();
  // The collection has no bar across its top: the settings button stands in the corner of the title block instead.
  document.querySelector(".hero")?.append($("settings"));
  // 참가하기 (the user asked): whatever game the host chose, its QR code or its room opens that game's room here.
  const join = document.getElementById("join-room");
  if (join) join.onclick = () => openJoin({ games: wifiGames(), go: joinRoom });
  // 업데이트 로그 (the user asked): what was added, day by day (`src/core/updates.ts`).
  $("update-log").onclick = () => modal("업데이트 로그", updateLog(), [{ text: "닫기", action: () => {} }]);
  const rail = $("game-rail"),
    tiles = () => [...rail.querySelectorAll<HTMLButtonElement>(".game-entry:not([hidden]) .game-card")];
  /** Points the setup panel's notch at the chosen tile. */
  const trim = () => {
    // The observer may still fire once after the collection has been left.
    if (!rail.isConnected) return;
    const stage = rail.querySelector<HTMLElement>(".game-stage"),
      chosen = rail.querySelector<HTMLElement>(".game-entry.expanded");
    if (stage && chosen) {
      const x = chosen.getBoundingClientRect().left + chosen.offsetWidth / 2 - stage.getBoundingClientRect().left;
      stage.style.setProperty("--notch", `${Math.max(28, Math.min(stage.clientWidth - 28, x))}px`);
    }
  };
  new ResizeObserver(trim).observe(rail);
  trim();
  // The arrow keys walk the tiles in reading order.
  rail.onkeydown = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const all = tiles(),
      next = all[all.indexOf(document.activeElement as HTMLButtonElement) + (e.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus();
  };
  document.querySelectorAll<HTMLButtonElement>(".game-card:not(:disabled)").forEach((button) => {
    button.onclick = () => enter(button.closest<HTMLElement>(".game-entry")!.dataset.game as Exclude<GameSelection, null>, category, people);
  });
  if (selected === "reversi") {
    reversi = mountReversi(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"),
      preferences: reversiOptions,
      remember: (options) => { reversiOptions = options; setReversiOptions(options); },
    });
  }
  if (selected === "chess") {
    chess = mountChess(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: chessOptions,
      remember: (options) => { chessOptions = options; },
    });
  }
  if (selected === "seotda" || selected === "seven-poker" || selected === "texas-holdem") {
    const nav = {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: bettingOptions[selected],
      remember: (options: BettingOptions) => { bettingOptions[selected] = options; },
    };
    betting = selected === "seotda"
      ? mountBettingGame(app, nav, seotdaConfig)
      : selected === "texas-holdem"
        ? mountBettingGame(app, nav, holdemConfig)
        : mountBettingGame(app, nav, pokerConfig);
  }
  if (selected === "janggi") {
    janggi = mountJanggi(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: janggiOptions,
      remember: (options) => { janggiOptions = options; },
    });
  }
  if (selected === "spider") {
    spider = mountSpider(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: spiderOptions,
      remember: (options) => { spiderOptions = options; },
    });
  }
  if (selected === "klondike")
    patience = mountPatience(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: klondikeOptions,
      remember: (options: KlondikeOptions) => { klondikeOptions = options; },
    }, klondikeConfig);
  if (selected === "freecell")
    patience = mountPatience(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: freecellOptions,
      remember: (options: FreeCellOptions) => { freecellOptions = options; },
    }, freecellConfig);
  if (selected === "world-tour") {
    tour = mountTour(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: tourOptions,
      remember: (options) => { tourOptions = options; },
    });
  }
  if (selected === "continent-conquest") {
    conquest = mountConquest(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: conquestOptions,
      remember: (options) => { conquestOptions = options; },
    });
  }
  if (selected && pointGames[selected]) {
    const entry = pointGames[selected];
    points = mountPointGame(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: entry.options,
      remember: (options: PointOptions) => { entry.options = options; },
    }, entry.config);
  }
  if (selected === "yut-nori") {
    yut = mountYut(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: yutOptions,
      remember: (options) => { yutOptions = options; },
    });
  }
  if (selected === "yacht-dice") {
    yacht = mountYacht(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"), preferences: yachtOptions,
      remember: (options) => { yachtOptions = options; },
    });
  }
  if (selected === "blackjack") {
    blackjack = mountBlackjack(app, {
      header, bindHeader, back: leave, settings,
      setupHost: $("game-detail"),
    });
  }
  if (selected === "gomoku") bindGomokuSetup();
  // The setup panel shows the game's own table in place of drawn art.
  const art = document.querySelector<HTMLElement>(".game-stage .feature-art"),
    shot = selected && thumb(selected);
  if (art && shot) {
    art.classList.add("shot");
    art.innerHTML = `<img src="${shot}" alt="">`;
  }
  // Two rows of filters, by kind and by how many play; a tile shows when it passes both.
  document.querySelectorAll<HTMLButtonElement>(".filter").forEach((button) =>
    (button.onclick = () => {
      if (button.dataset.players) people = button.dataset.players;
      else category = button.dataset.category!;
      button.parentElement!.querySelectorAll(".filter").forEach((x) => {
        x.classList.toggle("active", x === button);
        x.setAttribute("aria-pressed", String(x === button));
      });
      document.querySelectorAll<HTMLElement>(".game-entry, .game-stage").forEach(
        (entry) => (entry.hidden = (category !== "전체" && entry.dataset.category !== category) || (people !== "전체" && entry.dataset.players !== people)),
      );
      trim();
    }),
  );
}
function game() {
  clear();
  app.innerHTML =
    header() +
    `<main class="game-layout"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>오목 <small>GOMOKU</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="camera" aria-pressed="${settings.top}">시점 전환</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE GOMOKU TABLE</span><span>15 × 15 · ${state.noDoubleThree ? "삼삼 금지" : "삼삼 허용"}</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div id="turn" role="status" aria-live="polite"></div><div class="player"><i class="stone black"></i><span>흑돌<small>${wifi ? gomokuRoom.who(0) : mode === "ai" ? (human === 1 ? "나" : `컴퓨터 · ${profiles[difficulty].label}`) : "플레이어 1"}</small></span><b>선공</b></div><div class="player"><i class="stone white"></i><span>백돌<small>${wifi ? gomokuRoom.who(1) : mode === "ai" ? (human === 2 ? "나" : `컴퓨터 · ${profiles[difficulty].label}`) : "플레이어 2"}</small></span></div><p class="hint">가로, 세로, 대각선으로<br>다섯 개의 돌을 먼저 연결하세요.</p><div class="assist"><button id="undo">무르기</button></div><p class="input-help">마우스: 교차점을 클릭하여 착수<br>터치: 교차점을 누르면 바로 착수<br>키보드: 방향키로 선택, Enter로 착수</p></aside></div></main>`;
  bindHeader();
  $("back").onclick = leave;
  $("rules").onclick = showRules;
  dress(fillGomokuSetup, [".assist"]);
  if (wifi) gomokuRoom.dress();
  $("camera").onclick = () => {
    settings.top = !settings.top;
    setSettings(settings);
    view?.setCamera(settings.top);
    $("camera").setAttribute("aria-pressed", String(settings.top));
    candidate = null;
    update();
  };
  $("undo").onclick = takeBack;
  try {
    view = new BoardView($("board"), settings.quality);
    view.onContact = () => sound.stone();
    view.onSelect = (p, confirm) => {
      refusal = "";
      // Over Wi-Fi a tap out of my turn is told why.
      if (wifi && p && confirm && view && !view.moving && state.winner === null && !gomokuRoom.mine(state)) return gomokuRoom.warn(state);
      if (!p || !canPlay() || state.board[p.row][p.col] || barred(p)) {
        if (p && canPlay() && barred(p)) refusal = "삼삼 금지 자리입니다. 다른 곳에 두세요.";
        view?.preview(null, state.turn);
        candidate = null;
        update();
        return;
      }
      candidate = p;
      view?.preview(p, state.turn);
      update();
      if (confirm) place(p);
    };
    view.setLabels(settings.labels);
    view.renderState(state, false);
    if (settings.top) view.setCamera(true);
    const canvas = view.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (e) => {
      if (!canPlay()) return;
      const p = candidate ?? { row: 7, col: 7 };
      const directions: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (directions[e.key]) {
        e.preventDefault();
        const [r, c] = directions[e.key];
        candidate = {
          row: Math.max(0, Math.min(14, p.row + r)),
          col: Math.max(0, Math.min(14, p.col + c)),
        };
        view?.preview(candidate, state.turn);
        update();
      } else if (e.key === "Enter") {
        e.preventDefault();
        place(p);
      }
    });
  } catch {
    view?.dispose();
    view = null;
    $("board").innerHTML =
      '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 최신 브라우저에서 하드웨어 가속을 켜고 다시 시도해 주세요.</p></div>';
  }
  update();
  scheduleAI();
  if (state.winner) {
    resultPending = true;
    showResult();
  }
}
function canPlay() {
  return (
    view !== null &&
    !view.moving &&
    state.winner === null &&
    performance.now() >= lockedUntil &&
    !isAITurn() &&
    (!wifi || gomokuRoom.mine(state)) &&
    !document.querySelector("dialog[open]")
  );
}
/** A point the double-three rule refuses to the player to move. */
const barred = (p: Point) =>
  !!state.noDoubleThree && !state.board[p.row][p.col] && play(state, p) === null;
function place(p: Point) {
  if (!canPlay()) return;
  sound.unlock();
  const next = play(state, p);
  // Over Wi-Fi the stone goes to the room; it is shown when the room tells it (at once on the host's device).
  if (next && wifi) {
    candidate = null;
    view?.preview(null, state.turn);
    gomokuRoom.commit(gomokuMove(p));
    update();
  } else if (next) accept(next);
  else if (barred(p)) {
    refusal = "삼삼 금지 자리입니다. 다른 곳에 두세요.";
    candidate = null;
    view?.preview(null, state.turn);
    update();
  }
}
function accept(next: typeof state) {
  state = next;
  aiError = "";
  refusal = "";
  candidate = null;
  if (state.winner && mode === "ai" && !wifi)
    addResult(
      difficulty,
      state.winner === "draw" ? "draw" : state.winner === human ? "win" : "loss",
    );
  lockedUntil = performance.now() + 320;
  view?.renderState(state);
  update();
  if (state.winner) {
    resultPending = true;
    resultTimer = setTimeout(showResult, 850);
  } else scheduleAI();
}
/** How many moves one press of 무르기 takes back; 0 when it is unavailable. */
function undoCount() {
  if (wifi) return gomokuRoom.canUndo() ? 1 : 0;
  if (state.winner || !state.moves.length) return 0;
  if (mode === "local") return 1;
  // Against the computer, return to the person's own previous turn.
  if (isAITurn()) return state.moves.at(-1)!.player === human ? 1 : 0;
  return state.moves.length >= 2 ? 2 : 0;
}
function takeBack() {
  const count = undoCount();
  // A take-back may come while the table is still turning to the next player.
  if (!count || !view || document.querySelector("dialog[open]")) return;
  // Over Wi-Fi an undo is a request the other accepts; the room then rebuilds the game on both devices.
  if (wifi) return gomokuRoom.undo();
  const previous = undo(state, count);
  if (!previous) return;
  // Drop any search for the abandoned position before replacing the state.
  ai.cancel();
  if (timer) clearTimeout(timer);
  timer = null;
  state = previous;
  aiError = "";
  candidate = null;
  lockedUntil = performance.now() + 200;
  refusal = "";
  view.renderState(state, false);
  update();
  scheduleAI();
}
function scheduleAI() {
  if (!isAITurn() || state.winner || !view) return;
  const generation = sessionGeneration,
    snapshot = state;
  timer = setTimeout(async () => {
    if (generation !== sessionGeneration) return;
    if (document.querySelector("dialog[open]") || !view?.ready || view.moving) {
      scheduleAI();
      return;
    }
    try {
      const result = await ai.compute(
        snapshot,
        difficulty,
        1 + snapshot.moves.length * 7919,
      );
      if (
        generation !== sessionGeneration ||
        state !== snapshot ||
        !view ||
        !isAITurn()
      )
        return;
      const submit = () => {
        if (generation !== sessionGeneration || state !== snapshot || !view)
          return;
        if (document.querySelector("dialog[open]") || view.moving) {
          timer = setTimeout(submit, 100);
          return;
        }
        const next = result.move && play(state, result.move);
        // Over Wi-Fi the host's computer moves through the room, which tells both devices.
        if (next && wifi) {
          const refused = gomokuRoom.commit(gomokuMove(result.move!), state.turn - 1);
          if (refused) showAIError(refused);
        } else if (next) accept(next);
        else showAIError("컴퓨터가 유효한 수를 반환하지 못했습니다.");
      };
      submit();
    } catch (error) {
      if (
        generation !== sessionGeneration ||
        (error as Error).name === "AbortError"
      )
        return;
      showAIError((error as Error).message);
    }
  }, 350);
}
function showAIError(message: string) {
  aiError = message;
  update();
}
window.addEventListener("pagehide", (event) => {
  sessionGeneration++;
  ai.cancel();
  if (timer) clearTimeout(timer);
  if (resultTimer) clearTimeout(resultTimer);
  timer = resultTimer = null;
  if (!event.persisted) {
    view?.dispose();
    view = null;
    sound.dispose();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && view) {
    if (resultPending) showResult();
    else scheduleAI();
  }
});

function update() {
    // The status is read on the table itself: the panel's copy is not shown.
    mirrorStatus();
  if (!document.getElementById("turn")) return;
  $("turn").innerHTML =
    `<i class="stone ${state.turn === 1 ? "black" : "white"}"></i><span>${state.winner ? (wifi ? gomokuRoom.verdict(state) : state.winner === "draw" ? "무승부" : `${state.winner === 1 ? "흑" : "백"}돌 승리`) : wifi ? refusal || (gomokuRoom.line(state) ?? `${gomokuRoom.who(state.turn - 1)} 차례입니다`) : isAITurn() ? "컴퓨터가 생각 중…" : refusal || `${state.turn === 1 ? "흑" : "백"}돌의 차례입니다`}</span>`;
  if (aiError && !state.winner) {
    $("turn").textContent = aiError;
    const retry = document.createElement("button");
    retry.textContent = "AI 다시 시도";
    retry.onclick = () => {
      aiError = "";
      update();
      scheduleAI();
    };
    $("turn").append(retry);
  }
  $("move-count").textContent = `${state.moves.length}수`;
  // Where the next stone would go, now that no button names it.
  if (view) view.renderer.domElement.dataset.candidate = candidate ? `${String.fromCharCode(65 + candidate.col)}${candidate.row + 1}` : "";
  $<HTMLButtonElement>("undo").disabled = !undoCount();
}
function showResult() {
  resultTimer = null;
  if (!resultPending || !state.winner || !view) return;
  if (view.animating || document.querySelector("dialog[open]")) {
    resultTimer = setTimeout(showResult, 100);
    return;
  }
  resultPending = false;
  if (wifi ? gomokuRoom.outcome(state) === "lose" : mode === "ai" && state.winner !== "draw" && state.winner !== human)
    sound.lose();
  else sound.win();
  // No window at the end for now (the user asked): the result's word comes up in the middle of the table.
  if (!RESULT_WINDOWS) {
    finale(wifi ? gomokuRoom.outcome(state) : state.winner === "draw" ? "draw" : mode === "ai" && state.winner !== human ? "lose" : "win");
    return;
  }
  modal(
    state.winner === "draw"
      ? "멋진 승부, 무승부!"
      : `${state.winner === 1 ? "흑돌" : "백돌"}이 승리했습니다!`,
    `${resultArt(state.winner === "draw" ? "draw" : mode === "ai" && state.winner !== human ? "lose" : "win")}<p>${state.moves.length}수의 이야기가 완성되었습니다.<br>테이블에서 한 판 더 만나볼까요?</p>${mode === "ai" ? `<p class="stats">${profiles[difficulty].label} 전적 · ${tally(getStats()[difficulty])}</p>` : ""}`,
    [
      { text: "게임판 보기", action: () => {} },
      { text: "새 게임", action: askNewGame },
    ],
  );
}
function showRules() {
  modal(
    "다섯 개를 연결하세요",
    `<h3>기본 규칙</h3><ol><li>15×15 판의 <b>선이 만나는 점</b>에 돌을 놓습니다.</li><li><b>흑돌이 먼저</b> 두고, 한 번에 하나씩 번갈아 둡니다.</li><li>한 번 놓은 돌은 옮기거나 들어낼 수 없습니다.</li><li>가로·세로·대각선 중 한 방향으로 <b>자기 돌 5개 이상</b>을 먼저 이으면 이깁니다. 6개 이상(장목)도 승리로 칩니다.</li><li>225곳이 모두 찰 때까지 승부가 나지 않으면 무승부입니다.</li></ol><h3>알아 둘 모양</h3><dl class="piece-moves"><dt>열린 삼</dt><dd>양쪽이 비어 있는 세 돌. 한 수 더 두면 열린 사가 됩니다. 상대는 지금 막아야 합니다.</dd><dt>닫힌 삼</dt><dd>한쪽이 막힌 세 돌. 당장 위협은 아닙니다.</dd><dt>열린 사</dt><dd>양쪽이 비어 있는 네 돌. 양쪽을 다 막을 수 없어 사실상 승리입니다.</dd><dt>닫힌 사</dt><dd>한쪽이 막힌 네 돌. 상대가 남은 한쪽을 바로 막아야 합니다.</dd><dt>띈 삼·띈 사</dt><dd>사이에 한 칸이 빈 삼·사. 붙어 있는 모양과 같은 위협입니다.</dd></dl><h3>삼삼(3-3) 규칙</h3><dl class="piece-moves"><dt>삼삼이란</dt><dd>돌 하나로 열린 삼을 <b>한 번에 두 개</b> 만드는 수입니다.</dd><dt>설정</dt><dd>새 게임 창의 "삼삼(3-3) 허용"에서 고릅니다. 기본은 허용입니다.</dd><dt>금지로 두면</dt><dd>흑·백 모두 삼삼 자리에 둘 수 없습니다.<br>그 수로 다섯이 완성되면 둘 수 있습니다.<br>한쪽이 막힌 삼은 세지 않습니다.<br>금지 자리를 누르면 "삼삼 금지 자리입니다"라고 안내하고 돌은 놓이지 않습니다.<br>컴퓨터도 그 자리에 두지 않습니다.</dd><dt>사삼·사사</dt><dd>사와 삼을 함께 만드는 수(사삼)와 사사는 제한하지 않습니다.</dd></dl><h3>처음이라면</h3><ul><li>첫 수는 가운데(H8) 근처에 두는 것이 좋습니다.</li><li>상대의 <b>열린 삼</b>과 <b>사</b>는 보이는 즉시 막습니다.</li><li>내 돌은 한 줄로만 늘리지 말고, 두 방향으로 동시에 이어지게 둡니다.</li><li>사와 삼을 한 번에 만드는 수(사삼)는 막기 어려운 결정타입니다.</li></ul><h3>조작</h3><dl class="piece-moves"><dt>마우스</dt><dd>교차점을 클릭하면 바로 착수</dd><dt>터치</dt><dd>교차점을 누르면 바로 착수</dd><dt>키보드</dt><dd>방향키로 자리 이동, Enter로 착수</dd></dl><p>돌이 놓이는 동안과 시점이 바뀌는 동안에는 착수할 수 없습니다.</p><h3>버튼</h3><dl class="piece-moves"><dt>무르기</dt><dd>직전 수를 되돌립니다. 컴퓨터 대전에서는 컴퓨터의 응수까지 되돌려 내 차례로 돌아갑니다. 대국이 끝난 뒤에는 쓸 수 없습니다.</dd><dt>새 게임</dt><dd>설정 창이 뜹니다. 대전 방식·난이도·색상·삼삼 허용을 고르고 새로 시작합니다. "계속하기"를 누르면 하던 대국으로 돌아갑니다.</dd><dt>시점 전환</dt><dd>비스듬한 시점과 위에서 내려다보는 시점을 바꿉니다.</dd><dt>설정(⚙)</dt><dd>효과음, 렌더링 품질, 좌표(A–O, 1–15) 표시를 바꿉니다.</dd></dl><h3>컴퓨터 대전</h3><ul><li>난이도는 입문·쉬움·보통·어려움·전문가 다섯 단계입니다.</li><li>색상은 흑돌(선공)·백돌·무작위 중에서 고릅니다.</li><li>난이도별 승·패·무 전적이 이 기기에 기록됩니다.</li><li>대국 자체는 저장되지 않습니다. 새로고침하거나 컬렉션으로 나가면 끝납니다.</li></ul>`,
  );
}
function showSettings() {
  modal(
    "나만의 테이블",
    `<label class="setting">착수 효과음<input id="sound-setting" type="checkbox" ${settings.sound ? "checked" : ""}></label><label class="setting">배경음악<input id="music-setting" type="checkbox" ${settings.music ? "checked" : ""}></label><label class="setting">렌더링 품질<select id="quality-setting"><option value="high" ${settings.quality === "high" ? "selected" : ""}>높음 (최대 2×)</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>절전 (1×)</option></select></label><label class="setting">오목판 좌표 표시<input id="labels-setting" type="checkbox" ${settings.labels ? "checked" : ""}></label>`,
    [{ text: "설정 저장", action: () => {} }],
  );
  const d = document.querySelector("dialog")!;
  d.querySelector("button")!.onclick = () => {
    settings.sound = $<HTMLInputElement>("sound-setting").checked;
    settings.music = $<HTMLInputElement>("music-setting").checked;
    music.enabled = settings.music;
    settings.quality = $<HTMLSelectElement>("quality-setting").value as
      "high" | "low";
    settings.labels = $<HTMLInputElement>("labels-setting").checked;
    sound.enabled = settings.sound;
    setSettings(settings);
    view?.setLabels(settings.labels);
    view?.setQuality(settings.quality);
    reversi?.setSettings(settings);
    chess?.setSettings(settings);
    blackjack?.setSettings(settings);
    yacht?.setSettings(settings);
    yut?.setSettings(settings);
    points?.setSettings(settings);
    spider?.setSettings(settings);
    patience?.setSettings(settings);
    tour?.setSettings(settings);
    conquest?.setSettings(settings);
    betting?.setSettings(settings);
    janggi?.setSettings(settings);
    d.close();
    d.remove();
  };
}
menu();

/** The 업데이트 로그 window's body: each day and what was added on it (the student edition leaves out its missing games). */
function updateLog() {
  const days = UPDATES.map((day) => ({ ...day, items: day.items.filter((item) => EDITION !== "student" || !item.full) })).filter((day) => day.items.length);
  return `<div class="update-log">${days
    .map((day) => `<section><h3>${day.date.replaceAll("-", ". ")}.</h3><ul>${day.items.map((item) => `<li>${item.text}</li>`).join("")}</ul></section>`)
    .join("")}</div>`;
}
