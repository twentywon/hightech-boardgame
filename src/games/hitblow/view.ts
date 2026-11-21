import * as T from "three";
import { wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { BACK, ENTER, describeGuess, type Guess, type State } from "./rules";

const W = 1280,
  H = 800,
  /** Canvas pixels per unit of the scene, and the height of the board's middle. */
  PX = 100,
  MID = 4.7,
  KEY_Y = 716,
  KEY_W = 98;
export const CHALK_COLORS: [string, string] = ["#f4f1e6", "#f2c94c"];
const keyX = (key: number) => 62 + key * 105;
/** Where a key of the board lies in the scene. */
export const keyAt = (key: number) => ({ x: (keyX(key) - W / 2) / PX, y: MID + (H / 2 - KEY_Y) / PX });
/** A classroom: the game is written in chalk on the blackboard, keys and all. */
export class HitBlowView extends TableView<State> {
  private canvas = document.createElement("canvas");
  private texture: T.CanvasTexture;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#cfd6c8");
    this.daylight("#ffffff", "#9a8f7c", "#fff6e2", 10, 1.6);
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = this.own(new T.CanvasTexture(this.canvas));
    this.texture.colorSpace = T.SRGBColorSpace;
    this.texture.anisotropy = 4;
    // The front wall with its dado, the board in a wooden frame, a chalk ledge.
    const wall = this.add(new T.PlaneGeometry(60, 26), this.standard({ color: "#e9e6d6", roughness: 1 }), 0, 10, -0.3);
    wall.castShadow = false;
    this.add(new T.BoxGeometry(60, 2.6, 0.1), this.standard({ color: "#8fae96", roughness: 1 }), 0, -1.3 + 1.3, -0.26).castShadow = false;
    const frame = this.standard({ map: this.own(wood()), roughness: 0.6 });
    this.add(new T.BoxGeometry(W / PX + 0.5, H / PX + 0.5, 0.2), frame, 0, MID, -0.16);
    const board = this.add(new T.PlaneGeometry(W / PX, H / PX), this.own(new T.MeshBasicMaterial({ map: this.texture })), 0, MID, -0.04);
    board.castShadow = false;
    this.add(new T.BoxGeometry(W / PX + 0.5, 0.12, 0.5), frame, 0, MID - H / PX / 2 - 0.3, 0.1);
    for (const [x, color] of [[-5.2, "#ffffff"], [-4.7, "#f2c94c"], [-4.3, "#f08a8a"]] as const)
      this.add(new T.CylinderGeometry(0.06, 0.06, 0.4, 10), this.standard({ color }), x, MID - H / PX / 2 - 0.19, 0.12).rotation.z = Math.PI / 2;
    this.add(new T.BoxGeometry(0.7, 0.2, 0.3), this.standard({ color: "#3c5a78", roughness: 1 }), 4.8, MID - H / PX / 2 - 0.14, 0.12);
    // A clock, the day's duty board, and the first row of desks seen from behind.
    this.add(new T.CylinderGeometry(0.7, 0.7, 0.1, 36), this.standard({ color: "#fbfaf4" }), 8.4, 8.6, -0.2).rotation.x = Math.PI / 2;
    this.add(new T.TorusGeometry(0.7, 0.06, 8, 36), this.standard({ color: "#2a2a2a" }), 8.4, 8.6, -0.14);
    const hand = this.standard({ color: "#222" });
    this.add(new T.BoxGeometry(0.05, 0.5, 0.03), hand, 8.4, 8.82, -0.1);
    this.add(new T.BoxGeometry(0.36, 0.05, 0.03), hand, 8.56, 8.6, -0.1);
    this.add(new T.BoxGeometry(2.2, 3.0, 0.06), this.standard({ color: "#f3ead0", roughness: 1 }), -8.6, 6.4, -0.22);
    this.add(new T.BoxGeometry(2.4, 0.3, 0.08), this.standard({ color: "#2f6b4f" }), -8.6, 7.75, -0.2);
    const boards = this.own(wood());
    boards.repeat.set(8, 8);
    const floor = this.add(new T.PlaneGeometry(60, 40), this.standard({ map: boards, color: "#c9a878", roughness: 0.7 }), 0, 0, 18);
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const top = this.standard({ color: "#d9b77e", roughness: 0.5 }),
      leg = this.standard({ color: "#6f7780", roughness: 0.5, metalness: 0.4 });
    // Desks stand to the sides only: nothing may hide the keys chalked along the bottom of the board.
    for (const x of [-10.4, 10.4]) {
      this.add(new T.BoxGeometry(3.6, 0.14, 2.2), top, x, 1.9, 6.4);
      for (const dx of [-1.6, 1.6]) for (const dz of [-0.9, 0.9]) this.add(new T.CylinderGeometry(0.06, 0.06, 1.9, 8), leg, x + dx, 0.95, 6.4 + dz);
      this.add(new T.BoxGeometry(1.0, 0.06, 1.3), this.standard({ color: x < 0 ? "#f4f1e6" : "#cfe0f2" }), x - 0.6, 2.0, 6.3).rotation.y = 0.2;
    }
    this.begin();
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 6.6 : 8.2, halfZ: 0.6, height: 9.4, lookY: 4.6, tilt: 0.16 };
  }
  protected spots(): Spot[] {
    return Array.from({ length: 12 }, (_, key) => ({ ...keyAt(key), z: 0, r: 0.5, point: key }));
  }
  /** Writes the whole board again. */
  private draw() {
    const ctx = this.canvas.getContext("2d")!,
      state = this.state,
      marks = this.marks;
    ctx.fillStyle = "#234a3a";
    ctx.fillRect(0, 0, W, H);
    // Smears of old chalk.
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = "rgba(255,255,255,0.018)";
      ctx.fillRect((i * 173) % W, (i * 97) % (H - 220), 260, 26);
    }
    if (!state) return;
    ctx.textBaseline = "middle";
    const chalk = (text: string, x: number, y: number, size: number, color = "#f4f1e6", align: CanvasTextAlign = "left") => {
      ctx.font = `700 ${size}px "Nanum Pen Script", "Gaegu", "Comic Sans MS", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y);
    };
    const column = (title: string, guesses: Guess[], x: number, color: string) => {
      chalk(title, x, 50, 36, color);
      ctx.fillStyle = color;
      ctx.fillRect(x, 78, 520, 3);
      const from = Math.max(0, guesses.length - 9);
      guesses.slice(from).forEach((guess, i) => {
        const y = 118 + i * 50,
          won = guess.strikes === state.size;
        chalk(`${from + i + 1}.`, x, y, 34, "rgba(244,241,230,0.7)");
        // Each digit in its own place, so that four of them never run into the verdict.
        guess.digits.forEach((digit, k) => chalk(String(digit), x + 84 + k * 52, y, 42, won ? "#ffd24a" : "#f4f1e6", "center"));
        chalk(won ? "정답!" : describeGuess(guess), x + 510, y, 36, won ? "#ffd24a" : guess.strikes ? "#ffb4a2" : "#bfe3c8", "right");
      });
      if (!guesses.length) chalk("아직 없음", x, 118, 30, "rgba(244,241,230,0.45)");
    };
    column("내가 던진 숫자", state.guesses[0], 70, CHALK_COLORS[0]);
    column("컴퓨터가 던진 숫자", state.guesses[1], 690, CHALK_COLORS[1]);
    ctx.fillStyle = "rgba(244,241,230,0.5)";
    ctx.fillRect(40, 588, W - 80, 3);
    // What is being keyed in, and my own number once it is fixed.
    chalk(state.phase === "secret" ? "내 숫자 정하기" : "던질 숫자", 70, 630, 32, "rgba(244,241,230,0.8)");
    for (let i = 0; i < state.size; i++) {
      // Clear of the words before them, whichever they are.
      const x = 360 + i * 70;
      ctx.strokeStyle = "#f4f1e6";
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 26, 600, 52, 60);
      if (state.entry[i] !== undefined) chalk(String(state.entry[i]), x, 632, 46, "#ffd24a", "center");
    }
    if (state.secrets[0]) chalk(`내 숫자  ${state.secrets[0].join(" ")}`, W - 70, 630, 34, "#bfe3c8", "right");
    if (state.repeat) chalk("중복 허용", 680, 630, 28, "rgba(244,241,230,0.6)", "left");
    for (let key = 0; key < 12; key++) {
      const x = keyX(key),
        open = marks.targets.includes(key),
        cursor = marks.cursor === key,
        primary = key === ENTER;
      ctx.lineWidth = cursor ? 6 : 3;
      ctx.strokeStyle = cursor ? "#ffffff" : open ? (primary ? "#ffd24a" : "#f4f1e6") : "rgba(244,241,230,0.25)";
      ctx.fillStyle = open && primary ? "rgba(255,210,74,0.22)" : "rgba(255,255,255,0.04)";
      ctx.beginPath();
      ctx.roundRect(x - KEY_W / 2 + 4, KEY_Y - 44, KEY_W - 8, 88, 14);
      ctx.fill();
      ctx.stroke();
      chalk(key <= 9 ? String(key) : key === BACK ? "지움" : "확인", x, KEY_Y + 2, key <= 9 ? 52 : 34, open ? (primary ? "#ffd24a" : "#f4f1e6") : "rgba(244,241,230,0.3)", "center");
    }
    this.texture.needsUpdate = true;
  }
  protected place() {
    this.draw();
  }
  protected animate() {
    return false;
  }
  protected mark() {
    this.draw();
  }
}
