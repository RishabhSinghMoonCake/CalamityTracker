import { EventEmitter } from "node:events";
import redisClient from "../config/redis.js";

const localEvents = new EventEmitter();
localEvents.setMaxListeners(1000);

const REDIS_CHANNEL = "calamity:realtime-events";
let redisSubscriber = null;
let isSubscribed = false;
let subscriptionPromise = null;

/**
 * Initializes Redis Pub/Sub subscriber client if Redis is available.
 */
async function ensureSubscriber() {
  if (isSubscribed || !redisClient?.isReady) return;

  if (subscriptionPromise) return subscriptionPromise;

  subscriptionPromise = (async () => {
    redisSubscriber = redisClient.duplicate();
    await redisSubscriber.connect();

    await redisSubscriber.subscribe(REDIS_CHANNEL, (message) => {
      try {
        const parsed = JSON.parse(message);
        localEvents.emit("incident", parsed);
      } catch (err) {
        console.warn("Failed to parse Redis realtime message:", err.message);
      }
    });

    isSubscribed = true;
    console.log("Redis realtime pub/sub subscriber active on channel:", REDIS_CHANNEL);
  })().catch((error) => {
    console.warn("Could not establish Redis subscriber; falling back to in-process events:", error.message);
    redisSubscriber = null;
  }).finally(() => { subscriptionPromise = null; });
  return subscriptionPromise;
}

/**
 * Publishes an incident event across all processes via Redis Pub/Sub,
 * and emits locally.
 */
export async function publishIncidentEvent(type, payload) {
  const event = { id: null, type, payload, at: new Date().toISOString() };
  try {
    if (redisClient?.isReady) {
      event.id = String(await redisClient.incr("calamity:realtime-event-id"));
      await redisClient.publish(REDIS_CHANNEL, JSON.stringify(event));
      return;
    }
  } catch (err) {
    console.warn("Failed to publish event to Redis:", err.message);
  }
  event.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localEvents.emit("incident", event);
}

/**
 * Subscribes an SSE connection listener to incident events.
 */
export function subscribeToIncidentEvents(listener) {
  ensureSubscriber().catch(() => {});
  localEvents.on("incident", listener);
  return () => localEvents.off("incident", listener);
}
