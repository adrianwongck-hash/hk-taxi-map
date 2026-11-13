import { TARIFFS } from "./tariffs";
import type { FareBreakdown, GraphEdge, TaxiMode } from "./types";

export function calculateFare(
  mode: TaxiMode,
  edges: GraphEdge[],
  waitingSeconds = 0,
): FareBreakdown {
  const tariff = TARIFFS[mode];
  const distanceM = edges.reduce((sum, e) => sum + e.lengthM, 0);
  const tollsHkd = edges.reduce((sum, e) => sum + (e.tollHkd ?? 0), 0);

  let distanceHkd = 0;
  if (distanceM > tariff.flagIncludesM) {
    const extraM = distanceM - tariff.flagIncludesM;
    const steps = Math.ceil(extraM / tariff.incrementM);
    distanceHkd = steps * tariff.incrementHkd;
  }

  const waitingPeriods =
    waitingSeconds > 0
      ? Math.ceil(waitingSeconds / tariff.waitingPeriodSec)
      : 0;
  const waitingHkd = waitingPeriods * tariff.waitingHkd;

  const flagHkd = tariff.flagHkd;
  const totalHkd =
    Math.round((flagHkd + distanceHkd + waitingHkd + tollsHkd) * 10) / 10;

  return {
    flagHkd,
    distanceHkd: Math.round(distanceHkd * 10) / 10,
    waitingHkd: Math.round(waitingHkd * 10) / 10,
    tollsHkd,
    totalHkd,
  };
}

export function formatHkd(amount: number): string {
  return `$${amount.toFixed(1)}`;
}
