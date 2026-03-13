import type { Response } from "express";

// Lightweight SSE event bus for admin real-time notifications
// Clients subscribe via GET /api/admin/events

export interface AdminEvent {
  type: "session_completed" | "analysis_ready" | "call_completed" | "session_started";
  data: Record<string, unknown>;
  timestamp: string;
}

const clients = new Set<Response>();

export function addSSEClient(res: Response): void {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export function emitAdminEvent(event: AdminEvent): void {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

export function getClientCount(): number {
  return clients.size;
}
