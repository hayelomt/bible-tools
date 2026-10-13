import { z } from 'zod';
import { lineSchema, timestampSchema } from './common.ts';

/** `GET /api/health`. */
export const healthResponseSchema = z.strictObject({
  status: z.literal('ok'),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** The one error body every endpoint returns (§7.1). */
export const apiErrorSchema = z.strictObject({
  statusCode: z.int(),
  /** Machine-readable; the web app switches on it. */
  errorCode: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** A device in `GET /api/account/devices` (§6.6). Its id is the device's own `syncState.deviceId`. */
export const deviceSchema = z.strictObject({
  id: z.uuid(),
  name: lineSchema(100),
  clientVersion: lineSchema(50),
  createdAt: timestampSchema,
  lastSyncAt: timestampSchema.nullable(),
});
export type Device = z.infer<typeof deviceSchema>;

export const devicesResponseSchema = z.strictObject({ devices: z.array(deviceSchema) });
export type DevicesResponse = z.infer<typeof devicesResponseSchema>;

/** `DELETE /api/account/devices/:id`: signs that device out. */
export const deviceParamsSchema = z.strictObject({ id: z.uuid() });
export type DeviceParams = z.infer<typeof deviceParamsSchema>;
