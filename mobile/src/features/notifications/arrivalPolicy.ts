import { usableFix, type PositionFix } from '../tracking/policy';

export interface ArrivalState {
  firstNearAt: number;
  lastSampleAt: number;
  nearCount: number;
  notifiedAt: number | null;
  leaseId: string | null;
  leaseUntil: number;
  eventId: string;
}
export interface ArrivalClaim {
  userId: string;
  deliveryId: string;
  orderId: string;
  eventId: string;
  leaseId: string;
}
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radians = (n: number) => (n * Math.PI) / 180;
  const lat = radians(b.latitude - a.latitude),
    lon = radians(b.longitude - a.longitude);
  const h =
    Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(lon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(Math.min(1, h)), Math.sqrt(Math.max(0, 1 - h)));
}
/** Margem conservadora de precisão: todo o círculo de incerteza deve caber no raio inicial. */
export function nearDestination(
  fix: PositionFix,
  destination: { latitude: number; longitude: number },
  now: number,
): boolean {
  return (
    usableFix(fix, now) &&
    now - fix.timestamp <= 30_000 &&
    fix.accuracy! <= 40 &&
    Number.isFinite(destination.latitude) &&
    Math.abs(destination.latitude) <= 90 &&
    Number.isFinite(destination.longitude) &&
    Math.abs(destination.longitude) <= 180 &&
    distanceMeters(fix, destination) + fix.accuracy! <= 100
  );
}
export function nextArrival(
  previous: ArrivalState | null,
  sampleAt: number,
  near: boolean,
  eventId: string,
): ArrivalState {
  const state = previous ?? {
    firstNearAt: 0,
    lastSampleAt: 0,
    nearCount: 0,
    notifiedAt: null,
    leaseId: null,
    leaseUntil: 0,
    eventId,
  };
  if (sampleAt <= state.lastSampleAt || state.notifiedAt !== null) return state;
  if (!near) return { ...state, firstNearAt: 0, lastSampleAt: sampleAt, nearCount: 0 };
  if (state.nearCount === 0 || sampleAt - state.lastSampleAt > 60_000)
    return { ...state, firstNearAt: sampleAt, lastSampleAt: sampleAt, nearCount: 1 };
  return {
    ...state,
    lastSampleAt: sampleAt,
    nearCount: sampleAt - state.firstNearAt >= 5000 ? state.nearCount + 1 : state.nearCount,
  };
}
