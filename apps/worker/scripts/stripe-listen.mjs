#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { WEBHOOK_EVENTS } from "./stripe-setup.mjs";

export const DEFAULT_DEV_PORT = 8787;
const devVarsPath = new URL("../.dev.vars", import.meta.url);

/** Reads KEY=value lines from the gitignored apps/worker/.dev.vars. */
export function readDevVars(text) {
  const vars = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) vars[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return vars;
}

function loadDevVars() {
  try {
    return readDevVars(readFileSync(devVarsPath, "utf8"));
  } catch {
    return {};
  }
}

export function stripeListenArgs(secretKey, port = DEFAULT_DEV_PORT) {
  return [
    "listen",
    "--api-key", secretKey,
    "--events", WEBHOOK_EVENTS.join(","),
    "--forward-to", `http://localhost:${port}/api/stripe/webhook`,
  ];
}

/**
 * Returns the test-mode key to forward webhooks with, or why forwarding is skipped.
 * Live keys are never used, so local development cannot receive real customers' events.
 */
export function resolveListenKey(env = process.env, devVars = loadDevVars()) {
  const secretKey = env.STRIPE_SECRET_KEY || devVars.STRIPE_SECRET_KEY;
  if (!secretKey) return { skip: "STRIPE_SECRET_KEY is not set in mise.local.toml or apps/worker/.dev.vars." };
  if (!/^(sk|rk)_test_/.test(secretKey)) return { skip: "Webhook forwarding only runs with a Stripe test or sandbox key." };
  return { secretKey };
}

function stripeCliAvailable() {
  return spawnSync("stripe", ["version"], { stdio: "ignore" }).status === 0;
}

/** Warns when .dev.vars does not hold the signing secret that `stripe listen` uses for this key. */
function checkWebhookSecret(secretKey, devVars) {
  const result = spawnSync("stripe", ["listen", "--api-key", secretKey, "--print-secret"], { encoding: "utf8" });
  const secret = result.stdout?.match(/whsec_[A-Za-z0-9]+/)?.[0];
  if (!secret || devVars.STRIPE_WEBHOOK_SECRET === secret) return;
  console.warn(`[stripe] STRIPE_WEBHOOK_SECRET in apps/worker/.dev.vars does not match this Stripe CLI listener.
[stripe] Set it to the output of: stripe listen --api-key "$STRIPE_SECRET_KEY" --print-secret
[stripe] Then restart the Worker, or webhooks will fail with 400.`);
}

/** Starts `stripe listen` for local development, or explains why it was skipped. Returns the child process. */
export function startStripeListen({ port = DEFAULT_DEV_PORT, required = false } = {}) {
  const devVars = loadDevVars();
  const key = resolveListenKey(process.env, devVars);
  const skip = key.skip ?? (stripeCliAvailable() ? undefined : "The Stripe CLI is not installed (brew install stripe/stripe-cli/stripe).");
  if (skip) {
    if (required) {
      console.error(`[stripe] ${skip}`);
      process.exit(1);
    }
    console.log(`[stripe] Skipping webhook forwarding: ${skip}`);
    return undefined;
  }
  checkWebhookSecret(key.secretKey, devVars);
  return spawn("stripe", stripeListenArgs(key.secretKey, port), { stdio: "inherit" });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const child = startStripeListen({ required: true });
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child?.kill(signal));
  child?.once("exit", (code) => process.exit(code ?? 0));
}
