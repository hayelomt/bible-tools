import { createHmac } from 'node:crypto';

/**
 * A group's invite token (§17.12): HMAC-SHA256 of the group's id and its invite's version under
 * `SHARE_LINK_SECRET`, base64url, so the owner can copy it again, and a new version turns the old
 * one off. Only its SHA-256 is stored, as for share links (decision 96).
 */
export function inviteToken(secret: string, groupId: string, version: number): string {
  return createHmac('sha256', secret).update(`invite:${groupId}:${version}`).digest('base64url');
}
