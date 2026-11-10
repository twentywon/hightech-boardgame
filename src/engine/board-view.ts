import * as T from "three";
import { fromWorld, toWorld } from "../games/gomoku/coordinates";
import type { Point, State } from "../games/gomoku/rules";
function wood(dark = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = dark ? "#543a28" : "#c89a60";
  ctx.fillRect(0, 0, 512, 512);
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1000; i++) {
    const y = rand() * 512;
    ctx.strokeStyle = dark
      ? `rgba(18,9,4,${rand() * 0.13})`
      : `rgba(77,41,14,${rand() * 0.15})`;
    ctx.lineWidth = rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 512; x += 16)
      ctx.lineTo(
        x,
        y + Math.sin(x * 0.012 + y) * 2 + Math.sin(x * 0.032) * 0.8,
      );
    ctx.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
export class BoardView {
  readonly renderer: T.WebGLRenderer;
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(38, 1, 0.1, 60);
  private stones = new T.Group();
  private ray = new T.Raycaster();
  private plane = new T.Plane(new T.Vector3(0, 1, 0), -0.15);
  private ghost: T.Mesh;
  private marker: T.Mesh;
  private win: T.Group = new T.Group();
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private cameraStart = new T.Vector3();
  private target = new T.Vector3();
  private transitionStart = 0;
  private top = false;
  private zoom = false;
  private falling: { mesh: T.Mesh; start: number; sounded: boolean }[] = [];
  private lastCount = -1;
  private pointerDown = false;
  private lastPointer = 0;
  onSelect: (p: Point, confirm: boolean) => void = () => {};
  onContact: () => void = () => {};
  get moving() {
    return this.transitionStart !== 0;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
    );
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#65452f");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "3D 오목판");
    this.scene.add(new T.HemisphereLight("#fff1d2", "#44352b", 2.5));
    const light = new T.DirectionalLight("#fff4dc", 3.5);
    light.position.set(-3, 9, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.camera.left = -6;
    light.shadow.camera.right = 6;
    light.shadow.camera.top = 6;
    light.shadow.camera.bottom = -6;
    light.shadow.normalBias = 0.025;
    this.scene.add(light);
    const table = new T.Mesh(
      new T.BoxGeometry(100, 0.2, 100),
      new T.MeshStandardMaterial({ map: wood(true), roughness: 0.8 }),
    );
    table.position.y = -0.34;
    table.receiveShadow = true;
    this.scene.add(table);
    const board = new T.Mesh(
      new T.BoxGeometry(6.55, 0.36, 6.55),
      new T.MeshStandardMaterial({ map: wood(), roughness: 0.52 }),
    );
    board.position.y = -0.03;
    board.castShadow = board.receiveShadow = true;
    this.scene.add(board);
    const positions: number[] = [];
    for (let i = 0; i < 15; i++) {
      const v = (i - 7) * 0.42;
      positions.push(
        -2.94,
        0.155,
        v,
        2.94,
        0.155,
        v,
        v,
        0.155,
        -2.94,
        v,
        0.155,
        2.94,
      );
    }
    const lines = new T.BufferGeometry();
    lines.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
    this.scene.add(
      new T.LineSegments(
        lines,
        new T.LineBasicMaterial({
          color: "#594027",
          transparent: true,
          opacity: 0.78,
        }),
      ),
    );
    for (const row of [3, 7, 11])
      for (const col of [3, 7, 11]) {
        if ((row !== 7 && col === 7) || (row === 7 && col !== 7)) continue;
        const p = toWorld({ row, col });
        const dot = new T.Mesh(
          new T.CircleGeometry(0.043, 20),
          new T.MeshBasicMaterial({ color: "#594027" }),
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(p.x, 0.16, p.z);
        this.scene.add(dot);
      }
    this.scene.add(this.stones, this.win);
    this.ghost = this.makeStone(1);
    (this.ghost.material as T.MeshStandardMaterial).transparent = true;
    (this.ghost.material as T.MeshStandardMaterial).opacity = 0.42;
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.marker = new T.Mesh(
      new T.RingGeometry(0.045, 0.065, 24),
      new T.MeshBasicMaterial({ color: "#d5af61", side: T.DoubleSide }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.camera.position.copy(this.target);
    this.camera.lookAt(0, 0, 0);
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", (e) => {
      this.pointerDown = true;
      canvas.setPointerCapture(e.pointerId);
      this.pointer(e, false);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse" || this.pointerDown) this.pointer(e, false);
    });
    canvas.addEventListener("pointerup", (e) => {
      this.pointerDown = false;
      if (
        e.pointerType === "mouse" &&
        performance.now() - this.lastPointer > 320
      ) {
        this.lastPointer = performance.now();
        this.pointer(e, true);
      }
    });
    canvas.addEventListener("pointercancel", () => {
      this.pointerDown = false;
    });
    canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !this.pointerDown) {
        this.ghost.visible = false;
        this.dirty = true;
      }
    });
    const loop = (time: number) => {
      this.raf = requestAnimationFrame(loop);
      const animate =
        this.transitionStart !== 0 ||
        this.falling.length > 0 ||
        this.win.children.length > 0;
      if (!this.dirty && !animate) return;
      this.dirty = false;
      if (this.transitionStart) {
        const t = Math.min(1, (time - this.transitionStart) / 450),
          s = t * t * (3 - 2 * t);
        this.camera.position.lerpVectors(this.cameraStart, this.target, s);
        if (t === 1) this.transitionStart = 0;
      }
      this.camera.lookAt(0, 0, 0);
      this.falling = this.falling.filter((f) => {
        const t = Math.min(1, (time - f.start) / 280);
        f.mesh.position.y = 0.245 + 0.65 * Math.pow(1 - t, 3);
        f.mesh.scale.set(
          0.19,
          0.095 * (1 + Math.sin(t * Math.PI) * 0.15),
          0.19,
        );
        if (t > 0.82 && !f.sounded) {
          f.sounded = true;
          this.onContact();
        }
        return t < 1;
      });
      this.win.children.forEach((c) => {
        c.scale.setScalar(1 + Math.sin(time * 0.004) * 0.04);
      });
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }
  private makeStone(player: number) {
    const mesh = new T.Mesh(
      new T.SphereGeometry(1, 32, 20),
      new T.MeshStandardMaterial({
        color: player === 1 ? "#202226" : "#f6f0e4",
        roughness: player === 1 ? 0.24 : 0.2,
        metalness: 0.04,
      }),
    );
    mesh.scale.set(0.19, 0.095, 0.19);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.dirty = true;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.setTarget();
    if (!this.moving) this.camera.position.copy(this.target);
  }
  private setTarget() {
    const aspect = this.camera.aspect;
    const distance =
      Math.max(11.7, 12.8 / Math.min(aspect, 1)) * (this.zoom ? 0.94 : 1);
    const angle = this.top ? Math.PI / 2 - 0.001 : (55 * Math.PI) / 180;
    this.target.set(0, Math.sin(angle) * distance, Math.cos(angle) * distance);
  }
  setCamera(top: boolean, zoom = false) {
    this.dirty = true;
    this.top = top;
    this.zoom = zoom;
    this.cameraStart.copy(this.camera.position);
    this.setTarget();
    this.transitionStart = performance.now();
    this.ghost.visible = false;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, quality === "high" ? 2 : 1),
    );
    this.resize();
  }
  private pointer(e: PointerEvent, confirm: boolean) {
    if (this.moving) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const v = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, v)) return;
    const p = fromWorld(v.x, v.z);
    if (p) this.onSelect(p, confirm);
    else {
      this.ghost.visible = false;
      this.dirty = true;
    }
  }
  preview(p: Point | null, player: number) {
    this.dirty = true;
    this.ghost.visible = !!p && !this.moving;
    if (p) {
      const v = toWorld(p);
      this.ghost.position.set(v.x, 0.25, v.z);
      (this.ghost.material as T.MeshStandardMaterial).color.set(
        player === 1 ? "#202226" : "#fff9ec",
      );
    }
  }
  renderState(state: State, animate = true) {
    this.dirty = true;
    const old = this.lastCount;
    this.lastCount = state.moves.length;
    this.clearGroup(this.stones);
    this.clearGroup(this.win);
    this.falling = [];
    state.moves.forEach((m, i) => {
      const stone = this.makeStone(m.player),
        p = toWorld(m);
      stone.position.set(p.x, 0.245, p.z);
      this.stones.add(stone);
      if (
        animate &&
        state.moves.length === old + 1 &&
        i === state.moves.length - 1
      )
        this.falling.push({
          mesh: stone,
          start: performance.now(),
          sounded: false,
        });
    });
    this.marker.visible = state.moves.length > 0;
    const last = state.moves.at(-1);
    if (last) {
      const p = toWorld(last);
      this.marker.position.set(p.x, 0.346, p.z);
    }
    for (const p of state.line) {
      const v = toWorld(p),
        ring = new T.Mesh(
          new T.RingGeometry(0.205, 0.23, 40),
          new T.MeshBasicMaterial({ color: "#f5d38b", side: T.DoubleSide }),
        );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(v.x, 0.17, v.z);
      this.win.add(ring);
    }
    this.ghost.visible = false;
    if (state.winner) this.setCamera(this.top, true);
  }
  private clearGroup(group: T.Group) {
    for (const child of [...group.children]) {
      const mesh = child as T.Mesh;
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
      group.remove(child);
    }
  }
  dispose() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.scene.traverse((obj) => {
      if (obj instanceof T.DirectionalLight) obj.shadow.dispose();
      if (obj instanceof T.Mesh || obj instanceof T.LineSegments) {
        obj.geometry.dispose();
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        materials.forEach((m) => {
          if ("map" in m) (m.map as T.Texture | null)?.dispose();
          m.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
