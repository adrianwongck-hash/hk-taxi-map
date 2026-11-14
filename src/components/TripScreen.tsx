import { useEffect, useMemo, useRef, useState } from "react";
import { MODES } from "../game/modes";
import {
  calculateFare,
  formatHkd,
  generateTrip,
  outgoingEdges,
  scoreTrip,
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
  graph: RoadGraph;
  onExit: () => void;
}

type Phase = "drive" | "debrief";

export function TripScreen({ mode, graph, onExit }: Props) {
  const modeInfo = MODES.find((m) => m.id === mode)!;
  const [seed, setSeed] = useState(() => Date.now());
  const trip = useMemo(
    () => generateTrip(graph, mode, seed, 800),
    [graph, mode, seed],
  );

  const [currentNode, setCurrentNode] = useState<NodeId | null>(null);
  const [arrivedVia, setArrivedVia] = useState<EdgeId | null>(null);
  const [playerEdges, setPlayerEdges] = useState<EdgeId[]>([]);
  const [phase, setPhase] = useState<Phase>("drive");
  const [score, setScore] = useState<TripScore | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveProgress, setMoveProgress] = useState(0);
  const [activeEdge, setActiveEdge] = useState<GraphEdge | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (!trip) {
      setCurrentNode(null);
      return;
    }
    setCurrentNode(trip.origin.nodeId);
    setArrivedVia(null);
    setPlayerEdges([]);
    setPhase("drive");
    setScore(null);
    setMoving(false);
    setMoveProgress(0);
    setActiveEdge(null);
  }, [trip]);

  useEffect(() => {
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  if (!trip || !currentNode) {
    return (
      <div className="trip">
        <p>No playable trip for this mode yet.</p>
        <button type="button" onClick={onExit}>
          Back
        </button>
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
    phase === "drive" && !moving
      ? outgoingEdges(graph, mode, currentNode, arrivedVia)
      : [];

  function choose(edge: GraphEdge) {
    const active = trip;
    if (!active || moving) return;

    const nextEdges = [...playerEdges, edge.id];
    setPlayerEdges(nextEdges);
    setActiveEdge(edge);
    setMoving(true);
    setMoveProgress(0);

    const durationMs = Math.min(2800, Math.max(900, edge.lengthM * 0.9));
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setMoveProgress(eased);
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        animRef.current = null;
        setCurrentNode(edge.to);
        setArrivedVia(edge.id);
        setMoving(false);
        setMoveProgress(1);
        setActiveEdge(null);
        if (edge.to === active.destination.nodeId) {
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

  function nextTrip() {
    setSeed(Date.now());
  }

  return (
    <div className="trip trip--drive">
      <header className="trip__hud">
        <button type="button" className="trip__back" onClick={onExit}>
          Modes
        </button>
        <div className="trip__badge" style={{ background: modeInfo.color }}>
          {modeInfo.titleEn}
        </div>
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
        currentNode={currentNode}
        destinationNode={trip.destination.nodeId}
        modeColor={modeInfo.color}
        destinationLabel={`${trip.destination.nameEn} · ${trip.destination.nameZh}`}
        choices={choices}
        arrivedVia={arrivedEdge}
        traversed={playerEdges}
        moving={moving}
        moveProgress={moveProgress}
        activeEdge={activeEdge}
        phase={phase}
        optimalEdgeIds={trip.optimal.edgeIds}
        onChoose={choose}
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
