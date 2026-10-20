import { describe, expect, it } from "vitest";

import worker from "./index";
import {
  StripeClient,
  billingEventTarget,
  billingReturnUrl,
  encodeStripeForm,
  planForPrice,
  signStripePayload,
  subscriptionGrantsPremium,
  subscriptionPeriodEnd,
  subscriptionPeriodStart,
  verifyStripeSignature,
  type StripeSubscription,
} from "./stripe";

const secret = "whsec_test_secret";

describe("Stripe form encoding", () => {
  it("encodes nested objects and arrays with bracket notation", () => {
    const form = encodeStripeForm({
      mode: "subscription",
      line_items: [{ price: "price_123", quantity: 1 }],
      subscription_data: { metadata: { user_id: "user_1" } },
      lookup_keys: ["language_coach_premium_yearly"],
      skipped: undefined,
    });
    expect([...form.entries()]).toEqual([
      ["mode", "subscription"],
      ["line_items[0][price]", "price_123"],
      ["line_items[0][quantity]", "1"],
      ["subscription_data[metadata][user_id]", "user_1"],
      ["lookup_keys[0]", "language_coach_premium_yearly"],
    ]);
  });

  it("sends a pinned API version, form body, and idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const client = new StripeClient("sk_test_123", async (url, init) => {
      calls.push({ url, init });
      return Response.json({ id: "cus_123" });
    });
    await client.request("POST", "/customers", { metadata: { user_id: "user_1" } }, "key-1");
    await client.request("GET", "/prices", { lookup_keys: ["monthly"], active: true });

    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/customers");
    expect(headers.authorization).toBe("Bearer sk_test_123");
    expect(headers["stripe-version"]).toMatch(/^\d{4}-\d{2}-\d{2}\./);
    expect(headers["idempotency-key"]).toBe("key-1");
    expect(calls[0]!.init.body).toBe("metadata%5Buser_id%5D=user_1");
    expect(calls[1]!.url).toBe("https://api.stripe.com/v1/prices?lookup_keys%5B0%5D=monthly&active=true");
    expect(calls[1]!.init.body).toBeUndefined();
  });

  it("surfaces Stripe error messages", async () => {
    const client = new StripeClient("sk_test_123", async () => Response.json(
      { error: { message: "No such customer", code: "resource_missing" } },
      { status: 404 },
    ));
    await expect(client.request("GET", "/customers/cus_missing")).rejects.toMatchObject({
      message: "No such customer",
      status: 404,
      code: "resource_missing",
    });
  });
});

describe("Stripe webhook signatures", () => {
  it("accepts a valid v1 signature inside the tolerance window", async () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const signature = await signStripePayload(payload, 1_700_000_000, secret);
    await expect(verifyStripeSignature(payload, `t=1700000000,v1=${signature}`, secret, 1_700_000_100)).resolves.toBe(true);
  });

  it("rejects tampered payloads, stale timestamps, and missing headers", async () => {
    const payload = JSON.stringify({ id: "evt_1" });
    const signature = await signStripePayload(payload, 1_700_000_000, secret);
    await expect(verifyStripeSignature(`${payload} `, `t=1700000000,v1=${signature}`, secret, 1_700_000_000)).resolves.toBe(false);
    await expect(verifyStripeSignature(payload, `t=1700000000,v1=${signature}`, secret, 1_700_001_000)).resolves.toBe(false);
    await expect(verifyStripeSignature(payload, `t=1700000000,v1=${signature}`, "whsec_other", 1_700_000_000)).resolves.toBe(false);
    await expect(verifyStripeSignature(payload, null, secret)).resolves.toBe(false);
  });

  it("accepts any matching signature when Stripe rolls secrets", async () => {
    const payload = "{}";
    const signature = await signStripePayload(payload, 1_700_000_000, secret);
    await expect(verifyStripeSignature(payload, `t=1700000000,v1=deadbeef,v1=${signature}`, secret, 1_700_000_000)).resolves.toBe(true);
  });
});

describe("Stripe subscription mapping", () => {
  const subscription: StripeSubscription = {
    id: "sub_1",
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ price: { id: "price_1", lookup_key: null, recurring: { interval: "month", interval_count: 3 } }, current_period_start: 1_792_000_000, current_period_end: 1_800_000_000 }] },
  };

  it("maps prices to plans by lookup key, then by billing interval", () => {
    expect(planForPrice({ id: "p", lookup_key: "language_coach_premium_yearly", recurring: null })).toBe("yearly");
    expect(planForPrice({ id: "p", lookup_key: null, recurring: { interval: "month", interval_count: 1 } })).toBe("monthly");
    expect(planForPrice({ id: "p", lookup_key: null, recurring: { interval: "month", interval_count: 3 } })).toBe("quarterly");
    expect(planForPrice({ id: "p", lookup_key: null, recurring: { interval: "week", interval_count: 1 } })).toBeUndefined();
  });

  it("reads the billing period from subscription items", () => {
    expect(subscriptionPeriodStart(subscription)).toBe(new Date(1_792_000_000 * 1000).toISOString());
    expect(subscriptionPeriodEnd(subscription)).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(subscriptionPeriodEnd({ ...subscription, current_period_end: 1_700_000_000, items: { data: [] } }))
      .toBe(new Date(1_700_000_000 * 1000).toISOString());
  });

  it("grants Premium only for paying statuses within the current period", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    expect(subscriptionGrantsPremium({ status: "active", current_period_end: "2026-11-18T00:00:00Z" }, now)).toBe(true);
    expect(subscriptionGrantsPremium({ status: "active", current_period_end: "2026-10-16T00:00:00Z" }, now)).toBe(true);
    expect(subscriptionGrantsPremium({ status: "active", current_period_end: "2026-10-01T00:00:00Z" }, now)).toBe(false);
    expect(subscriptionGrantsPremium({ status: "canceled", current_period_end: "2026-11-18T00:00:00Z" }, now)).toBe(false);
    expect(subscriptionGrantsPremium({ status: "incomplete", current_period_end: null }, now)).toBe(false);
  });

  it("keeps Premium for a failed renewal only within the grace period after the paid period ended", () => {
    const now = Date.parse("2026-10-18T00:00:00Z");
    // The failed renewal already advanced the period, so its end is far away; only its start matters.
    const unpaid = { status: "past_due", current_period_end: "2026-11-16T00:00:00Z" };
    expect(subscriptionGrantsPremium({ ...unpaid, current_period_start: "2026-10-16T00:00:00Z" }, now)).toBe(true);
    expect(subscriptionGrantsPremium({ ...unpaid, current_period_start: "2026-10-14T00:00:00Z" }, now)).toBe(false);
    expect(subscriptionGrantsPremium({ ...unpaid, current_period_start: null }, now)).toBe(false);
  });

  it("finds the subscription referenced by checkout and subscription events", () => {
    expect(billingEventTarget({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", mode: "subscription", subscription: "sub_1", client_reference_id: "user_1" } },
    })).toEqual({ subscriptionId: "sub_1", userId: "user_1" });
    expect(billingEventTarget({
      id: "evt_2",
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", metadata: { user_id: "user_1" } } },
    })).toEqual({ subscriptionId: "sub_1", userId: "user_1" });
    expect(billingEventTarget({
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { id: "cs_2", mode: "payment", subscription: null } },
    })).toBeUndefined();
    expect(billingEventTarget({ id: "evt_4", type: "invoice.paid", data: { object: { id: "in_1" } } })).toBeUndefined();
  });
});

describe("billing return URLs", () => {
  const origin = "https://language-coach.example";

  it("allows dashboard pages on the Worker origin and local dashboards", () => {
    expect(billingReturnUrl(`${origin}/dashboard/settings#plans`, origin)?.toString()).toBe(`${origin}/dashboard/settings`);
    expect(billingReturnUrl("http://localhost:43127/dashboard/settings", origin)?.toString()).toBe("http://localhost:43127/dashboard/settings");
    expect(billingReturnUrl("http://127.0.0.1:43130/dashboard", origin)).toBeDefined();
  });

  it("rejects other origins, paths, and malformed values", () => {
    expect(billingReturnUrl("https://evil.example/dashboard/settings", origin)).toBeUndefined();
    expect(billingReturnUrl("https://localhost/dashboard/settings", origin)).toBeUndefined();
    expect(billingReturnUrl(`${origin}/sign-in`, origin)).toBeUndefined();
    expect(billingReturnUrl(`${origin}/dashboard-evil`, origin)).toBeUndefined();
    expect(billingReturnUrl("not a url", origin)).toBeUndefined();
    expect(billingReturnUrl(undefined, origin)).toBeUndefined();
  });
});

describe("Stripe webhook endpoint", () => {
  it("is unavailable until Stripe secrets are configured", async () => {
    const response = await worker.fetch(new Request("https://language-coach.example/api/stripe/webhook", { method: "POST", body: "{}" }), {} as never);
    expect(response.status).toBe(503);
  });

  it("rejects unsigned requests before reading any data", async () => {
    const response = await worker.fetch(new Request("https://language-coach.example/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify({ id: "evt_1", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } }),
      headers: { "stripe-signature": "t=1,v1=bad" },
    }), { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: secret } as never);
    expect(response.status).toBe(400);
  });

  it("acknowledges signed events that do not affect subscriptions", async () => {
    const payload = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: { id: "in_1" } } });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await signStripePayload(payload, timestamp, secret);
    const response = await worker.fetch(new Request("https://language-coach.example/api/stripe/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": `t=${timestamp},v1=${signature}` },
    }), { STRIPE_SECRET_KEY: "sk_test", STRIPE_WEBHOOK_SECRET: secret } as never);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
  });
});

describe("Premium sync opt-in", () => {
  async function config(env: Record<string, string>) {
    const response = await worker.fetch(new Request("https://language-coach.example/api/config"), env as never);
    return response.json() as Promise<{ premiumSyncRequired: boolean }>;
  }

  it("keeps sync free unless the deployment explicitly enables Premium", async () => {
    await expect(config({})).resolves.toMatchObject({ premiumSyncRequired: false });
    await expect(config({ PREMIUM_SYNC_REQUIRED: "false" })).resolves.toMatchObject({ premiumSyncRequired: false });
    await expect(config({ PREMIUM_SYNC_REQUIRED: "true" })).resolves.toMatchObject({ premiumSyncRequired: true });
  });
});
