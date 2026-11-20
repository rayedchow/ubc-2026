/**
 * The live event feed behind the visualizer (`GET /api/v1/events`).
 *
 * Every event is real: emitted by the code path that did the thing, with
 * transaction signatures where something went onchain. Events never carry
 * secrets: no answer keys, hidden checks or private keys, and model outputs
 * only as a short preview.
 */

import { EventEmitter } from "node:events";

export type Lane = "trainer" | "enclave" | "solana";

export type FeedEvent = {
  id: number;
  at: string;
  lane: Lane;
  kind: string;
  /** One line a person can read. */
  text: string;
  /** Devnet transaction signature, when something landed (or failed) onchain. */
  tx?: string;
  ok?: boolean;
  data?: Record<string, unknown>;
};

type Bus = { emitter: EventEmitter; recent: FeedEvent[]; next: number };
const g = globalThis as unknown as { __modelmon_bus?: Bus };
const bus: Bus = (g.__modelmon_bus ??= { emitter: new EventEmitter().setMaxListeners(100), recent: [], next: 1 });

export function emit(e: Omit<FeedEvent, "id" | "at">): FeedEvent {
  const event: FeedEvent = { ...e, id: bus.next++, at: new Date().toISOString() };
  bus.recent.push(event);
  if (bus.recent.length > 500) bus.recent.splice(0, bus.recent.length - 500);
  bus.emitter.emit("event", event);
  return event;
}

export function recentEvents(sinceId = 0): FeedEvent[] {
  return bus.recent.filter((e) => e.id > sinceId);
}

export function subscribe(fn: (e: FeedEvent) => void): () => void {
  bus.emitter.on("event", fn);
  return () => bus.emitter.off("event", fn);
}
