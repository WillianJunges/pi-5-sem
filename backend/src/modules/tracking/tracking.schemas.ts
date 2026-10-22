import { z } from 'zod';

export const trackingId = z.uuid().transform(value => value.toLowerCase());
export const positionSchema = z.object({
  sampleId: trackingId,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100),
  capturedAt: z.iso.datetime({ offset: true }).transform(value => new Date(value)),
}).strict();
export type PositionInput = z.infer<typeof positionSchema>;
export interface TrackingPosition {
  deliveryId: string;
  sampleId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  receivedAt: string;
}
export interface TrackingView { deliveryId: string; active: boolean; position: TrackingPosition | null; stale: boolean }
