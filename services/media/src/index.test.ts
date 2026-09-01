import { FakeDb, InProcessBus, EVENTS } from '@iamfriendof/shared';
import { MediaService } from './index';
import { InMemoryObjectStorage, type ObjectStorage } from './storage';

const bytes = new Uint8Array([1, 2, 3]);

function baseInput(overrides = {}) {
  return {
    memberId: 'm1',
    mime: 'image/png',
    byteSize: 1024,
    bytes,
    altText: 'A photo of me',
    width: 800,
    height: 600,
    ...overrides,
  };
}

describe('MediaService', () => {
  it('rejects an unsupported format before storing', async () => {
    const db = new FakeDb();
    const storage = new InMemoryObjectStorage();
    const service = new MediaService(db, new InProcessBus(), storage);
    await expect(service.uploadProfilePicture(baseInput({ mime: 'image/gif' }))).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE_FORMAT',
    });
    expect(storage.objects.size).toBe(0);
  });

  it('rejects an oversized image', async () => {
    const service = new MediaService(new FakeDb(), new InProcessBus(), new InMemoryObjectStorage());
    await expect(
      service.uploadProfilePicture(baseInput({ byteSize: 6 * 1024 * 1024 })),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' });
  });

  it('rejects missing/empty alt text', async () => {
    const service = new MediaService(new FakeDb(), new InProcessBus(), new InMemoryObjectStorage());
    await expect(service.uploadProfilePicture(baseInput({ altText: '' }))).rejects.toMatchObject({
      code: 'ALT_TEXT_INVALID',
    });
  });

  it('stores a valid upload, computes resized dimensions, and publishes member.updated', async () => {
    const db = new FakeDb()
      .on('SELECT profile_picture_url FROM profiles', () => ({ rows: [{ profile_picture_url: null }], rowCount: 1 }))
      .on('INSERT INTO profiles', () => ({ rows: [], rowCount: 1 }));
    const storage = new InMemoryObjectStorage();
    const bus = new InProcessBus();
    let updated = 0;
    bus.subscribe(EVENTS.MEMBER_UPDATED, () => {
      updated += 1;
    });
    const service = new MediaService(db, bus, storage);

    const res = await service.uploadProfilePicture(baseInput({ width: 800, height: 600 }));
    expect(res.storedWidth).toBe(400);
    expect(res.storedHeight).toBe(300); // 800x600 scaled to fit 400 wide
    expect(res.url).toContain('profile/m1/');
    expect(storage.objects.size).toBe(1);
    expect(updated).toBe(1);
  });

  it('retains the existing picture when storage fails (Req 5.9)', async () => {
    const db = new FakeDb().on('SELECT profile_picture_url FROM profiles', () => ({
      rows: [{ profile_picture_url: 'https://cdn.test/media/profile/m1/old' }],
      rowCount: 1,
    }));
    const failingStorage: ObjectStorage = {
      put: async () => {
        throw new Error('boom');
      },
      delete: async () => undefined,
    };
    const service = new MediaService(db, new InProcessBus(), failingStorage);
    await expect(service.uploadProfilePicture(baseInput())).rejects.toMatchObject({
      code: 'MEDIA_STORAGE_FAILED',
    });
    // No profile update attempted.
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO profiles'))).toBe(false);
  });

  it('removes the picture and restores the default avatar', async () => {
    const db = new FakeDb()
      .on('SELECT profile_picture_url FROM profiles', () => ({
        rows: [{ profile_picture_url: 'https://cdn.test/media/profile/m1/old' }],
        rowCount: 1,
      }))
      .on('UPDATE profiles SET profile_picture_url = NULL', () => ({ rows: [], rowCount: 1 }));
    const service = new MediaService(db, new InProcessBus(), new InMemoryObjectStorage());
    const res = await service.removeProfilePicture('m1');
    expect(res.url).toContain('default-avatar');
  });
});
