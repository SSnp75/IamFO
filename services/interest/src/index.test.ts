import { FakeDb, InProcessBus, EVENTS } from '@iamfriendof/shared';
import { InterestService } from './index';

describe('InterestService', () => {
  it('rejects selecting more than 10 interests', async () => {
    const db = new FakeDb();
    const service = new InterestService(db, new InProcessBus());
    await expect(service.setMemberInterests('m1', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).rejects.toMatchObject({
      code: 'INTEREST_SELECTION_INVALID',
    });
    expect(db.calls).toHaveLength(0);
  });

  it('rejects selecting zero interests', async () => {
    const db = new FakeDb();
    const service = new InterestService(db, new InProcessBus());
    await expect(service.setMemberInterests('m1', [])).rejects.toMatchObject({
      code: 'INTEREST_SELECTION_INVALID',
    });
  });

  it('rejects when a selected interest id does not exist', async () => {
    const db = new FakeDb().on('SELECT id FROM interest_areas WHERE approved = TRUE AND id = ANY', () => ({
      rows: [{ id: 1 }], // only 1 of the 2 requested exists
      rowCount: 1,
    }));
    const service = new InterestService(db, new InProcessBus());
    await expect(service.setMemberInterests('m1', [1, 999])).rejects.toMatchObject({
      code: 'INTEREST_SELECTION_INVALID',
    });
  });

  it('saves a valid selection and publishes member.updated', async () => {
    const db = new FakeDb()
      .on('SELECT id FROM interest_areas WHERE approved = TRUE AND id = ANY', () => ({
        rows: [{ id: 1 }, { id: 2 }],
        rowCount: 2,
      }))
      .on('DELETE FROM member_interests', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO member_interests', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    let updated = 0;
    bus.subscribe(EVENTS.MEMBER_UPDATED, () => {
      updated += 1;
    });
    const service = new InterestService(db, bus);
    await service.setMemberInterests('m1', [1, 2, 2]); // dedupes to [1,2]
    expect(updated).toBe(1);
  });

  it('rejects a whitespace-only custom label', async () => {
    const db = new FakeDb();
    const service = new InterestService(db, new InProcessBus());
    await expect(service.submitCustomInterest('m1', '   ')).rejects.toMatchObject({
      code: 'INTEREST_LABEL_INVALID',
    });
  });

  it('accepts a valid custom label', async () => {
    const db = new FakeDb().on('INSERT INTO custom_interest_requests', () => ({
      rows: [{ id: 42 }],
      rowCount: 1,
    }));
    const service = new InterestService(db, new InProcessBus());
    const res = await service.submitCustomInterest('m1', '  Beach Cleanups  ');
    expect(res.requestId).toBe(42);
  });
});
