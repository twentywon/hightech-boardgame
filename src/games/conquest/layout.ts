/**
 * Where things lie on the war-room table, shared by the view and the browser tests (so free of Vite-only imports):
 * the map board and its grid, the dice tray beside it, and the camera with its zoom and pan.
 */
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../engine/camera";
import type { WorldMap } from "./map";

/** The map's width and depth on the table, the x of its middle, and the height of its face. */
export const MAP_W = 16,
  MAP_D = 10,
  MAP_X = -1.25,
  MAP_Y = 0.2;
/** The dice tray at the right of the map: its middle and its size. */
export const TRAY = { x: 8.55, z: 0.15, w: 2.1, d: 3.9 };
/** What the camera keeps in view at its widest: the board and the tray, seen a little from the side so that the pieces stand. */
export const CONQUEST_SUBJECT = { half: 9.75, halfZ: 5.5, height: 0.5, lookY: 0, tilt: 1.14 };
/** On short wide screens (phones held sideways) the board is seen from higher, so that it fills more of their height. */
export const subjectFor = (aspect: number) => (aspect > 1.9 ? { ...CONQUEST_SUBJECT, tilt: 1.3 } : CONQUEST_SUBJECT);
/** How far one may zoom in. */
export const MAX_ZOOM = 4;
/** A point of the map grid (cells, from its far left corner) on the table. */
export function toWorld(map: WorldMap, gx: number, gy: number) {
  return { x: MAP_X - MAP_W / 2 + (gx * MAP_W) / map.cols, y: MAP_Y, z: -MAP_D / 2 + (gy * MAP_D) / map.rows };
}
/** A point of the table on the map grid. */
export function toGrid(map: WorldMap, x: number, z: number) {
  return { gx: ((x - MAP_X + MAP_W / 2) * map.cols) / MAP_W, gy: ((z + MAP_D / 2) * map.rows) / MAP_D };
}
/** How large a piece stands on this map: territories are smaller on a larger world, and smallest on the real one. */
export const pieceScale = (map: WorldMap) => (map.size === "world" ? WORLD_PIECES : Math.min(1, Math.sqrt(40 / map.cols)));
/** The pieces' scale on the map of the real world. */
export const WORLD_PIECES = 1;
/** The zoom and pan the camera is at: `zoom` 1 shows everything; `x`, `z` are where it looks on the table. */
export interface View {
  zoom: number;
  x: number;
  z: number;
}
/** How far the camera may look away from the middle at a zoom: nowhere at 1, to the board's edges further in. */
export function clampView(view: View): View {
  const zoom = Math.max(1, Math.min(MAX_ZOOM, view.zoom)),
    room = 1 - 1 / zoom;
  return { zoom, x: Math.max(-CONQUEST_SUBJECT.half * room, Math.min(CONQUEST_SUBJECT.half * room, view.x)), z: Math.max(-CONQUEST_SUBJECT.halfZ * room, Math.min(CONQUEST_SUBJECT.halfZ * room, view.z)) };
}
/** Sets `camera` where the view has it, for a canvas of `aspect`. */
export function placeCamera(camera: PerspectiveCamera, aspect: number, view: View) {
  const subject = subjectFor(aspect),
    distance = cameraDistance(aspect, false, subject) / view.zoom,
    tilt = subject.tilt;
  camera.fov = FOV;
  camera.aspect = aspect;
  camera.position.set(view.x, Math.sin(tilt) * distance, view.z + Math.cos(tilt) * distance);
  camera.lookAt(view.x, CONQUEST_SUBJECT.lookY, view.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
}
/** Where a point of the table is on a canvas of `width` by `height` pixels, seen as the view has it. */
export function screenOf(width: number, height: number, view: View, p: { x: number; y: number; z: number }) {
  const camera = placeCamera(new PerspectiveCamera(FOV, width / height, 0.1, 120), width / height, view),
    v = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}
