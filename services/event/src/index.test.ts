import { FakeDb, InProcessBus, EVENTS, type DomainEvent } from '@iamfriendof/shared';
import { EventService } from './index';

const FUTURE = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
const FUTURE_END = new Date(Date.now() + 31 * 24 * 3600 * 1000).toISOString();

function validInput(overrides = {}) {
  return {
    organiserId: 'org1',
    title: 'Beach Cleanup',
    description: 'Come help clean the beach',
    locationDetails: 'North Beach',
    startAt: FUTURE,
    endAt: FUTURE_END,
    maxParticipants: 100,
    interestIds: [1],
    ...overrides,
  };
}

describe('EventService', () => {
  it('rejects an event with end <= start', async () => {
    const service = new EventService(new FakeDb(), new InProcessBus());
    await expect(
      service.create(validInput({ startAt: FUTURE_END, endAt: FUTURE })),
    ).rejects.toMatchObject({ code: 'INVALID_EVENT_DATES' });
  });

  it('rejects an event with no interest tags', async () => {
    const service = new EventService(new FakeDb(), new InProcessBus());
    await expect(service.create(validInput({ interestIds: [] }))).rejects.toMatchObject({
      code: 'MISSING_REQUIRED_FIELD',
    });
  });

  it('rejects max participants outside 1-500', async () => {
    const service = new EventService(new FakeDb(), new InProcessBus());
    await expect(service.create(validInput({ maxParticipants: 501 }))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });

  it('creates a valid event and publishes event.created', async () => {
    const db = new FakeDb()
      .on('INSERT INTO events', () => ({ rows: [{ id: 'e1' }], rowCount: 1 }))
      .on('INSERT INTO event_interest_tags', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const created: DomainEvent[] = [];
    bus.subscribe(EVENTS.EVENT_CREATED, (e) => created.push(e));
    const service = new EventService(db, bus);
    const { eventId } = await service.create(validInput());
    expect(eventId).toBe('e1');
    expect(created).toHaveLength(1);
  });

  it('rejects joining a non-active event with REGISTRATION_CLOSED', async () => {
    const db = new FakeDb().on('SELECT * FROM events WHERE id', () => ({
      rows: [{ id: 'e1', organiser_id: 'org1', status: 'completed', start_at: FUTURE, end_at: FUTURE_END, max_participants: 100, title: 't', description: 'd', location_details: null }],
      rowCount: 1,
    }));
    const service = new EventService(db, new InProcessBus());
    await expect(service.join('e1', 'm1')).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
  });

  it('publishes participant.promoted when a withdrawal promotes a waitlisted member', async () => {
    // withdraw() uses a transaction; FakeDb runs tx queries through the same responder set.
    const db = new FakeDb()
      .on('SELECT id FROM events WHERE id', () => ({ rows: [{ id: 'e1' }], rowCount: 1 }))
      .on('SELECT status FROM event_participants WHERE event_id', () => ({ rows: [{ status: 'confirmed' }], rowCount: 1 }))
      .on("UPDATE event_participants SET status = 'withdrawn'", () => ({ rows: [], rowCount: 1 }))
      .on("SELECT member_id FROM event_participants", () => ({ rows: [{ member_id: 'waiting1' }], rowCount: 1 }))
      .on("UPDATE event_participants SET status = 'confirmed'", () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const promoted: DomainEvent[] = [];
    bus.subscribe(EVENTS.PARTICIPANT_PROMOTED, (e) => promoted.push(e));
    const service = new EventService(db, bus);
    await service.withdraw('e1', 'leaving1');
    expect(promoted).toHaveLength(1);
    expect(promoted[0]?.payload).toMatchObject({ eventId: 'e1', memberId: 'waiting1' });
  });

  it('rejects an edit within 24h of start (EDIT_WINDOW_CLOSED)', async () => {
    const soon = new Date(Date.now() + 3600 * 1000).toISOString(); // 1h away
    const db = new FakeDb().on('SELECT * FROM events WHERE id', () => ({
      rows: [{ id: 'e1', organiser_id: 'org1', status: 'active', start_at: soon, end_at: FUTURE_END, max_participants: 100, title: 't', description: 'd', location_details: null }],
      rowCount: 1,
    }));
    const service = new EventService(db, new InProcessBus());
    await expect(service.edit('e1', 'org1', { title: 'New' })).rejects.toMatchObject({
      code: 'EDIT_WINDOW_CLOSED',
    });
  });

  it('only the organiser can cancel', async () => {
    const db = new FakeDb().on('SELECT * FROM events WHERE id', () => ({
      rows: [{ id: 'e1', organiser_id: 'org1', status: 'active', start_at: FUTURE, end_at: FUTURE_END, max_participants: 100, title: 't', description: 'd', location_details: null }],
      rowCount: 1,
    }));
    const service = new EventService(db, new InProcessBus());
    await expect(service.cancel('e1', 'someone-else')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
