import { BAR, BELL, CHERRY, LEMON, PLUM, SEVEN, STAR } from "./sim";

/**
 * The machine's symbols, painted in code on a 2D canvas (the reel strips, the pay table): each drawn to fill a cell of
 * `size` about its middle (`x`, `y`).
 */
export function paintSymbol(pen: CanvasRenderingContext2D, symbol: number, x: number, y: number, size: number) {
  const s = size / 100;
  pen.save();
  pen.translate(x, y);
  pen.scale(s, s);
  pen.lineJoin = "round";
  pen.lineCap = "round";
  const shine = (cx: number, cy: number, r: number, inner: string, outer: string) => {
    const g = pen.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    return g;
  };
  if (symbol === CHERRY) {
    pen.strokeStyle = "#3a7a20";
    pen.lineWidth = 6;
    pen.beginPath();
    pen.moveTo(-18, 14);
    pen.quadraticCurveTo(-10, -20, 8, -38);
    pen.moveTo(20, 18);
    pen.quadraticCurveTo(18, -14, 8, -38);
    pen.stroke();
    pen.fillStyle = "#5cb030";
    pen.beginPath();
    pen.ellipse(20, -36, 16, 7, -0.5, 0, Math.PI * 2);
    pen.fill();
    for (const [cx, cy] of [
      [-20, 22],
      [20, 26],
    ]) {
      pen.fillStyle = shine(cx, cy, 22, "#ff8a8a", "#b0101a");
      pen.beginPath();
      pen.arc(cx, cy, 21, 0, Math.PI * 2);
      pen.fill();
      pen.lineWidth = 3;
      pen.strokeStyle = "#6a0810";
      pen.stroke();
      pen.fillStyle = "rgba(255,255,255,0.75)";
      pen.beginPath();
      pen.ellipse(cx - 7, cy - 8, 5, 3, -0.6, 0, Math.PI * 2);
      pen.fill();
    }
  } else if (symbol === LEMON) {
    pen.fillStyle = shine(0, 0, 44, "#fff6a0", "#e0b000");
    pen.beginPath();
    pen.moveTo(-44, 0);
    pen.bezierCurveTo(-36, -34, 36, -34, 44, 0);
    pen.bezierCurveTo(36, 34, -36, 34, -44, 0);
    pen.fill();
    pen.lineWidth = 3;
    pen.strokeStyle = "#9a7400";
    pen.stroke();
    pen.fillStyle = "rgba(255,255,255,0.6)";
    pen.beginPath();
    pen.ellipse(-12, -12, 12, 5, -0.3, 0, Math.PI * 2);
    pen.fill();
  } else if (symbol === PLUM) {
    pen.fillStyle = shine(0, 6, 36, "#d68aff", "#4a0a7a");
    pen.beginPath();
    pen.arc(0, 6, 35, 0, Math.PI * 2);
    pen.fill();
    pen.lineWidth = 3;
    pen.strokeStyle = "#2a0448";
    pen.stroke();
    pen.strokeStyle = "rgba(40,0,70,0.5)";
    pen.beginPath();
    pen.moveTo(0, -26);
    pen.quadraticCurveTo(-8, 6, 0, 38);
    pen.stroke();
    pen.fillStyle = "#4aa030";
    pen.beginPath();
    pen.ellipse(14, -32, 15, 6, -0.4, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "rgba(255,255,255,0.55)";
    pen.beginPath();
    pen.ellipse(-12, -8, 8, 4, -0.7, 0, Math.PI * 2);
    pen.fill();
  } else if (symbol === BELL) {
    pen.fillStyle = shine(0, -4, 46, "#fff0a0", "#c88a10");
    pen.beginPath();
    pen.moveTo(0, -40);
    pen.bezierCurveTo(26, -40, 30, -10, 32, 10);
    pen.quadraticCurveTo(34, 24, 44, 30);
    pen.lineTo(-44, 30);
    pen.quadraticCurveTo(-34, 24, -32, 10);
    pen.bezierCurveTo(-30, -10, -26, -40, 0, -40);
    pen.fill();
    pen.lineWidth = 3;
    pen.strokeStyle = "#7a4a00";
    pen.stroke();
    pen.fillStyle = "#a86a08";
    pen.beginPath();
    pen.arc(0, 36, 9, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "#e8b020";
    pen.fillRect(-4, -48, 8, 9);
  } else if (symbol === BAR) {
    pen.fillStyle = "#141018";
    pen.strokeStyle = "#e8b84a";
    pen.lineWidth = 5;
    pen.beginPath();
    pen.roundRect(-46, -22, 92, 44, 10);
    pen.fill();
    pen.stroke();
    pen.font = '900 34px "Inter", "Arial Black", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillStyle = "#ffffff";
    pen.fillText("BAR", 0, 2);
  } else if (symbol === SEVEN) {
    pen.font = '900 96px "Inter", "Arial Black", sans-serif';
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.lineWidth = 12;
    pen.strokeStyle = "#ffd23a";
    pen.strokeText("7", 0, 4);
    const g = pen.createLinearGradient(0, -40, 0, 44);
    g.addColorStop(0, "#ff5a4a");
    g.addColorStop(1, "#a80c10");
    pen.fillStyle = g;
    pen.fillText("7", 0, 4);
  } else if (symbol === STAR) {
    pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5,
        r = i % 2 ? 19 : 46;
      pen.lineTo(Math.cos(a) * r, Math.sin(a) * r + 2);
    }
    pen.closePath();
    pen.fillStyle = shine(0, 0, 46, "#fffbd0", "#f0a010");
    pen.fill();
    pen.lineWidth = 4;
    pen.strokeStyle = "#a85a00";
    pen.stroke();
    pen.fillStyle = "#ffffff";
    for (const [sx, sy, r] of [
      [34, -30, 5],
      [-36, 26, 4],
    ])
      for (const a of [0, Math.PI / 2]) {
        pen.save();
        pen.translate(sx, sy);
        pen.rotate(a);
        pen.fillRect(-r * 2, -1.2, r * 4, 2.4);
        pen.restore();
      }
  }
  pen.restore();
}
