import type { DomainEvent, EventName, EventPayloads } from './events';

/** A handler invoked for each event of a subscribed name. */
export type EventHandler<N extends EventName = EventName> = (
  event: DomainEvent<N>,
) => void | Promise<void>;

/**
 * Transport-agnostic publish/subscribe contract.
 *
 * Phase 0 uses {@link InProcessBus}; Phase 1/2 provides an AMQP/Kafka-backed
 * implementation of this same interface. Callers depend only on this contract,
 * so swapping the transport requires no changes to publishers or subscribers.
 */
export interface MessageBus {
  publish<N extends EventName>(name: N, payload: EventPayloads[N]): Promise<void>;
  subscribe<N extends EventName>(name: N, handler: EventHandler<N>): void;
}
