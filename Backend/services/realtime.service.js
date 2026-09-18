import { EventEmitter } from "node:events";

const events = new EventEmitter();
events.setMaxListeners(1000);

export function publishIncidentEvent(type, payload) {
  events.emit("incident", { type, payload, at: new Date().toISOString() });
}

export function subscribeToIncidentEvents(listener) {
  events.on("incident", listener);
  return () => events.off("incident", listener);
}
