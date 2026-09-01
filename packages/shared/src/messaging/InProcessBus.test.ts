import { InProcessBus } from './InProcessBus';
import { EVENTS, type DomainEvent } from './events';

describe('InProcessBus', () => {
  it('delivers a published event to a single subscriber with correct payload and metadata', async () => {
    const bus = new InProcessBus();
    const received: DomainEvent[] = [];
    bus.subscribe(EVENTS.MEMBER_REGISTERED, (e) => {
      received.push(e);
    });

    await bus.publish(EVENTS.MEMBER_REGISTERED, {
      memberId: 'm1',
      email: 'a@b.com',
      verificationToken: 'tok',
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.name).toBe(EVENTS.MEMBER_REGISTERED);
    expect(received[0]?.payload).toEqual({ memberId: 'm1', email: 'a@b.com', verificationToken: 'tok' });
    expect(typeof received[0]?.occurredAt).toBe('string');
    expect(Number.isNaN(Date.parse(received[0]!.occurredAt))).toBe(false);
  });

  it('fans out to all subscribers of the same event', async () => {
    const bus = new InProcessBus();
    const calls: string[] = [];
    bus.subscribe(EVENTS.EVENT_COMPLETED, () => {
      calls.push('a');
    });
    bus.subscribe(EVENTS.EVENT_COMPLETED, () => {
      calls.push('b');
    });

    await bus.publish(EVENTS.EVENT_COMPLETED, { eventId: 'e1', organiserId: 'o1' });

    expect(calls.sort()).toEqual(['a', 'b']);
  });

  it('is a no-op when there are no subscribers', async () => {
    const bus = new InProcessBus();
    await expect(
      bus.publish(EVENTS.MEMBER_UPDATED, { memberId: 'm1' }),
    ).resolves.toBeUndefined();
  });

  it('does not deliver an event to handlers of a different name', async () => {
    const bus = new InProcessBus();
    const handler = jest.fn();
    bus.subscribe(EVENTS.COMMENT_POSTED, handler);

    await bus.publish(EVENTS.EVENT_CANCELLED, { eventId: 'e1' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler so the publisher still resolves and other handlers run', async () => {
    const errors: unknown[] = [];
    const bus = new InProcessBus((_event, error) => {
      errors.push(error);
    });
    const good = jest.fn();
    bus.subscribe(EVENTS.PM_SCORE_UPDATED, () => {
      throw new Error('boom');
    });
    bus.subscribe(EVENTS.PM_SCORE_UPDATED, good);

    await expect(
      bus.publish(EVENTS.PM_SCORE_UPDATED, { memberId: 'm1', newScore: 42 }),
    ).resolves.toBeUndefined();

    expect(errors).toHaveLength(1);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('reports handler counts and clears subscriptions', async () => {
    const bus = new InProcessBus();
    bus.subscribe(EVENTS.MEMBER_UPDATED, () => undefined);
    bus.subscribe(EVENTS.MEMBER_UPDATED, () => undefined);
    expect(bus.handlerCount(EVENTS.MEMBER_UPDATED)).toBe(2);

    bus.clear();
    expect(bus.handlerCount(EVENTS.MEMBER_UPDATED)).toBe(0);
  });
});
