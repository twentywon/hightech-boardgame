import * as T from "three";
import { glow, puff, type Own } from "../goldraid/paint";

/**
 * The little bursts of 활잡이 결투 where an arrow strikes: in the ground a puff of dust and a spray of earth and grass
 * bits; in an archer a quick flash of light and a few scraps of cloth in its colour (never blood). All drawn from a
 * small pool made once; `tick` moves what is alive and says whether anything still is.
 */
interface Puff {
  sprite: T.Sprite;
  material: T.SpriteMaterial;
  velocity: T.Vector3;
  age: number;
  life: number;
  size: number;
}
interface Bit {
  mesh: T.Mesh;
  velocity: T.Vector3;
  spin: T.Vector3;
  age: number;
  life: number;
  floor: number;
}
export class Bursts {
  private puffs: Puff[] = [];
  private bits: Bit[] = [];
  private flash: T.Sprite;
  private flashAge = 1;
  private cloth: T.MeshLambertMaterial;
  private earthy: T.Material[];
  constructor(scene: T.Scene, own: Own, rich: boolean) {
    const map = puff(own, 128, 4);
    for (let k = 0; k < (rich ? 12 : 8); k++) {
      const material = own(new T.SpriteMaterial({ map, color: "#cdb994", transparent: true, depthWrite: false, opacity: 0 })),
        sprite = new T.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({ sprite, material, velocity: new T.Vector3(), age: 1, life: 1, size: 1 });
    }
    const bitG = own(new T.PlaneGeometry(0.06, 0.03));
    this.earthy = ["#6d5233", "#b9a467", "#6f7d3c", "#8f7a4a"].map((c) => own(new T.MeshLambertMaterial({ color: c, side: T.DoubleSide })));
    this.cloth = own(new T.MeshLambertMaterial({ color: "#ffffff", side: T.DoubleSide }));
    for (let k = 0; k < (rich ? 26 : 16); k++) {
      const mesh = new T.Mesh(bitG, this.earthy[0]);
      mesh.visible = false;
      scene.add(mesh);
      this.bits.push({ mesh, velocity: new T.Vector3(), spin: new T.Vector3(), age: 1, life: 1, floor: 0 });
    }
    this.flash = new T.Sprite(own(new T.SpriteMaterial({ map: glow(own, 128, 0.25), color: "#fff2c8", transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false })));
    this.flash.visible = false;
    scene.add(this.flash);
  }
  /** An arrow into the ground at (x, y), come in from the way `dir` (+1: flying toward +x). */
  ground(x: number, y: number, dir: number) {
    this.puffs.slice(0, 6).forEach((p, k) => {
      p.age = 0;
      p.life = 0.7 + Math.random() * 0.5;
      p.size = 0.35 + Math.random() * 0.35;
      p.sprite.position.set(x - dir * 0.05 + (Math.random() - 0.5) * 0.15, y + 0.05, (Math.random() - 0.5) * 0.3);
      p.velocity.set(-dir * (0.2 + Math.random() * 0.5) + (Math.random() - 0.5) * 0.4, 0.4 + Math.random() * 0.6 + k * 0.05, (Math.random() - 0.5) * 0.4);
      p.sprite.visible = true;
    });
    this.spray(x, y, dir, this.bits.length * 0.6, () => this.earthy[Math.floor(Math.random() * this.earthy.length)], y - 0.02);
  }
  /** An arrow into an archer at (x, y): a flash and scraps of `colour`. */
  hit(x: number, y: number, dir: number, colour: string) {
    this.flashAge = 0;
    this.flash.position.set(x, y, 0.25);
    this.flash.visible = true;
    this.cloth.color.set(colour);
    this.spray(x, y, dir, 7, () => this.cloth, y - 1.4);
  }
  private spray(x: number, y: number, dir: number, count: number, paint: () => T.Material, floor: number) {
    let n = 0;
    for (const b of this.bits) {
      if (n >= count) break;
      if (b.age < b.life) continue;
      n++;
      b.age = 0;
      b.life = 0.7 + Math.random() * 0.6;
      b.floor = floor;
      b.mesh.material = paint();
      b.mesh.position.set(x, y + 0.03, (Math.random() - 0.5) * 0.2);
      b.mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      b.velocity.set(-dir * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 0.8, 1.4 + Math.random() * 2.2, (Math.random() - 0.5) * 1.2);
      b.spin.set(Math.random() * 14, Math.random() * 14, Math.random() * 14);
      b.mesh.visible = true;
    }
  }
  /** Moves what is alive by `dt` seconds; true while anything still is. */
  tick(dt: number) {
    let alive = false;
    for (const p of this.puffs) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const t = Math.min(1, p.age / p.life);
      p.sprite.position.addScaledVector(p.velocity, dt);
      p.velocity.multiplyScalar(Math.exp(-dt * 2.2));
      const s = p.size * (0.5 + t * 1.4);
      p.sprite.scale.set(s, s * 0.8, 1);
      p.material.opacity = 0.75 * (1 - t) * Math.min(1, t * 8);
      if (t >= 1) p.sprite.visible = false;
      else alive = true;
    }
    for (const b of this.bits) {
      if (b.age >= b.life) continue;
      b.age += dt;
      b.velocity.y -= 9.8 * dt;
      b.mesh.position.addScaledVector(b.velocity, dt);
      if (b.mesh.position.y < b.floor) {
        b.mesh.position.y = b.floor;
        b.velocity.set(b.velocity.x * 0.3, Math.abs(b.velocity.y) * 0.15, b.velocity.z * 0.3);
        b.spin.multiplyScalar(0.3);
      }
      b.mesh.rotation.x += b.spin.x * dt;
      b.mesh.rotation.y += b.spin.y * dt;
      b.mesh.rotation.z += b.spin.z * dt;
      const t = b.age / b.life;
      if (t > 0.75) b.mesh.scale.multiplyScalar(Math.max(0.5, 1 - dt * 6));
      if (t >= 1) b.mesh.visible = false;
      else alive = true;
    }
    if (this.flashAge < 0.3) {
      this.flashAge += dt;
      const t = Math.min(1, this.flashAge / 0.3),
        s = 0.3 + t * 1.3;
      this.flash.scale.set(s, s, 1);
      (this.flash.material as T.SpriteMaterial).opacity = 1 - t;
      if (t >= 1) this.flash.visible = false;
      else alive = true;
    }
    return alive;
  }
}
