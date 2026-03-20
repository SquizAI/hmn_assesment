// ============================================================
// Webhook Dispatch — Fire-and-retry webhook delivery system
// ============================================================

import { getSupabase } from "./supabase.js";
import crypto from "crypto";

// Backoff schedule in seconds: 1m, 5m, 30m, 2h, 8h
const BACKOFF_SECONDS = [60, 300, 1800, 7200, 28800];
const MAX_ATTEMPTS = 5;
const DELIVERY_TIMEOUT_MS = 10000;

interface WebhookRow {
  id: string;
  url: string;
  secret: string | null;
  events: string[];
  is_active: boolean;
  campaign_id: string | null;
}

/**
 * Dispatch a webhook event to all matching active webhooks.
 * Fires asynchronously — does not block the caller.
 */
export function dispatchWebhookEvent(event: string, data: Record<string, unknown>) {
  // Fire and forget — errors are logged, not propagated
  _dispatch(event, data).catch((err) => {
    console.error("[webhook-dispatch] top-level error:", err);
  });
}

async function _dispatch(event: string, data: Record<string, unknown>) {
  const { data: webhooks, error } = await getSupabase()
    .from("cascade_webhooks")
    .select("id, url, secret, events, is_active, campaign_id")
    .eq("is_active", true);

  if (error || !webhooks?.length) return;

  const matching = (webhooks as WebhookRow[]).filter(
    (w) => w.events.includes(event) || w.events.includes("*")
  );

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  await Promise.allSettled(
    matching.map((webhook) => deliverWebhook(webhook, event, payload))
  );
}

async function deliverWebhook(
  webhook: WebhookRow,
  event: string,
  payload: Record<string, unknown>
) {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (webhook.secret) {
    headers["X-Webhook-Secret"] = webhook.secret;
    headers["X-Webhook-Signature"] = crypto
      .createHmac("sha256", webhook.secret)
      .update(body)
      .digest("hex");
  }

  try {
    const response = await fetch(webhook.url, {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    // Log delivery
    await getSupabase().from("cascade_webhook_deliveries").insert({
      webhook_id: webhook.id,
      event,
      payload,
      status: response.ok ? "delivered" : "retrying",
      attempt_count: 1,
      max_attempts: MAX_ATTEMPTS,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: response.ok ? null : getNextRetryTime(1),
      response_status: response.status,
      response_body: await safeResponseText(response),
    });
  } catch (err) {
    // Network error — schedule retry
    await getSupabase().from("cascade_webhook_deliveries").insert({
      webhook_id: webhook.id,
      event,
      payload,
      status: "retrying",
      attempt_count: 1,
      max_attempts: MAX_ATTEMPTS,
      last_attempt_at: new Date().toISOString(),
      next_retry_at: getNextRetryTime(1),
      error_message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

function getNextRetryTime(attemptCount: number): string | null {
  if (attemptCount >= MAX_ATTEMPTS) return null;
  const delaySec = BACKOFF_SECONDS[Math.min(attemptCount - 1, BACKOFF_SECONDS.length - 1)];
  return new Date(Date.now() + delaySec * 1000).toISOString();
}

async function safeResponseText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 1000); // Cap stored response
  } catch {
    return "";
  }
}

/**
 * Process pending retries. Called by the cron endpoint.
 * Returns count of processed deliveries.
 */
export async function processWebhookRetries(): Promise<{ processed: number; succeeded: number; failed: number }> {
  const now = new Date().toISOString();

  // Find deliveries due for retry
  const { data: pending, error } = await getSupabase()
    .from("cascade_webhook_deliveries")
    .select("*, cascade_webhooks!inner(url, secret, is_active)")
    .eq("status", "retrying")
    .lte("next_retry_at", now)
    .limit(50);

  if (error || !pending?.length) return { processed: 0, succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;

  for (const delivery of pending) {
    const webhook = delivery.cascade_webhooks as unknown as { url: string; secret: string | null; is_active: boolean };
    if (!webhook?.is_active) {
      // Webhook was deactivated — mark as failed
      await getSupabase()
        .from("cascade_webhook_deliveries")
        .update({ status: "failed", error_message: "Webhook deactivated" })
        .eq("id", delivery.id);
      failed++;
      continue;
    }

    const body = JSON.stringify(delivery.payload);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (webhook.secret) {
      headers["X-Webhook-Secret"] = webhook.secret;
      headers["X-Webhook-Signature"] = crypto
        .createHmac("sha256", webhook.secret)
        .update(body)
        .digest("hex");
    }

    const nextAttempt = delivery.attempt_count + 1;

    try {
      const response = await fetch(webhook.url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });

      if (response.ok) {
        await getSupabase()
          .from("cascade_webhook_deliveries")
          .update({
            status: "delivered",
            attempt_count: nextAttempt,
            last_attempt_at: now,
            next_retry_at: null,
            response_status: response.status,
            response_body: await safeResponseText(response),
            error_message: null,
          })
          .eq("id", delivery.id);
        succeeded++;
      } else if (nextAttempt >= MAX_ATTEMPTS) {
        await getSupabase()
          .from("cascade_webhook_deliveries")
          .update({
            status: "failed",
            attempt_count: nextAttempt,
            last_attempt_at: now,
            next_retry_at: null,
            response_status: response.status,
            response_body: await safeResponseText(response),
          })
          .eq("id", delivery.id);
        failed++;
      } else {
        await getSupabase()
          .from("cascade_webhook_deliveries")
          .update({
            status: "retrying",
            attempt_count: nextAttempt,
            last_attempt_at: now,
            next_retry_at: getNextRetryTime(nextAttempt),
            response_status: response.status,
            response_body: await safeResponseText(response),
          })
          .eq("id", delivery.id);
      }
    } catch (err) {
      if (nextAttempt >= MAX_ATTEMPTS) {
        await getSupabase()
          .from("cascade_webhook_deliveries")
          .update({
            status: "failed",
            attempt_count: nextAttempt,
            last_attempt_at: now,
            next_retry_at: null,
            error_message: err instanceof Error ? err.message : "Unknown error",
          })
          .eq("id", delivery.id);
        failed++;
      } else {
        await getSupabase()
          .from("cascade_webhook_deliveries")
          .update({
            status: "retrying",
            attempt_count: nextAttempt,
            last_attempt_at: now,
            next_retry_at: getNextRetryTime(nextAttempt),
            error_message: err instanceof Error ? err.message : "Unknown error",
          })
          .eq("id", delivery.id);
      }
    }
  }

  return { processed: pending.length, succeeded, failed };
}
