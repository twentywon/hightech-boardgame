import { describe, expect, it, vi } from "vitest";
import * as T from "three";
import { BoardView } from "../src/engine/board-view";
import { createGame, play } from "../src/games/gomoku/rules";

// Exercise real mesh reconciliation without requiring a DOM/WebGL context.
function board() {
  const stones = new T.Group();
  const view = Object.assign(Object.create(BoardView.prototype) as object, {
    stones, win: new T.Group(), ghost: new T.Mesh(), marker: new T.Mesh(),
    stoneMoves: [], falling: [], lastCount: -1, variant: "gomoku",
  }) as unknown as BoardView;
  return { view, stones };
}
describe("Gomoku mesh lifetime", () => {
  it("allocates only the newly placed stone and preserves existing meshes", () => {
    const { view, stones } = board();
    let state = createGame();
    view.renderState(state, false);
    for (let i = 0; i < 20; i++) {
      const previous = [...stones.children];
      state = play(state, { row: Math.floor(i / 5) * 2, col: i % 5 * 2 })!;
      expect(state).not.toBeNull();
      view.renderState(state);
      expect(stones.children).toHaveLength(i + 1);
      previous.forEach((mesh, j) => expect(stones.children[j]).toBe(mesh));
    }
  });
  it("replaces histories and resets without freeing shared assets, settling interrupted falls", () => {
    const { view, stones } = board();
    const first = play(createGame(), { row: 7, col: 7 })!;
    view.renderState(first);
    const stone = stones.children[0] as T.Mesh;
    const dispose = vi.spyOn(stone.geometry, "dispose");
    stone.position.y = 1;
    view.renderState(play(first, { row: 8, col: 8 })!, false);
    expect(stones.children[0]).toBe(stone);
    expect(stone.position.y).toBe(0.245);
    view.renderState(play(createGame(), { row: 1, col: 1 })!, false);
    expect(stones.children).toHaveLength(1);
    expect(stones.children[0]).not.toBe(stone);
    view.renderState(createGame(), false);
    expect(stones.children).toHaveLength(0);
    // The geometry is still in use by later stones of this view.
    expect(dispose).not.toHaveBeenCalled();
  });
  it("shares one geometry and one material per colour across all stones", () => {
    const { view, stones } = board();
    let state = createGame();
    for (let i = 0; i < 12; i++)
      state = play(state, { row: Math.floor(i / 4) * 2, col: (i % 4) * 2 })!;
    view.renderState(state, false);
    const meshes = stones.children as T.Mesh[];
    expect(new Set(meshes.map((m) => m.geometry)).size).toBe(1);
    expect(new Set(meshes.map((m) => m.material)).size).toBe(2);
    expect(meshes[0].material).toBe(meshes[2].material);
    expect(meshes[0].material).not.toBe(meshes[1].material);
  });
  it("reuses marker assets for the winning line", () => {
    const { view } = board();
    let state = createGame();
    for (let i = 0; i < 5; i++) {
      state = play(state, { row: 7, col: i })!;
      if (i < 4) state = play(state, { row: 0, col: i * 2 })!;
    }
    expect(state.winner).toBe(1);
    const win = (view as unknown as { win: T.Group }).win;
    (view as unknown as { setCamera: () => void }).setCamera = () => {};
    view.renderState(state, false);
    const rings = win.children as T.Mesh[];
    expect(rings).toHaveLength(5);
    expect(new Set(rings.map((m) => m.geometry)).size).toBe(1);
    expect(new Set(rings.map((m) => m.material)).size).toBe(1);
  });
});
