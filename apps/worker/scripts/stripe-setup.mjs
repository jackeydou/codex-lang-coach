#!/usr/bin/env node

import process from "node:process";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

// Keep in sync with PREMIUM_PLANS in packages/core/src/types.ts (enforced by stripe-setup.test.ts).
export const STRIPE_API_VERSION = "2025-09-30.clover";
export const PRODUCT_ID = "language_coach_premium";
// "Software as a service (SaaS) - personal use". Stripe Managed Payments requires an eligible tax code,
// and Stripe Tax uses it to pick the tax rate.
export const PRODUCT_TAX_CODE = "txcd_10103000";
export const PLANS = [
  { id: "monthly", label: "Monthly", unitAmount: 299, interval: "month", intervalCount: 1, lookupKey: "language_coach_premium_monthly" },
  { id: "quarterly", label: "Quarterly", unitAmount: 799, interval: "month", intervalCount: 3, lookupKey: "language_coach_premium_quarterly" },
  { id: "yearly", label: "Yearly", unitAmount: 2999, interval: "year", intervalCount: 1, lookupKey: "language_coach_premium_yearly" },
];
export const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
];
const DEFAULT_WEBHOOK_URL = "https://language-coach.pluginsfoundry.dev/api/stripe/webhook";

function fatal(message) {
  console.error(`Stripe setup failed: ${message}`);
  process.exit(1);
}

function form(params, prefix = "", output = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) value.forEach((item, index) => output.append(`${name}[${index}]`, String(item)));
    else if (typeof value === "object") form(value, name, output);
    else output.append(name, String(value));
  }
  return output;
}

function createStripe(secretKey) {
  return async function stripe(method, path, params = {}) {
    const body = form(params).toString();
    const response = await fetch(`https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`, {
      method,
      headers: {
        authorization: `Bearer ${secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: method === "POST" ? body : undefined,
    });
    const value = await response.json();
    if (!response.ok) {
      const error = new Error(value.error?.message || `Stripe request failed with status ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return value;
  };
}

function priceMatches(price, plan) {
  return price.active && price.currency === "usd" && price.unit_amount === plan.unitAmount
    && price.recurring?.interval === plan.interval && price.recurring?.interval_count === plan.intervalCount
    && price.product === PRODUCT_ID;
}

async function ensureProduct(stripe) {
  try {
    const product = await stripe("GET", `/products/${PRODUCT_ID}`);
    if (!product.active || product.tax_code !== PRODUCT_TAX_CODE) {
      await stripe("POST", `/products/${PRODUCT_ID}`, { active: true, tax_code: PRODUCT_TAX_CODE });
    }
    console.log(`✓ Product ${PRODUCT_ID} exists (tax code ${PRODUCT_TAX_CODE})`);
  } catch (error) {
    if (error.status !== 404) throw error;
    await stripe("POST", "/products", {
      id: PRODUCT_ID,
      name: "Language Coach Premium",
      description: "Private remote sync for Language Coach learning notes across devices and the web dashboard.",
      tax_code: PRODUCT_TAX_CODE,
    });
    console.log(`✓ Created product ${PRODUCT_ID}`);
  }
}

async function ensurePrice(stripe, plan) {
  const existing = (await stripe("GET", "/prices", { lookup_keys: [plan.lookupKey], limit: 1 })).data[0];
  if (existing && priceMatches(existing, plan)) {
    console.log(`✓ ${plan.label} price ${existing.id} ($${(plan.unitAmount / 100).toFixed(2)})`);
    return existing;
  }
  // Prices are immutable, so a changed amount gets a new price that takes over the lookup key.
  const price = await stripe("POST", "/prices", {
    product: PRODUCT_ID,
    currency: "usd",
    unit_amount: plan.unitAmount,
    recurring: { interval: plan.interval, interval_count: plan.intervalCount },
    lookup_key: plan.lookupKey,
    transfer_lookup_key: existing ? true : undefined,
    nickname: `Language Coach Premium ${plan.label}`,
    metadata: { plan: plan.id },
  });
  if (existing) await stripe("POST", `/prices/${existing.id}`, { active: false });
  console.log(`✓ Created ${plan.label} price ${price.id} ($${(plan.unitAmount / 100).toFixed(2)})`);
  return price;
}

async function ensureWebhook(stripe, url) {
  const endpoints = await stripe("GET", "/webhook_endpoints", { limit: 100 });
  const existing = endpoints.data.find((endpoint) => endpoint.url === url);
  if (existing) {
    await stripe("POST", `/webhook_endpoints/${existing.id}`, { enabled_events: WEBHOOK_EVENTS, disabled: false });
    console.log(`✓ Webhook ${existing.id} already exists for ${url} (events refreshed)`);
    console.log("  Stripe shows its signing secret only once. Reveal it in the Stripe Dashboard if you need it again.");
    return undefined;
  }
  const endpoint = await stripe("POST", "/webhook_endpoints", {
    url,
    enabled_events: WEBHOOK_EVENTS,
    api_version: STRIPE_API_VERSION,
    description: "Language Coach Premium subscriptions",
  });
  console.log(`✓ Created webhook ${endpoint.id} for ${url}`);
  return endpoint.secret;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(`Usage: pnpm --filter @language-coach/worker run stripe:setup -- [--webhook-url URL | --skip-webhook] [--yes]

Creates or updates the Language Coach Premium product, its monthly, quarterly,
and yearly prices, and the subscription webhook endpoint in Stripe.

Environment:
  STRIPE_SECRET_KEY  Stripe secret key (sk_test_... or sk_live_...)

Options:
  --webhook-url URL  Webhook endpoint (default: ${DEFAULT_WEBHOOK_URL})
  --skip-webhook     Only create the product and prices (local testing with \`stripe listen\`)
  --yes              Skip the confirmation required for live-mode keys`);
    return;
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) fatal("STRIPE_SECRET_KEY is required. Set it in mise.local.toml.");
  if (!/^(sk|rk)_(test|live)_/.test(secretKey)) fatal("STRIPE_SECRET_KEY must be a Stripe secret or restricted key.");
  const live = secretKey.includes("_live_");
  const urlFlag = process.argv.indexOf("--webhook-url");
  const skipWebhook = process.argv.includes("--skip-webhook");
  const webhookUrl = urlFlag >= 0 ? process.argv[urlFlag + 1] : DEFAULT_WEBHOOK_URL;
  if (!skipWebhook && !webhookUrl?.startsWith("https://")) fatal("--webhook-url must be an https URL.");

  console.log(`Stripe mode: ${live ? "LIVE" : "test"}\nWebhook URL: ${skipWebhook ? "(skipped)" : webhookUrl}\n`);
  if (live && !process.argv.includes("--yes")) {
    if (!process.stdin.isTTY) fatal("Live-mode setup needs interactive confirmation or --yes.");
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await prompt.question("Type SETUP to configure live-mode Stripe billing: ");
    prompt.close();
    if (answer !== "SETUP") {
      console.log("Stripe setup cancelled.");
      return;
    }
  }

  const stripe = createStripe(secretKey);
  await ensureProduct(stripe);
  for (const plan of PLANS) await ensurePrice(stripe, plan);
  if (skipWebhook) {
    console.log(`
Skipped the webhook endpoint. For local testing, \`mise run worker:dev\` forwards events to the
Worker with the Stripe CLI. Put the signing secret from
  stripe listen --api-key "$STRIPE_SECRET_KEY" --print-secret
into apps/worker/.dev.vars as STRIPE_WEBHOOK_SECRET.`);
    return;
  }
  const webhookSecret = await ensureWebhook(stripe, webhookUrl);

  console.log(`
Next steps:
  1. Store the Worker secrets:
       pnpm --filter @language-coach/worker exec wrangler secret put STRIPE_SECRET_KEY${webhookSecret ? `
       pnpm --filter @language-coach/worker exec wrangler secret put STRIPE_WEBHOOK_SECRET
          (value: ${webhookSecret})` : `
       pnpm --filter @language-coach/worker exec wrangler secret put STRIPE_WEBHOOK_SECRET`}
  2. In the Stripe Dashboard, open Settings → Billing → Customer portal, allow
     cancellations and plan switching between the three Language Coach prices,
     and save the configuration.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => fatal(error instanceof Error ? error.message : String(error)));
}
