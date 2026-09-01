import fc from 'fast-check';
import {
  FakeDb,
  InProcessBus,
  AllowAllModerationFilter,
  DenyListModerationFilter,
} from '@iamfriendof/shared';
import { ProfileService, applyPrivacyFilter } from './index';
import type { ProfileRow } from './repository';

function row(overrides: Partial<ProfileRow> = {}): ProfileRow {
  return {
    member_id: 'm1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    is_private: false,
    purpose_statement: 'Helping out',
    profile_picture_url: 'http://img/x.png',
    profile_picture_alt: 'me',
    ...overrides,
  };
}

describe('applyPrivacyFilter (Requirement 3.8)', () => {
  it('exposes only first name when private', () => {
    const pub = applyPrivacyFilter(row({ is_private: true }), ['Skill']);
    expect(pub).toEqual({ memberId: 'm1', firstName: 'Ada', isPrivate: true });
    expect(pub.lastName).toBeUndefined();
    expect(pub.purposeStatement).toBeUndefined();
    expect(pub.skills).toBeUndefined();
  });

  it('exposes full profile when public', () => {
    const pub = applyPrivacyFilter(row({ is_private: false }), ['First Aid']);
    expect(pub.lastName).toBe('Lovelace');
    expect(pub.skills).toEqual(['First Aid']);
    expect(pub.purposeStatement).toBe('Helping out');
  });

  it('property: private profiles never leak fields beyond first name', () => {
    fc.assert(
      fc.property(
        fc.record({
          first: fc.string({ minLength: 1, maxLength: 20 }),
          last: fc.string({ minLength: 1, maxLength: 20 }),
          purpose: fc.string({ maxLength: 100 }),
        }),
        ({ first, last, purpose }) => {
          const pub = applyPrivacyFilter(
            row({ is_private: true, first_name: first, last_name: last, purpose_statement: purpose }),
            ['x', 'y'],
          );
          expect(Object.keys(pub).sort()).toEqual(['firstName', 'isPrivate', 'memberId']);
        },
      ),
    );
  });
});

describe('ProfileService', () => {
  it('rejects a purpose statement over 500 chars without persisting', async () => {
    const db = new FakeDb();
    const service = new ProfileService(db, new InProcessBus(), new AllowAllModerationFilter());
    await expect(service.updatePurpose('m1', 'x'.repeat(501))).rejects.toMatchObject({
      code: 'PURPOSE_STATEMENT_TOO_LONG',
    });
    expect(db.calls).toHaveLength(0);
  });

  it('saves a clean purpose statement and publishes member.updated', async () => {
    const db = new FakeDb()
      .on('INSERT INTO profiles', () => ({ rows: [], rowCount: 1 }))
      .on('INSERT INTO purpose_statement_history', () => ({ rows: [], rowCount: 1 }))
      .on('DELETE FROM purpose_statement_history', () => ({ rows: [], rowCount: 0 }));
    const bus = new InProcessBus();
    let updated = 0;
    bus.subscribe('member.updated' as never, () => {
      updated += 1;
    });
    const service = new ProfileService(db, bus, new AllowAllModerationFilter());
    const res = await service.updatePurpose('m1', 'A clean statement');
    expect(res.status).toBe('saved');
    expect(updated).toBe(1);
  });

  it('holds a flagged purpose statement as pending (not saved)', async () => {
    const db = new FakeDb();
    const service = new ProfileService(db, new InProcessBus(), new DenyListModerationFilter(['spamword']));
    const res = await service.updatePurpose('m1', 'this contains spamword here');
    expect(res.status).toBe('pending');
    expect(db.calls).toHaveLength(0);
  });
});
