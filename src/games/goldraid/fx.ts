import * as T from "three";
import { type Own, glint, glow, puff } from "./paint";

/** The kinds of puff the valley throws up: dust kicked by feet and wheels, a bomb's smoke and fire, glints of gold, stars of a blow, bits of wreck. */
export type PuffKind = "dust" | "smoke" | "fire" | "glint" | "star" | "chip";
interface Puff {
  sprite: T.Sprite;
  material: T.SpriteMaterial;
  kind: PuffKind;
  age: number;
  life: number;
  v: T.Vector3;
  fall: number;
  from: number;
  to: number;
  spin: number;
  fade: number;
}
const LOOK: Record<PuffKind, { colour: string; additive: boolean; opacity: number }> = {
  dust: { colour: "#d9c29a", additive: false, opacity: 0.7 },
  smoke: { colour: "#6e6862", additive: false, opacity: 0.75 },
  fire: { colour: "#ff9a3a", additive: true, opacity: 1 },
  glint: { colour: "#fff1b8", additive: true, opacity: 1 },
  star: { colour: "#fff27a", additive: true, opacity: 1 },
  chip: { colour: "#5a4030", additive: false, opacity: 1 },
};
/**
 * A pool of sprites for the valley's puffs: each is thrown out with a speed, grows or shrinks, turns, falls (or rises),
 * and fades over its life. Few are alive at once, so they cost little even where the processor draws.
 */
export class Effects {
  private pool: Puff[] = [];
  private next = 0;
  constructor(scene: T.Scene, own: Own, size = 90) {
    const maps = { soft: puff(own, 128, 3), hot: glow(own, 64, 0.2), star: glint(own, 128) };
    for (let k = 0; k < size; k++) {
      const material = own(new T.SpriteMaterial({ map: maps.soft, transparent: true, depthWrite: false })),
        sprite = new T.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 4;
      scene.add(sprite);
      this.pool.push({ sprite, material, kind: "dust", age: 0, life: 0, v: new T.Vector3(), fall: 0, from: 1, to: 1, spin: 0, fade: 1 });
    }
    this.maps = maps;
  }
  private maps: { soft: T.Texture; hot: T.Texture; star: T.Texture };
  /**
   * Throws out `count` puffs of `kind` at (x, y, z): `speed` how fast (spread round, more upward with `up`), `size` how
   * big at first and `grow` how many times that at the end, `life` seconds.
   */
  emit(kind: PuffKind, x: number, y: number, z: number, count: number, o: { speed?: number; up?: number; size?: number; grow?: number; life?: number; way?: number } = {}) {
    const look = LOOK[kind],
      speed = o.speed ?? 1,
      size = o.size ?? 0.3;
    for (let k = 0; k < count; k++) {
      const p = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      const a = Math.random() * Math.PI * 2,
        s = speed * (0.4 + Math.random() * 0.6);
      p.kind = kind;
      p.age = 0;
      p.life = (o.life ?? 0.6) * (0.7 + Math.random() * 0.6);
      p.v.set(Math.cos(a) * s + (o.way ?? 0) * speed, Math.abs(Math.sin(a)) * s * 0.6 + (o.up ?? 0), (Math.random() - 0.5) * s * 0.5);
      p.fall = kind === "chip" || kind === "glint" ? 9 : kind === "smoke" ? -0.6 : kind === "fire" ? -1.2 : kind === "dust" ? 0.4 : 3;
      p.from = size * (0.7 + Math.random() * 0.6);
      p.to = p.from * (o.grow ?? (kind === "glint" || kind === "star" ? 0.2 : kind === "chip" ? 1 : 2.4));
      p.spin = (Math.random() - 0.5) * (kind === "star" ? 8 : 2);
      p.fade = look.opacity;
      const m = p.material;
      m.map = kind === "fire" ? this.maps.hot : kind === "glint" || kind === "star" ? this.maps.star : this.maps.soft;
      m.color.set(look.colour);
      if (kind === "smoke" || kind === "dust") m.color.offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
      m.blending = look.additive ? T.AdditiveBlending : T.NormalBlending;
      m.opacity = look.opacity;
      m.rotation = Math.random() * Math.PI * 2;
      m.needsUpdate = true;
      p.sprite.position.set(x + (Math.random() - 0.5) * 0.15, y + (Math.random() - 0.5) * 0.1, z + 0.05 + Math.random() * 0.1);
      p.sprite.scale.setScalar(p.from);
      p.sprite.visible = true;
    }
  }
  update(dt: number) {
    if (dt <= 0) return;
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.sprite.visible = false;
        continue;
      }
      const f = p.age / p.life;
      p.v.y -= p.fall * dt;
      // Dust and smoke slow in the air.
      if (p.kind === "dust" || p.kind === "smoke") p.v.multiplyScalar(Math.max(0, 1 - 2.2 * dt));
      p.sprite.position.addScaledVector(p.v, dt);
      if (p.kind === "chip" && p.sprite.position.y < 0.03) {
        p.sprite.position.y = 0.03;
        p.v.set(p.v.x * 0.4, Math.abs(p.v.y) * 0.3, 0);
      }
      p.sprite.scale.setScalar(p.from + (p.to - p.from) * Math.sqrt(f));
      p.material.rotation += p.spin * dt;
      p.material.opacity = p.fade * (p.kind === "fire" ? 1 - f * f : p.kind === "glint" || p.kind === "star" ? 1 - f : f < 0.2 ? 1 : (1 - f) / 0.8);
      if (p.kind === "fire") p.material.color.setHSL(0.08 - 0.06 * f, 1, 0.6 - 0.25 * f);
    }
  }
  clear() {
    for (const p of this.pool) p.sprite.visible = false;
  }
}
