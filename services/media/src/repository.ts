import type { Db, Row } from '@iamfriendof/shared';

export interface PictureRow extends Row {
  profile_picture_url: string | null;
}

export class MediaRepository {
  constructor(private readonly db: Db) {}

  async getCurrentPictureUrl(memberId: string): Promise<string | null> {
    const res = await this.db.queryRead<PictureRow>(
      'SELECT profile_picture_url FROM profiles WHERE member_id = $1',
      [memberId],
    );
    return res.rows[0]?.profile_picture_url ?? null;
  }

  /** Upsert the picture url + alt text onto the member's profile row. */
  async setPicture(memberId: string, url: string, alt: string): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO profiles (member_id, profile_picture_url, profile_picture_alt, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (member_id)
       DO UPDATE SET profile_picture_url = EXCLUDED.profile_picture_url,
                     profile_picture_alt = EXCLUDED.profile_picture_alt,
                     updated_at = NOW()`,
      [memberId, url, alt],
    );
  }

  async clearPicture(memberId: string): Promise<void> {
    await this.db.queryWrite(
      `UPDATE profiles SET profile_picture_url = NULL, profile_picture_alt = NULL, updated_at = NOW()
       WHERE member_id = $1`,
      [memberId],
    );
  }
}
