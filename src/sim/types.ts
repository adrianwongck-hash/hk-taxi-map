export type TaxiMode = "red" | "green" | "blue";

export type NodeId = string;
export type EdgeId = string;

export interface GraphNode {
  id: NodeId;
  lat: number;
  lng: number;
  nameEn?: string;
  nameZh?: string;
}

export interface GraphEdge {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  lengthM: number;
  nameEn: string;
  nameZh?: string;
  taxiTypes: TaxiMode[];
  tollHkd?: number;
  flags?: ("tunnel" | "bridge" | "restricted")[];
}

/** Prohibited turn: arriving via `viaEdge`, cannot leave on `forbiddenTo`. */
export interface TurnRestriction {
  at: NodeId;
  viaEdge: EdgeId;
  forbiddenTo: EdgeId;
}

export interface Landmark {
  id: string;
  nodeId: NodeId;
  nameEn: string;
  nameZh: string;
  taxiTypes: TaxiMode[];
}

export interface RoadGraph {
  nodes: Record<NodeId, GraphNode>;
  edges: Record<EdgeId, GraphEdge>;
  turnRestrictions: TurnRestriction[];
  landmarks: Landmark[];
}

export interface MeterTariff {
  mode: TaxiMode;
  flagHkd: number;
  /** Distance covered by flag fall (metres). */
  flagIncludesM: number;
  /** Charge for each increment after flag. */
  incrementHkd: number;
  /** Metres per increment after flag. */
  incrementM: number;
  /** Waiting charge per period. */
  waitingHkd: number;
  /** Waiting period length in seconds. */
  waitingPeriodSec: number;
}

export interface FareBreakdown {
  flagHkd: number;
  distanceHkd: number;
  waitingHkd: number;
  tollsHkd: number;
  totalHkd: number;
}

export interface PathResult {
  edgeIds: EdgeId[];
  nodeIds: NodeId[];
  lengthM: number;
}

export interface TripBrief {
  mode: TaxiMode;
  origin: Landmark;
  destination: Landmark;
  optimal: PathResult;
}

export type Grade = "perfect" | "good" | "fair" | "detour";

export interface TripScore {
  playerM: number;
  optimalM: number;
  excessRatio: number;
  grade: Grade;
  playerFare: FareBreakdown;
  optimalFare: FareBreakdown;
}
