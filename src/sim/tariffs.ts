import type { MeterTariff, TaxiMode } from "./types";

/** Game approximations of published HK taxi tariffs (not a legal fare quote). */
export const TARIFFS: Record<TaxiMode, MeterTariff> = {
  red: {
    mode: "red",
    flagHkd: 29,
    flagIncludesM: 2000,
    incrementHkd: 2.1,
    incrementM: 200,
    waitingHkd: 2.1,
    waitingPeriodSec: 60,
  },
  green: {
    mode: "green",
    flagHkd: 25.5,
    flagIncludesM: 2000,
    incrementHkd: 1.9,
    incrementM: 200,
    waitingHkd: 1.9,
    waitingPeriodSec: 60,
  },
  blue: {
    mode: "blue",
    flagHkd: 24,
    flagIncludesM: 2000,
    incrementHkd: 1.9,
    incrementM: 200,
    waitingHkd: 1.9,
    waitingPeriodSec: 60,
  },
};
