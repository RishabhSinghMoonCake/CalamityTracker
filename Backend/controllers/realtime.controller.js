import { subscribeToIncidentEvents } from "../services/realtime.service.js";

export function streamIncidentEvents(req, res) {
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: {"ok":true}\n\n`);

  const unsubscribe = subscribeToIncidentEvents((event) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  });
}
