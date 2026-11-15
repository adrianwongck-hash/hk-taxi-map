import { useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty } from "../game/difficulty";
import { DIFFICULTIES } from "../game/difficulty";
import { MODES } from "../game/modes";
import {
  calculateFare,
  autoContinueEdge,
  extendForcedPath,
  formatHkd,
  generateTrip,
  pathLengthM,
  decisionChoices,
  scoreTrip,
  tripBetweenLandmarks,
  type EdgeId,
  type GraphEdge,
  type NodeId,
  type TaxiMode,
  type TripScore,
} from "../sim";
import type { RoadGraph } from "../sim/types";
import { MapDriveView } from "./MapDriveView";
import "./TripScreen.css";

interface Props {
  mode: TaxiMode;
  difficulty: Difficulty;
  graph: RoadGraph;
  onExit: () => void;
}

type Phase = "drive" | "debrief";

interface Checkpoint {
  node: NodeId;
  arrivedVia: EdgeId | null;
  playerEdges: EdgeId[];
}

function forcedTripFromUrl(
  graph: RoadGraph,
  mode: TaxiMode,
): ReturnType<typeof tripBetweenLandmarks> {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const from = params.get("from");
  const to = params.get("to");
  if (!from || !to) return null;
  return tripBetweenLandmarks(graph, mode, from, to);
}

export function TripScreen({ mode, difficulty, graph, onExit }: Props) {
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const difficultyInfo = DIFFICULTIES.find((d) => d.id === difficulty)!;
  const canUndo = difficulty === "normal";
  const [seed, setSeed] = useState(() => Date.now());
  const trip = useMemo(() => {
    const forced = forcedTripFromUrl(graph, mode);
    if (forced) return forced;
    return generateTrip(graph, mode, seed, 800);
  }, [graph, mode, seed]);

  const [currentNode, setCurrentNode] = useState<NodeId | null>(null);
  const [arrivedVia, setArrivedVia] = useState<EdgeId | null>(null);
  const [playerEdges, setPlayerEdges] = useState<EdgeId[]>([]);
  const [history, setHistory] = useState<Checkpoint[]>([]);
  const [phase, setPhase] = useState<Phase>("drive");
  const [score, setScore] = useState<TripScore | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState(0);
  const [activePath, setActivePath] = useState<GraphEdge[]>([]);
  const animRef = useRef<number | null>(null);
  const chooseRef = useRef<(edge: GraphEdge, opts?: { auto?: boolean }) => void>(
    () => {},
  );

  useEffect(() => {
    if (!trip) {
      setCurrentNode(null);
      return;
    }
    setCurrentNode(trip.origin.nodeId);
    setArrivedVia(null);
    setPlayerEdges([]);
    setHistory([]);
    setPhase("drive");
    setScore(null);
    setMoving(false);
    setMoveProgress(0);
    setActivePath([]);
  }, [trip]);

  useEffect(() => {
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  function choose(edge: GraphEdge, opts?: { auto?: boolean }) {
    const active = trip;
    if (!active || moving || !currentNode) return;

    // Only player junction picks create undo checkpoints (Normal).
    if (canUndo && !opts?.auto) {
      setHistory((h) => [
        ...h,
        {
          node: currentNode,
          arrivedVia,
          playerEdges,
        },
      ]);
    }

    const chain = extendForcedPath(
      graph,
      mode,
      edge,
      active.destination.nodeId,
    );
    const nextEdges = [...playerEdges, ...chain.map((e) => e.id)];
    setPlayerEdges(nextEdges);
    setActivePath(chain);
    setMoving(true);
    setMoveProgress(0);

    const totalM = pathLengthM(chain);
    const durationMs = Math.min(4200, Math.max(650, totalM * 0.4));
    const start = performance.now();
    const last = chain[chain.length - 1]!;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setMoveProgress(eased);
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
        setCurrentNode(last.to);
        setArrivedVia(last.id);
        setMoving(false);
        setMoveProgress(1);
        setActivePath([]);
        if (last.to === active.destination.nodeId) {
          const result = scoreTrip(
            graph,
            mode,
            nextEdges,
            active.optimal.edgeIds,
          );
          setScore(result);
          setPhase("debrief");
        }
      }
    };
    animRef.current = requestAnimationFrame(tick);
  }

  chooseRef.current = choose;

  function undo() {
    if (!canUndo || history.length === 0) return;
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setCurrentNode(prev.node);
    setArrivedVia(prev.arrivedVia);
    setPlayerEdges(prev.playerEdges);
    setMoving(false);
    setMoveProgress(0);
    setActivePath([]);
    setScore(null);
    setPhase("drive");
  }

  // Auto-drive through shape points and unique “go straight” corridors.
  useEffect(() => {
    if (!trip || !currentNode || moving || phase !== "drive") return;
    const next = autoContinueEdge(graph, mode, currentNode, arrivedVia);
    if (!next) return;
    const id = requestAnimationFrame(() =>
      chooseRef.current(next, { auto: true }),
    );
    return () => cancelAnimationFrame(id);
  }, [trip, currentNode, arrivedVia, moving, phase, graph, mode]);

  if (!trip) {
    return (
      <div className="trip">
        <p>No playable trip for this mode yet.</p>
        <button type="button" onClick={onExit}>
          Back
        </button>
      </div>
    );
  }

  if (!currentNode) {
    return (
      <div className="trip">
        <p>Loading trip…</p>
      </div>
    );
  }

  const distanceM = playerEdges.reduce(
    (sum, id) => sum + (graph.edges[id]?.lengthM ?? 0),
    0,
  );
  const liveFare = calculateFare(
    mode,
    playerEdges
      .map((id) => graph.edges[id])
      .filter((e): e is GraphEdge => e !== undefined),
  );
  const arrivedEdge = arrivedVia ? (graph.edges[arrivedVia] ?? null) : null;
  const choices: GraphEdge[] =
    phase === "drive" &&
    !moving &&
    !autoContinueEdge(graph, mode, currentNode, arrivedVia)
      ? decisionChoices(graph, mode, currentNode, arrivedVia)
      : [];

  function nextTrip() {
    setSeed(Date.now());
  }

  const undoEnabled = canUndo && history.length > 0 && !moving;

  return (
    <div className="trip trip--drive">
      <header className="trip__hud">
        <button type="button" className="trip__back" onClick={onExit}>
          Modes
        </button>
        <div className="trip__badge" style={{ background: modeInfo.color }}>
          {modeInfo.titleEn}
        </div>
        <div
          className={`trip__diff trip__diff--${difficulty}`}
          title={difficultyInfo.blurb}
        >
          {difficultyInfo.titleEn}
        </div>
        {canUndo && (
          <button
            type="button"
            className="trip__undo"
            disabled={!undoEnabled}
            onClick={undo}
          >
            Undo
          </button>
        )}
        <div className="trip__meter" aria-live="polite">
          <span className="trip__meter-label">Meter</span>
          <strong>{formatHkd(liveFare.totalHkd)}</strong>
          <span className="trip__meter-dist">
            {(distanceM / 1000).toFixed(2)} km
          </span>
        </div>
      </header>

      <p className="trip__brief">
        {trip.origin.nameEn} → {trip.destination.nameEn}
        <span>
          {trip.origin.nameZh} → {trip.destination.nameZh}
        </span>
      </p>

      <MapDriveView
        graph={graph}
        mode={mode}
        currentNode={currentNode}
        destinationNode={trip.destination.nodeId}
        modeColor={modeInfo.color}
        destinationLabel={`${trip.destination.nameEn} · ${trip.destination.nameZh}`}
        choices={choices}
        arrivedVia={arrivedEdge}
        traversed={playerEdges}
        moving={moving}
        moveProgress={moveProgress}
        activePath={activePath}
        phase={phase}
        optimalEdgeIds={trip.optimal.edgeIds}
        onChoose={(edge) => choose(edge)}
      />

      {phase === "debrief" && score && (
        <section className="trip__debrief">
          <h2 className={`trip__grade trip__grade--${score.grade}`}>
            {score.grade.toUpperCase()}
          </h2>
          <dl className="trip__stats">
            <div>
              <dt>Your distance</dt>
              <dd>{(score.playerM / 1000).toFixed(2)} km</dd>
            </div>
            <div>
              <dt>Shortest</dt>
              <dd>{(score.optimalM / 1000).toFixed(2)} km</dd>
            </div>
            <div>
              <dt>Excess</dt>
              <dd>{(score.excessRatio * 100).toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Your fare</dt>
              <dd>{formatHkd(score.playerFare.totalHkd)}</dd>
            </div>
            <div>
              <dt>Optimal fare</dt>
              <dd>{formatHkd(score.optimalFare.totalHkd)}</dd>
            </div>
            <div>
              <dt>Extra on meter</dt>
              <dd>
                {formatHkd(
                  Math.max(
                    0,
                    Math.round(
                      (score.playerFare.totalHkd - score.optimalFare.totalHkd) *
                        10,
                    ) / 10,
                  ),
                )}
              </dd>
            </div>
          </dl>
          <p className="trip__legend">
            Amber = your route · Green = shortest legal path
          </p>
          <div className="trip__actions">
            {canUndo && history.length > 0 && (
              <button type="button" onClick={undo}>
                Undo last turn
              </button>
            )}
            <button type="button" className="trip__primary" onClick={nextTrip}>
              Next trip
            </button>
            <button type="button" onClick={onExit}>
              Change mode
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
