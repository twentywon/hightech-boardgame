import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import type { State } from "./rules";

export const LIGHT_COLORS: [string, string] = ["#ffc94a", "#b9b3a4"];
/** The side of the panel the lamps fill. */
const SPAN = 6.6;
/**
 * A dark panel of square lamps in a dim room. A lamp that is lit glows
 * amber and throws its light on the panel; a press sinks the lamp and
 * turns it and its neighbours over.
 */
export class LightsView extends TableView<State> {
  private lamps: T.Mesh[] = [];
  private glows: T.Mesh[] = [];
  private lit: T.MeshStandardMaterial;
  private dark: T.MeshStandardMaterial;
  private cursor: T.Mesh;
  private hint: T.Mesh;
  private size = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#14171c");
    this.scene.add(new T.HemisphereLight("#8fa3c8", "#20242c", 1.1));
    const lamp = new T.DirectionalLight("#dfe8ff", 1.1);
    lamp.position.set(-3, 10, 4);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.left = lamp.shadow.camera.bottom = -6;
    lamp.shadow.camera.right = lamp.shadow.camera.top = 6;
    this.own(lamp.shadow);
    this.scene.add(lamp);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ color: "#23272f", roughness: 0.9 }), 0, -0.5, 0).castShadow = false;
    // The panel: a slab with a brushed face and a raised rim.
    this.add(new T.BoxGeometry(SPAN + 1.2, 0.5, SPAN + 1.2), this.standard({ color: "#30353f", roughness: 0.5, metalness: 0.5 }), 0, -0.25, 0);
    this.add(new T.BoxGeometry(SPAN + 0.5, 0.06, SPAN + 0.5), this.standard({ color: "#191c22", roughness: 0.8 }), 0, 0.02, 0).castShadow = false;
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.add(new T.CylinderGeometry(0.1, 0.1, 0.08, 16), this.standard({ color: "#8a909c", metalness: 0.9, roughness: 0.3 }), x * (SPAN / 2 + 0.42), 0.02, z * (SPAN / 2 + 0.42));
    this.lit = this.standard({ color: "#ffcf5a", emissive: "#ff9d1a", emissiveIntensity: 0.55, roughness: 0.3 });
    this.dark = this.standard({ color: "#3a4352", roughness: 0.35, metalness: 0.2 });
    const cap = this.own(new T.BoxGeometry(1, 0.3, 1)),
      // The light a lamp throws round itself.
      halo = document.createElement("canvas");
    halo.width = halo.height = 128;
    const pen = halo.getContext("2d")!,
      fade = pen.createRadialGradient(64, 64, 14, 64, 64, 64);
    fade.addColorStop(0, "rgba(255,186,64,0.5)");
    fade.addColorStop(1, "rgba(255,196,74,0)");
    pen.fillStyle = fade;
    pen.fillRect(0, 0, 128, 128);
    const glow = this.own(new T.MeshBasicMaterial({ map: this.own(new T.CanvasTexture(halo)), transparent: true, depthWrite: false, blending: T.AdditiveBlending })),
      sheet = this.own(new T.PlaneGeometry(1, 1));
    for (let i = 0; i < 49; i++) {
      const mesh = new T.Mesh(cap, this.dark),
        shine = new T.Mesh(sheet, glow);
      mesh.castShadow = mesh.receiveShadow = true;
      shine.rotation.x = -Math.PI / 2;
      mesh.visible = shine.visible = false;
      this.lamps.push(mesh);
      this.glows.push(shine);
      this.scene.add(mesh, shine);
    }
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.4, 0.5, "#6fb0ff");
    this.hint = ringMesh(own, 0.4, 0.52, "#ff5a3c");
    this.scene.add(this.cursor, this.hint);
    this.begin();
  }
  private pitch() {
    return SPAN / Math.max(1, this.size);
  }
  private at(cell: number) {
    const p = this.pitch();
    return { x: ((cell % this.size) - (this.size - 1) / 2) * p, z: (Math.floor(cell / this.size) - (this.size - 1) / 2) * p };
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 3.9 : 4.1, halfZ: 4.1, height: 0.5, lookY: 0, tilt: 1.12 };
  }
  protected spots(): Spot[] {
    return this.state ? this.state.on.map((_, point) => ({ ...this.at(point), y: 0.2, r: this.pitch() * 0.5, point })) : [];
  }
  /** Shows the lamps as `on` has them, `sunk` pressed down by that much. */
  private show(on: boolean[], sunk = -1, depth = 0) {
    const p = this.pitch();
    this.lamps.forEach((mesh, i) => {
      const shine = this.glows[i];
      mesh.visible = i < on.length;
      shine.visible = i < on.length && on[i];
      if (i >= on.length) return;
      const { x, z } = this.at(i);
      mesh.material = on[i] ? this.lit : this.dark;
      mesh.scale.set(p * 0.84, 1, p * 0.84);
      mesh.position.set(x, 0.2 - (i === sunk ? depth : 0), z);
      shine.scale.set(p * 1.6, p * 1.6, 1);
      shine.position.set(x, 0.062, z);
    });
  }
  protected place(state: State) {
    this.size = state.size;
    this.show(state.on);
  }
  protected animate(before: State, state: State) {
    if (state.last === null || state.ply !== before.ply + 1 || before.size !== state.size) return false;
    const pressed = state.last;
    this.size = state.size;
    // The lamp goes down, the lights change, and it comes up again.
    this.tween(0, 90, (p) => this.show(before.on, pressed, p * 0.12));
    this.tween(90, 130, (p) => {
      this.show(state.on, pressed, (1 - p) * 0.12);
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state,
      ring = (mesh: T.Mesh, cell: number | null | undefined) => {
        mesh.visible = !!state && cell !== null && cell !== undefined && cell >= 0 && cell < state.on.length;
        if (!mesh.visible) return;
        const { x, z } = this.at(cell!);
        mesh.position.set(x, 0.37, z);
        mesh.scale.setScalar(this.pitch());
      };
    ring(this.cursor, marks.cursor);
    ring(this.hint, marks.hint?.to);
  }
}
