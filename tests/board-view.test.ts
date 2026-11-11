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
  it("releases replaced histories and resets, while settling interrupted falls", () => {
    const { view, stones } = board();
    const first = play(createGame(), { row: 7, col: 7 })!;
    view.renderState(first);
    const stone = stones.children[0] as T.Mesh;
    const dispose = vi.spyOn(stone.geometry, "dispose");
    stone.position.y = 1;
    view.renderState(play(first, { row: 8, col: 8 })!, false);
    expect(stones.children[0]).toBe(stone);
    expect(stone.position.y).toBe(0.245);
    expect(dispose).not.toHaveBeenCalled();
    view.renderState(play(createGame(), { row: 1, col: 1 })!, false);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(stones.children).toHaveLength(1);
    expect(stones.children[0]).not.toBe(stone);
    view.renderState(createGame(), false);
    expect(stones.children).toHaveLength(0);
  });
});
