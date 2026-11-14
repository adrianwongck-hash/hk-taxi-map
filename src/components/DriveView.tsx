import { useEffect, useMemo, useRef } from "react";
import {
  classifyTurn,
  edgeBearing,
  headingAtNode,
  relativeTurnDeg,
} from "../game/bearing";
import type { GraphEdge, RoadGraph } from "../sim/types";
import "./DriveView.css";

interface Props {
  graph: RoadGraph;
  modeColor: string;
  destinationLabel: string;
  choices: GraphEdge[];
  arrivedVia: GraphEdge | null;
  moving: boolean;
  moveProgress: number;
  activeEdge: GraphEdge | null;
  phase: "drive" | "debrief";
  onChoose: (edge: GraphEdge) => void;
}

export function DriveView({
  graph,
  modeColor,
  destinationLabel,
  choices,
  arrivedVia,
  moving,
  moveProgress,
  activeEdge,
  phase,
  onChoose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const heading = useMemo(() => {
    const fallback = choices[0] ?? activeEdge;
    return headingAtNode(graph, arrivedVia, fallback);
  }, [graph, arrivedVia, choices, activeEdge]);

  const arrowChoices = useMemo(() => {
    return choices
      .map((edge) => {
        const rel = relativeTurnDeg(heading, edgeBearing(graph, edge));
        const kind = classifyTurn(rel);
        return { edge, rel, kind };
      })
      .sort((a, b) => a.rel - b.rel);
  }, [choices, graph, heading]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      paintScene(ctx, w, h, {
        modeColor,
        moving,
        moveProgress,
        isTunnel: activeEdge?.flags?.includes("tunnel") ?? false,
        phase,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [modeColor, moving, moveProgress, activeEdge, phase]);

  return (
    <div className="drive">
      <canvas ref={canvasRef} className="drive__canvas" aria-hidden />

      <div className="drive__dest">
        <span>Destination</span>
        <strong>{destinationLabel}</strong>
      </div>

      {phase === "drive" && !moving && arrowChoices.length > 0 && (
        <div className="drive__arrows" role="group" aria-label="Junction choices">
          {arrowChoices.map(({ edge, kind }) => (
            <button
              key={edge.id}
              type="button"
              className={`drive__arrow drive__arrow--${kind}`}
              onClick={() => onChoose(edge)}
            >
              <span
                className={`drive__arrow-glyph drive__arrow-glyph--${kind}`}
                aria-hidden
              />
              <span className="drive__arrow-name">{edge.nameEn}</span>
              {edge.nameZh ? (
                <span className="drive__arrow-zh">{edge.nameZh}</span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {moving && (
        <div className="drive__moving" aria-live="polite">
          {activeEdge?.nameEn ?? "Driving…"}
        </div>
      )}
    </div>
  );
}

interface SceneOpts {
  modeColor: string;
  moving: boolean;
  moveProgress: number;
  isTunnel: boolean;
  phase: "drive" | "debrief";
}

function paintScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SceneOpts,
) {
  const horizon = h * 0.38;
  const scroll = opts.moving ? opts.moveProgress * 40 : 0;

  // Sky / tunnel ceiling
  if (opts.isTunnel) {
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#1a1d24");
    g.addColorStop(1, "#2c3340");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#7eb6d9");
    g.addColorStop(1, "#cfe6f5");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);
  }

  // Ground beyond road
  ctx.fillStyle = opts.isTunnel ? "#22262e" : "#6a8f5a";
  ctx.fillRect(0, horizon, w, h - horizon);

  // Buildings left / right in perspective strips
  drawBuildings(ctx, w, h, horizon, scroll, -1, opts.isTunnel);
  drawBuildings(ctx, w, h, horizon, scroll, 1, opts.isTunnel);

  // Road trapezoid
  const roadTopW = w * 0.08;
  const roadBotW = w * 0.92;
  const cx = w / 2;
  ctx.beginPath();
  ctx.moveTo(cx - roadTopW / 2, horizon);
  ctx.lineTo(cx + roadTopW / 2, horizon);
  ctx.lineTo(cx + roadBotW / 2, h);
  ctx.lineTo(cx - roadBotW / 2, h);
  ctx.closePath();
  ctx.fillStyle = opts.isTunnel ? "#3a3f4a" : "#4a4f57";
  ctx.fill();

  // Lane dashes scrolling
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - roadTopW / 2, horizon);
  ctx.lineTo(cx + roadTopW / 2, horizon);
  ctx.lineTo(cx + roadBotW / 2, h);
  ctx.lineTo(cx - roadBotW / 2, h);
  ctx.closePath();
  ctx.clip();

  const dashCount = 14;
  for (let i = 0; i < dashCount; i++) {
    const t = (i / dashCount + (opts.moving ? opts.moveProgress : 0) * 2) % 1;
    const y = horizon + Math.pow(t, 1.6) * (h - horizon);
    const scale = (y - horizon) / (h - horizon);
    const half = 3 + scale * 10;
    const thick = 2 + scale * 6;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillRect(cx - half, y, half * 2, thick);
  }
  ctx.restore();

  // Soft vignette
  const vig = ctx.createRadialGradient(
    cx,
    h * 0.55,
    h * 0.1,
    cx,
    h * 0.55,
    h * 0.85,
  );
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // Taxi — chase cam (ahead of camera, lower third)
  const taxiY = h * 0.72;
  const taxiW = w * 0.18;
  const taxiH = taxiW * 0.45;
  const bob = opts.moving ? Math.sin(opts.moveProgress * Math.PI * 8) * 2 : 0;
  drawTaxi(ctx, cx, taxiY + bob, taxiW, taxiH, opts.modeColor);

  if (opts.phase === "debrief") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);
  }
}

function drawBuildings(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  scroll: number,
  side: -1 | 1,
  tunnel: boolean,
) {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const t = ((i + scroll * 0.15) % count) / count;
    const y0 = horizon + Math.pow(t, 1.35) * (h - horizon) * 0.85;
    const scale = (y0 - horizon) / (h - horizon);
    const bw = 18 + scale * 70;
    const bh = 30 + scale * 160;
    const edge = w / 2 + side * (w * (0.06 + scale * 0.42));
    const x = side < 0 ? edge - bw : edge;
    ctx.fillStyle = tunnel
      ? `rgb(${40 + i * 4},${44 + i * 3},${52 + i * 3})`
      : `rgb(${150 + (i % 3) * 12},${145 + (i % 2) * 8},${135})`;
    ctx.fillRect(x, y0 - bh, bw, bh);
    if (!tunnel) {
      ctx.fillStyle = "rgba(255, 240, 180, 0.35)";
      const win = Math.max(2, bw * 0.15);
      for (let wy = y0 - bh + 8; wy < y0 - 10; wy += win * 2.2) {
        ctx.fillRect(x + bw * 0.2, wy, win, win);
        ctx.fillRect(x + bw * 0.55, wy, win, win);
      }
    }
  }
}

function drawTaxi(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tw: number,
  th: number,
  color: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, th * 0.55, tw * 0.55, th * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = color;
  roundRect(ctx, -tw / 2, -th / 2, tw, th, th * 0.18);
  ctx.fill();
  // cabin
  ctx.fillStyle = "rgba(30,40,55,0.85)";
  roundRect(ctx, -tw * 0.28, -th * 0.55, tw * 0.56, th * 0.45, th * 0.1);
  ctx.fill();
  // roof light
  ctx.fillStyle = "#f5f5f5";
  roundRect(ctx, -tw * 0.08, -th * 0.62, tw * 0.16, th * 0.12, 2);
  ctx.fill();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
