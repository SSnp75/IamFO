import { FakeDb, InProcessBus, EVENTS, AllowAllModerationFilter, type DomainEvent } from '@iamfriendof/shared';
import { PmRatingService } from './index';

describe('PmRatingService', () => {
  it('shows Insufficient Data below 3 completed events', async () => {
    const db = new FakeDb().on('SELECT * FROM pm_scores WHERE member_id', () => ({
      rows: [{ member_id: 'm1', score: '80', events_organised: 2, completion_rate: null, avg_peer_rating: null, pending_update: false }],
      rowCount: 1,
    }));
    const service = new PmRatingService(db, new InProcessBus());
    const view = await service.getScore('m1');
    expect(view.display).toBe('insufficient_data');
    expect(view.score).toBeNull();
  });

  it('shows a numeric score at or above 3 completed events', async () => {
    const db = new FakeDb().on('SELECT * FROM pm_scores WHERE member_id', () => ({
      rows: [{ member_id: 'm1', score: '72.5', events_organised: 4, completion_rate: '0.90', avg_peer_rating: '4.20', pending_update: false }],
      rowCount: 1,
    }));
    const service = new PmRatingService(db, new InProcessBus());
    const view = await service.getScore('m1');
    expect(view.display).toBe('score');
    expect(view.score).toBe(72.5);
  });

  it('rejects a peer rating outside the 14-day window', async () => {
    const longAgoEnd = new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString();
    const db = new FakeDb().on('SELECT end_at, organiser_id FROM events', () => ({
      rows: [{ end_at: longAgoEnd, organiser_id: 'org1' }],
      rowCount: 1,
    }));
    const service = new PmRatingService(db, new InProcessBus(), new AllowAllModerationFilter());
    await expect(service.submitPeerRating({ eventId: 'e1', raterId: 'r1', rating: 5 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('rejects an out-of-range rating', async () => {
    const service = new PmRatingService(new FakeDb(), new InProcessBus());
    await expect(service.submitPeerRating({ eventId: 'e1', raterId: 'r1', rating: 6 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('records a valid peer rating and recalculates + publishes pm_score.updated', async () => {
    const recentEnd = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString();
    const db = new FakeDb()
      .on('SELECT end_at, organiser_id FROM events', () => ({ rows: [{ end_at: recentEnd, organiser_id: 'org1' }], rowCount: 1 }))
      .on('INSERT INTO peer_ratings', () => ({ rows: [], rowCount: 1 }))
      .on('INSERT INTO pm_score_audit', () => ({ rows: [], rowCount: 1 }))
      .on("COUNT(*) FILTER (WHERE status = 'completed')", () => ({ rows: [{ completed: '4', total: '5' }], rowCount: 1 }))
      .on('SELECT AVG(numeric_rating) AS avg', () => ({ rows: [{ avg: '4.5' }], rowCount: 1 }))
      .on('SELECT responses FROM self_assessments', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO pm_scores', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const updated: DomainEvent[] = [];
    bus.subscribe(EVENTS.PM_SCORE_UPDATED, (e) => updated.push(e));
    const service = new PmRatingService(db, bus, new AllowAllModerationFilter());
    await service.submitPeerRating({ eventId: 'e1', raterId: 'r1', rating: 5, comment: 'Great organiser' });
    expect(updated).toHaveLength(1);
    expect(updated[0]?.payload).toHaveProperty('memberId', 'org1');
  });

  it('recalculates the organiser score when an event.completed event fires', async () => {
    const db = new FakeDb()
      .on('INSERT INTO pm_score_audit', () => ({ rows: [], rowCount: 1 }))
      .on("COUNT(*) FILTER (WHERE status = 'completed')", () => ({ rows: [{ completed: '3', total: '3' }], rowCount: 1 }))
      .on('SELECT AVG(numeric_rating) AS avg', () => ({ rows: [{ avg: null }], rowCount: 1 }))
      .on('SELECT responses FROM self_assessments', () => ({ rows: [], rowCount: 0 }))
      .on('INSERT INTO pm_scores', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const updated: DomainEvent[] = [];
    bus.subscribe(EVENTS.PM_SCORE_UPDATED, (e) => updated.push(e));
    const service = new PmRatingService(db, bus, new AllowAllModerationFilter());
    service.registerConsumers();
    await bus.publish(EVENTS.EVENT_COMPLETED, { eventId: 'e1', organiserId: 'org1' });
    expect(updated).toHaveLength(1);
  });

  it('rejects a self-assessment with fewer than 10 responses', async () => {
    const service = new PmRatingService(new FakeDb(), new InProcessBus());
    await expect(
      service.submitSelfAssessment('m1', [{ questionId: 1, score: 3 }]),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
