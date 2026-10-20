import { PREMIUM_PLANS, type PremiumPlan } from "@language-coach/core/types";

export const STRIPE_API_VERSION = "2025-09-30.clover";
const STRIPE_API_URL = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;
const PREMIUM_STATUSES = new Set(["active", "trialing", "past_due"]);
// Renewals move the period end forward through webhooks; this covers delayed delivery. It is also how long
// a past_due subscription keeps Premium after the last paid period ended while Stripe retries the payment.
const PERIOD_END_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

export type StripeParams = {
  [key: string]: string | number | boolean | undefined | StripeParams | Array<string | StripeParams>;
};

export interface StripePrice {
  id: string;
  lookup_key: string | null;
  recurring: { interval: string; interval_count: number } | null;
  active?: boolean;
  currency?: string;
  unit_amount?: number | null;
}

export const PREMIUM_CURRENCY = "usd";

export interface StripeSubscription {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  cancel_at: number | null;
  current_period_start?: number;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items: { data: Array<{ price: StripePrice; current_period_start?: number; current_period_end?: number }> };
}

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> & { id?: string } };
}

export class StripeError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = "StripeError";
  }
}

export function encodeStripeForm(params: StripeParams, prefix = "", form = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object") encodeStripeForm(item, `${name}[${index}]`, form);
        else form.append(`${name}[${index}]`, item);
      });
    } else if (typeof value === "object") {
      encodeStripeForm(value, name, form);
    } else {
      form.append(name, String(value));
    }
  }
  return form;
}

export class StripeClient {
  constructor(
    private readonly secretKey: string,
    private readonly fetcher: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init),
  ) {}

  async request<T>(method: "GET" | "POST", path: string, params: StripeParams = {}, idempotencyKey?: string): Promise<T> {
    const form = encodeStripeForm(params).toString();
    const response = await this.fetcher(method === "GET" && form ? `${STRIPE_API_URL}${path}?${form}` : `${STRIPE_API_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: method === "POST" ? form : undefined,
    });
    const body = await response.json().catch(() => ({})) as { error?: { message?: string; code?: string } };
    if (!response.ok) {
      throw new StripeError(body.error?.message || `Stripe request failed with status ${response.status}.`, response.status, body.error?.code);
    }
    return body as T;
  }
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function signStripePayload(payload: string, timestamp: number, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`)));
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!header) return false;
  let timestamp = Number.NaN;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t") timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (!Number.isFinite(timestamp) || !signatures.length) return false;
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = await signStripePayload(payload, timestamp, secret);
  return signatures.some((signature) => timingSafeEqual(signature, expected));
}

export function planForPrice(price: StripePrice | undefined): PremiumPlan | undefined {
  if (!price) return undefined;
  const byLookupKey = PREMIUM_PLANS.find((plan) => plan.lookupKey === price.lookup_key);
  if (byLookupKey) return byLookupKey.id;
  return PREMIUM_PLANS.find((plan) => plan.interval === price.recurring?.interval
    && plan.intervalCount === price.recurring?.interval_count)?.id;
}

/**
 * Whether a Stripe price charges exactly what the dashboard and Terms show for a plan. A lookup key can be
 * transferred to another price in Stripe, so checkout verifies the price instead of trusting the key.
 */
export function priceMatchesPlan(price: StripePrice, plan: (typeof PREMIUM_PLANS)[number]): boolean {
  return price.active !== false
    && price.currency === PREMIUM_CURRENCY
    && price.unit_amount === plan.unitAmount
    && price.recurring?.interval === plan.interval
    && price.recurring?.interval_count === plan.intervalCount;
}

function subscriptionPeriodBoundary(
  subscription: StripeSubscription,
  field: "current_period_start" | "current_period_end",
): string | undefined {
  // Since API version 2025-03-31.basil, billing periods live on subscription items.
  const itemValues = subscription.items.data.map((item) => item[field]).filter((value): value is number => typeof value === "number");
  const seconds = itemValues.length ? Math.max(...itemValues) : subscription[field];
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : undefined;
}

export function subscriptionPeriodStart(subscription: StripeSubscription): string | undefined {
  return subscriptionPeriodBoundary(subscription, "current_period_start");
}

export function subscriptionPeriodEnd(subscription: StripeSubscription): string | undefined {
  return subscriptionPeriodBoundary(subscription, "current_period_end");
}

export function subscriptionGrantsPremium(
  subscription: { status: string; current_period_start?: Date | string | null; current_period_end: Date | string | null },
  now = Date.now(),
): boolean {
  if (!PREMIUM_STATUSES.has(subscription.status)) return false;
  if (subscription.status === "past_due") {
    // A failed renewal still advances the period, so the unpaid period's start is when the paid one ended.
    if (!subscription.current_period_start) return false;
    return new Date(subscription.current_period_start).getTime() + PERIOD_END_GRACE_MS > now;
  }
  if (!subscription.current_period_end) return true;
  return new Date(subscription.current_period_end).getTime() + PERIOD_END_GRACE_MS > now;
}

/** The subscription a webhook event refers to, and the user ID we attached at checkout. */
export function billingEventTarget(event: StripeEvent): { subscriptionId: string; userId?: string } | undefined {
  const object = event.data.object;
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    if (object.mode !== "subscription" || typeof object.subscription !== "string") return undefined;
    return {
      subscriptionId: object.subscription,
      userId: typeof object.client_reference_id === "string" ? object.client_reference_id : undefined,
    };
  }
  if (event.type.startsWith("customer.subscription.") && typeof object.id === "string") {
    const metadata = object.metadata as Record<string, string> | undefined;
    return { subscriptionId: object.id, userId: metadata?.user_id };
  }
  return undefined;
}

/** Accepts dashboard URLs on this Worker or on a local dashboard, so Checkout cannot become an open redirect. */
export function billingReturnUrl(candidate: unknown, workerOrigin: string): URL | undefined {
  if (typeof candidate !== "string") return undefined;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return undefined;
  }
  const localDashboard = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  if (url.origin !== workerOrigin && !localDashboard) return undefined;
  if (url.pathname !== "/dashboard" && !url.pathname.startsWith("/dashboard/")) return undefined;
  url.hash = "";
  return url;
}
