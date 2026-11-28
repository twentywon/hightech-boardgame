import * as T from "three";

/** Registers a resource with the view that must dispose it. */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The turned queen in the Staunton manner, shared by 체스판의 퀸 and the game of the Amazons. */
export type QueenShapes = T.BufferGeometry[];
/** Its shapes, 1.38 high: the turned body, the crown, one ball of the coronet, the dome, the ball on top and a ring for the foot. */
export function queenShapes(own: Own): QueenShapes {
  const lathe = (points: number[][]) => own(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), 32));
  return [
    lathe([[0, 0], [0.3, 0], [0.315, 0.025], [0.315, 0.07], [0.29, 0.1], [0.25, 0.115], [0.235, 0.145], [0.255, 0.175], [0.24, 0.205], [0.19, 0.235], [0.16, 0.3], [0.138, 0.4], [0.125, 0.5], [0.14, 0.545], [0.2, 0.565], [0.215, 0.59], [0.2, 0.612], [0.12, 0.628], [0, 0.63]]),
    lathe([[0.19, 0.61], [0.125, 0.66], [0.1, 0.8], [0.095, 0.98], [0.13, 1.04], [0.21, 1.07], [0.215, 1.1], [0.15, 1.12], [0.13, 1.16], [0.185, 1.25], [0.235, 1.305], [0.2, 1.305], [0.12, 1.25], [0, 1.26]]),
    own(new T.SphereGeometry(0.042, 14, 10)),
    own(new T.SphereGeometry(0.13, 22, 14).scale(1, 0.6, 1)),
    own(new T.SphereGeometry(0.05, 16, 12)),
    own(new T.TorusGeometry(0.31, 0.022, 8, 40).rotateX(Math.PI / 2)),
  ];
}
/** A queen in one paint (its open lathe shells want `DoubleSide`), with a ring of `ring` at its foot if given. */
export function queenFigure(shapes: QueenShapes, paint: T.Material, ring?: T.Material) {
  const g = new T.Group(),
    put = (shape: T.BufferGeometry, x: number, y: number, z: number, material = paint) => {
      const m = new T.Mesh(shape, material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    };
  const [body, crown, ball, dome, top, foot] = shapes;
  put(body, 0, 0, 0);
  put(crown, 0, 0, 0);
  for (let n = 0; n < 8; n++) put(ball, Math.cos((n * Math.PI) / 4) * 0.218, 1.325, Math.sin((n * Math.PI) / 4) * 0.218);
  put(dome, 0, 1.27, 0);
  put(top, 0, 1.38, 0);
  if (ring) put(foot, 0, 0.05, 0, ring);
  return g;
}
