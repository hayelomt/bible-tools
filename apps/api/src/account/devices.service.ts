import { type Device } from '@lamp/domain';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException, ErrorCode } from '../common/errors.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { PrismaService } from '../prisma/prisma.service.js';

/** The device a push or pull came from, as it names itself. */
export interface SyncingDevice {
  id: string;
  name: string;
  clientVersion: string;
}

/** The account's devices (§6.6): recorded as they sync, listed in settings, signed out from there. */
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Records a sync from `device`: creates it on its first sync, otherwise updates its name, version
   * and last sync, and links the session to it, so signing the device out ends that session.
   */
  async synced(userId: string, sessionId: string, device: SyncingDevice): Promise<void> {
    const { id, name, clientVersion } = device;
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.upsert({
        where: { userId_id: { userId, id } },
        create: { userId, id, name, clientVersion, createdAt: now, lastSyncAt: now },
        update: { name, clientVersion, lastSyncAt: now },
      }),
      this.prisma.session.updateMany({
        where: { id: sessionId, OR: [{ deviceId: null }, { deviceId: { not: id } }] },
        data: { deviceId: id },
      }),
    ]);
  }

  /**
   * The devices signed in to the account: those with a live session, most recently synced first.
   * A device signed out (here, by a password change or reset, or by its own sign-out) drops off
   * until it signs in and syncs again.
   */
  async list(userId: string): Promise<Device[]> {
    const sessions = await this.prisma.session.findMany({
      where: { userId, deviceId: { not: null }, expiresAt: { gt: new Date() } },
      select: { deviceId: true },
      distinct: ['deviceId'],
    });
    const devices = await this.prisma.device.findMany({
      where: { userId, id: { in: sessions.map((s) => s.deviceId!) } },
      orderBy: [{ lastSyncAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      clientVersion: d.clientVersion,
      createdAt: d.createdAt.toISOString(),
      lastSyncAt: d.lastSyncAt?.toISOString() ?? null,
    }));
  }

  /**
   * Signs a device out by ending its sessions: its next request gets `401`, and its notes stay on
   * it (§6.6). `404` when the account has no such device signed in.
   */
  async signOut(userId: string, deviceId: string): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({ where: { userId, deviceId } });
    if (count === 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'No such device');
    }
  }
}
