import type { DomainEvent, EventName, EventPayloads } from './events';
import type { EventHandler, MessageBus } from './MessageBus';

/**
 * Phase 0 broker stand-in: an in-process publish/subscribe bus.
 *
 * Behaviour chosen to mirror a real broker as closely as is useful:
 * - Multiple handlers may subscribe to the same event name; all are invoked.
 * - Handlers run asynchronously relative to the publisher: a publish schedules
 *   delivery on a microtask and resolves once all handlers have settled, but a
 *   handler throwing does NOT reject the publisher (a broker consumer failure
 *   would not fail the producer). Handler errors are routed to onHandlerError.
 * - Delivery is at-least-once in spirit but in-memory only; nothing is persisted.
 *
 * When extracted to Phase 1/2 this class is replaced by an AMQP/Kafka client
 * implementing the same {@link MessageBus} interface (Requirement 15.6).
 */
export class InProcessBus implements MessageBus {
  private readonly handlers = new Map<EventName, Set<EventHandler>>();

  constructor(
    /** Invoked when a subscriber handler throws. Defaults to console.error. */
    private readonly onHandlerError: (event: DomainEvent, error: unknown) => void = (event, error) => {
      // eslint-disable-next-line no-console
      console.error(`[InProcessBus] handler failed for "${event.name}"`, error);
    },
  ) {}

  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(handler as EventHandler);
  }

  async publish<N extends EventName>(name: N, payload: EventPayloads[N]): Promise<void> {
    const event: DomainEvent<N> = {
      name,
      payload,
      occurredAt: new Date().toISOString(),
    };

    const set = this.handlers.get(name);
    if (!set || set.size === 0) return;

    // Snapshot handlers so subscriptions added during dispatch do not run now.
    const handlers = [...set];

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(event as DomainEvent);
        } catch (error) {
          // A consumer failure must not fail the producer.
          this.onHandlerError(event as DomainEvent, error);
        }
      }),
    );
  }

  /** Test/utility helper: number of handlers registered for an event name. */
  handlerCount(name: EventName): number {
    return this.handlers.get(name)?.size ?? 0;
  }

  /** Test/utility helper: remove all subscriptions. */
  clear(): void {
    this.handlers.clear();
  }
}
