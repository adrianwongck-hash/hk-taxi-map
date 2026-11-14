import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import {
  classifyTurn,
  compassLabel,
  edgeBearing,
  headingAtNode,
  relativeTurnDeg,
  turnLabel,
} from "../game/bearing";
import type { GraphEdge, NodeId, RoadGraph } from "../sim/types";
import { JunctionMinimap, choiceAccent } from "./JunctionMinimap";
import "./DriveView.css";

interface Props {
  graph: RoadGraph;
  currentNode: NodeId;
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
  currentNode,
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
    const sorted = choices
      .map((edge) => {
        const bearing = edgeBearing(graph, edge);
        const rel = relativeTurnDeg(heading, bearing);
        const kind = classifyTurn(rel);
        const toward = graph.nodes[edge.to];
        return {
          edge,
          rel,
          kind,
          bearing,
          towardEn: toward?.nameEn ?? edge.to,
          towardZh: toward?.nameZh,
          action: turnLabel(kind),
          compass: compassLabel(bearing),
        };
      })
      .sort((a, b) => a.rel - b.rel);

    return sorted.map((c, index) => ({
      ...c,
      index,
      accent: choiceAccent(index),
    }));
  }, [choices, graph, heading]);

  const branchRels = useMemo(
    () => arrowChoices.map((c) => c.rel),
    [arrowChoices],
  );

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
        isTunnel: Boolean(
          activeEdge?.flags?.includes("tunnel") ||
            (!moving &&
              arrivedVia?.flags?.includes("tunnel") &&
              branchRels.length === 0),
        ),
        phase,
        atJunction: phase === "drive" && !moving,
        branchRels: moving ? [0] : branchRels,
        activeRel: moving && activeEdge
          ? relativeTurnDeg(heading, edgeBearing(graph, activeEdge))
          : 0,
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [
    modeColor,
    moving,
    moveProgress,
    activeEdge,
    arrivedVia,
    phase,
    branchRels,
    graph,
    heading,
  ]);

  return (
    <div className="drive">
      <canvas ref={canvasRef} className="drive__canvas" aria-hidden />

      <div className="drive__dest">
        <span>Destination</span>
        <strong>{destinationLabel}</strong>
      </div>

      {phase === "drive" && !moving && arrowChoices.length > 0 && (
        <JunctionMinimap
          graph={graph}
          currentNode={currentNode}
          headingDeg={heading}
          choices={arrowChoices.map((c) => ({
            edge: c.edge,
            index: c.index,
            accent: c.accent,
          }))}
        />
      )}

      {phase === "drive" && !moving && arrowChoices.length > 0 && (
        <div
          className="drive__arrows"
          role="group"
          aria-label="Junction choices"
        >
          {arrowChoices.map((c) => (
            <button
              key={c.edge.id}
              type="button"
              className={`drive__arrow drive__arrow--${c.kind}`}
              style={{ "--accent": c.accent } as CSSProperties}
              onClick={() => onChoose(c.edge)}
            >
              <span className="drive__arrow-letter" aria-hidden>
                {String.fromCharCode(65 + c.index)}
              </span>
              <span className="drive__arrow-action">{c.action}</span>
              <span className="drive__arrow-name">{c.edge.nameEn}</span>
              <span className="drive__arrow-toward">
                toward {c.towardEn}
                {c.towardZh ? ` · ${c.towardZh}` : ""}
              </span>
              <span className="drive__arrow-meta">
                {c.compass} · {(c.edge.lengthM / 1000).toFixed(2)} km
              </span>
            </button>
          ))}
        </div>
      )}

      {moving && (
        <div className="drive__moving" aria-live="polite">
          {activeEdge
            ? `${activeEdge.nameEn} → ${graph.nodes[activeEdge.to]?.nameEn ?? ""}`
            : "Driving…"}
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
  atJunction: boolean;
  branchRels: number[];
  activeRel: number;
}

function paintScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: SceneOpts,
) {
  const horizon = h * 0.36;
  const scroll = opts.moving ? opts.moveProgress * 48 : 0;
  const cx = w / 2;

  if (opts.isTunnel) {
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#14171d");
    g.addColorStop(1, "#2a303a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#6fa8cc");
    g.addColorStop(0.55, "#b7d7ea");
    g.addColorStop(1, "#d9e8c8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, horizon);
  }

  ctx.fillStyle = opts.isTunnel ? "#1e2229" : "#5f7d52";
  ctx.fillRect(0, horizon, w, h - horizon);

  drawBuildings(ctx, w, h, horizon, scroll, -1, opts.isTunnel);
  drawBuildings(ctx, w, h, horizon, scroll, 1, opts.isTunnel);

  // Main approach road
  drawRoadTrapezoid(ctx, w, h, horizon, 0, opts.isTunnel, false);

  // Junction forks or active turn bend
  if (opts.atJunction && opts.branchRels.length > 0) {
    for (const rel of opts.branchRels) {
      drawRoadTrapezoid(ctx, w, h, horizon, rel, opts.isTunnel, true);
    }
  } else if (opts.moving) {
    drawRoadTrapezoid(
      ctx,
      w,
      h,
      horizon,
      opts.activeRel * (1 - opts.moveProgress),
      opts.isTunnel,
      false,
    );
  }

  // Lane dashes on center road
  drawLaneDashes(ctx, w, h, horizon, opts.moving ? opts.moveProgress : 0);

  // Taxi shadow + body (rear three-quarter)
  const taxiY = h * 0.78;
  const taxiScale = Math.min(w, h) * 0.00115;
  const bob = opts.moving ? Math.sin(opts.moveProgress * Math.PI * 10) * 1.5 : 0;
  const sway =
    opts.moving && Math.abs(opts.activeRel) > 20
      ? (opts.activeRel / 90) * 10 * (1 - opts.moveProgress)
      : 0;
  drawTaxiRear(ctx, cx + sway, taxiY + bob, taxiScale, opts.modeColor);

  const vig = ctx.createRadialGradient(cx, h * 0.6, h * 0.08, cx, h * 0.55, h);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  if (opts.phase === "debrief") {
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, w, h);
  }
}

function drawRoadTrapezoid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  relativeDeg: number,
  tunnel: boolean,
  fork: boolean,
) {
  const cx = w / 2;
  // Map turn angle to vanishing-point shift
  const shift = (relativeDeg / 90) * w * 0.42;
  const topX = cx + shift * 0.35;
  const botX = cx + shift;
  const roadTopW = w * (fork ? 0.055 : 0.09);
  const roadBotW = w * (fork ? 0.34 : 0.78);
  const topY = horizon + (fork ? h * 0.02 : 0);

  ctx.beginPath();
  ctx.moveTo(topX - roadTopW / 2, topY);
  ctx.lineTo(topX + roadTopW / 2, topY);
  ctx.lineTo(botX + roadBotW / 2, h);
  ctx.lineTo(botX - roadBotW / 2, h);
  ctx.closePath();
  ctx.fillStyle = tunnel
    ? fork
      ? "rgba(70,76,88,0.85)"
      : "#3a404c"
    : fork
      ? "rgba(90,96,108,0.9)"
      : "#50565f";
  ctx.fill();

  // curb lines
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, w * 0.002);
  ctx.beginPath();
  ctx.moveTo(topX - roadTopW / 2, topY);
  ctx.lineTo(botX - roadBotW / 2, h);
  ctx.moveTo(topX + roadTopW / 2, topY);
  ctx.lineTo(botX + roadBotW / 2, h);
  ctx.stroke();
}

function drawLaneDashes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  horizon: number,
  progress: number,
) {
  const cx = w / 2;
  const roadTopW = w * 0.09;
  const roadBotW = w * 0.78;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - roadTopW / 2, horizon);
  ctx.lineTo(cx + roadTopW / 2, horizon);
  ctx.lineTo(cx + roadBotW / 2, h);
  ctx.lineTo(cx - roadBotW / 2, h);
  ctx.closePath();
  ctx.clip();

  for (let i = 0; i < 16; i++) {
    const t = (i / 16 + progress * 2.2) % 1;
    const y = horizon + Math.pow(t, 1.55) * (h - horizon);
    const scale = (y - horizon) / (h - horizon);
    const half = 2 + scale * 9;
    const thick = 1.5 + scale * 5;
    ctx.fillStyle = "rgba(255,255,220,0.8)";
    ctx.fillRect(cx - half, y, half * 2, thick);
  }
  ctx.restore();
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
  const count = 9;
  for (let i = 0; i < count; i++) {
    const t = ((i + scroll * 0.12) % count) / count;
    const y0 = horizon + Math.pow(t, 1.3) * (h - horizon) * 0.82;
    const scale = (y0 - horizon) / (h - horizon);
    const bw = 16 + scale * 78;
    const bh = 28 + scale * 170;
    const edge = w / 2 + side * (w * (0.07 + scale * 0.4));
    const x = side < 0 ? edge - bw : edge;
    const base = tunnel ? 36 : 138;
    ctx.fillStyle = `rgb(${base + (i % 4) * 8},${base + 4},${base - 8})`;
    ctx.fillRect(x, y0 - bh, bw, bh);
    if (!tunnel && scale > 0.15) {
      ctx.fillStyle = "rgba(255, 236, 170, 0.4)";
      const win = Math.max(2, bw * 0.14);
      for (let wy = y0 - bh + 8; wy < y0 - 12; wy += win * 2.1) {
        ctx.fillRect(x + bw * 0.18, wy, win, win);
        ctx.fillRect(x + bw * 0.55, wy, win, win);
      }
    }
  }
}

/** Rear three-quarter HK taxi silhouette. */
function drawTaxiRear(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  color: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 38, 78, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // rear bumper / body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-70, 10);
  ctx.quadraticCurveTo(-78, 28, -60, 34);
  ctx.lineTo(60, 34);
  ctx.quadraticCurveTo(78, 28, 70, 10);
  ctx.lineTo(55, -8);
  ctx.quadraticCurveTo(0, -18, -55, -8);
  ctx.closePath();
  ctx.fill();

  // rear window
  ctx.fillStyle = "#1c2430";
  ctx.beginPath();
  ctx.moveTo(-42, -6);
  ctx.lineTo(42, -6);
  ctx.lineTo(34, -28);
  ctx.lineTo(-34, -28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // roof
  ctx.fillStyle = shade(color, -18);
  ctx.beginPath();
  ctx.moveTo(-36, -28);
  ctx.lineTo(36, -28);
  ctx.lineTo(28, -42);
  ctx.lineTo(-28, -42);
  ctx.closePath();
  ctx.fill();

  // taxi roof sign
  ctx.fillStyle = "#f2f2f2";
  roundRectPath(ctx, -22, -54, 44, 14, 3);
  ctx.fill();
  ctx.fillStyle = "#222";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TAXI", 0, -47);

  // wheels
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.ellipse(-48, 32, 16, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(48, 32, 16, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#666";
  ctx.beginPath();
  ctx.ellipse(-48, 32, 7, 5, 0, 0, Math.PI * 2);
  ctx.ellipse(48, 32, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // plate
  ctx.fillStyle = "#eee";
  roundRectPath(ctx, -18, 16, 36, 10, 2);
  ctx.fill();

  ctx.restore();
}

function shade(hex: string, amount: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const clamp = (n: number) => Math.max(0, Math.min(255, n));
  const r = clamp(parseInt(m[1]!, 16) + amount);
  const g = clamp(parseInt(m[2]!, 16) + amount);
  const b = clamp(parseInt(m[3]!, 16) + amount);
  return `rgb(${r},${g},${b})`;
}

function roundRectPath(
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
