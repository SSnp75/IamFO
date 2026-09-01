import {
  AppError,
  ERROR_CODES,
  EVENTS,
  type Db,
  type MessageBus,
} from '@iamfriendof/shared';
import { MediaRepository } from './repository';
import { validateUpload, computeResizedDimensions } from './imageProcessor';
import { InMemoryObjectStorage, type ObjectStorage } from './storage';

export * from './imageProcessor';
export * from './storage';

const DEFAULT_AVATAR_URL = '/assets/default-avatar.png';

export interface UploadInput {
  memberId: string;
  mime: string;
  byteSize: number;
  bytes: Uint8Array;
  altText: string;
  /** Original image dimensions (from the client / decoder). */
  width: number;
  height: number;
}

export interface UploadResult {
  url: string;
  storedWidth: number;
  storedHeight: number;
}

export class MediaService {
  private readonly repo: MediaRepository;
  constructor(
    private readonly db: Db,
    private readonly bus: MessageBus,
    private readonly storage: ObjectStorage = new InMemoryObjectStorage(),
  ) {
    this.repo = new MediaRepository(db);
  }

  /**
   * Validate and store a profile picture. On success replaces the existing
   * picture (deleting the old object) and updates the profile. On storage
   * failure the existing picture is retained (Requirement 5.9).
   */
  async uploadProfilePicture(input: UploadInput): Promise<UploadResult> {
    validateUpload(input.mime, input.byteSize, input.altText);
    const dims = computeResizedDimensions(input.width, input.height);

    const previousUrl = await this.repo.getCurrentPictureUrl(input.memberId);
    const key = `profile/${input.memberId}/${crypto.randomUUID()}`;

    let url: string;
    try {
      url = await this.storage.put(key, input.bytes, input.mime);
    } catch {
      throw new AppError(
        ERROR_CODES.MEDIA_STORAGE_FAILED,
        'The image could not be stored; your existing picture is unchanged',
        500,
      );
    }

    try {
      await this.repo.setPicture(input.memberId, url, input.altText);
    } catch (err) {
      // Roll back the just-stored object to avoid orphans; keep old picture.
      await this.storage.delete(key).catch(() => undefined);
      throw new AppError(ERROR_CODES.MEDIA_STORAGE_FAILED, 'Failed to update profile picture', 500);
    }

    // Best-effort delete of the previous object (do not fail the request).
    if (previousUrl) {
      const prevKey = keyFromUrl(previousUrl);
      if (prevKey) await this.storage.delete(prevKey).catch(() => undefined);
    }

    await this.bus.publish(EVENTS.MEMBER_UPDATED, { memberId: input.memberId });
    return { url, storedWidth: dims.width, storedHeight: dims.height };
  }

  /** Remove the current picture and restore the default avatar (Requirement 5.7). */
  async removeProfilePicture(memberId: string): Promise<{ url: string }> {
    const previousUrl = await this.repo.getCurrentPictureUrl(memberId);
    await this.repo.clearPicture(memberId);
    if (previousUrl) {
      const prevKey = keyFromUrl(previousUrl);
      if (prevKey) await this.storage.delete(prevKey).catch(() => undefined);
    }
    await this.bus.publish(EVENTS.MEMBER_UPDATED, { memberId });
    return { url: DEFAULT_AVATAR_URL };
  }
}

/** Extract the storage key ('profile/.../uuid') from a public URL. */
function keyFromUrl(url: string): string | undefined {
  const idx = url.indexOf('profile/');
  return idx >= 0 ? url.slice(idx) : undefined;
}
