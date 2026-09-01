import { FakeDb, InProcessBus, EVENTS } from '@iamfriendof/shared';
import { SearchService } from './index';

describe('SearchService', () => {
  it('rejects an over-long member query', async () => {
    const service = new SearchService(new FakeDb(), new InProcessBus());
    await expect(service.searchMembers('x'.repeat(101))).rejects.toMatchObject({
      code: 'SEARCH_QUERY_TOO_LONG',
    });
  });

  it('excludes private profiles and ranks exact above partial', async () => {
    const db = new FakeDb().on('FROM member_search_index', () => ({
      rows: [
        { member_id: '1', display_name: 'Ada Zeta', is_private: false },
        { member_id: '2', display_name: 'Ada', is_private: false },
        { member_id: '3', display_name: 'Ada', is_private: true }, // private -> excluded
      ],
      rowCount: 3,
    }));
    const service = new SearchService(db, new InProcessBus());
    const results = await service.searchMembers('Ada');
    // Private 'Ada' (member 3) excluded; exact public 'Ada' (2) first, then 'Ada Zeta'.
    expect(results.map((r) => r.memberId)).toEqual(['2', '1']);
  });

  it('reindexes a member on member.updated', async () => {
    const db = new FakeDb()
      .on('SELECT (m.first_name', () => ({
        rows: [{ display_name: 'Grace Hopper', is_private: false, skills_text: 'Logistics', interests_text: 'Education' }],
        rowCount: 1,
      }))
      .on('INSERT INTO member_search_index', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const service = new SearchService(db, bus);
    service.registerConsumers();
    await bus.publish(EVENTS.MEMBER_UPDATED, { memberId: 'm1' });
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO member_search_index'))).toBe(true);
  });

  it('reindexes an event on event.created', async () => {
    const db = new FakeDb()
      .on('SELECT e.title, e.description', () => ({
        rows: [{ title: 'Cleanup', description: 'Beach', start_at: new Date().toISOString(), interests_text: 'Environment' }],
        rowCount: 1,
      }))
      .on('INSERT INTO event_search_index', () => ({ rows: [], rowCount: 1 }));
    const bus = new InProcessBus();
    const service = new SearchService(db, bus);
    service.registerConsumers();
    await bus.publish(EVENTS.EVENT_CREATED, { eventId: 'e1', organiserId: 'o1' });
    expect(db.calls.some((c) => c.sql.includes('INSERT INTO event_search_index'))).toBe(true);
  });
});
