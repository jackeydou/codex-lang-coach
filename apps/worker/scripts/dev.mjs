#!/usr/bin/env node

// Runs the Worker with `wrangler dev` and, when a Stripe test key is configured,
// forwards Stripe webhooks to it with `stripe listen`. Both stop together.
import { spawn } from "node:child_process";
import process from "node:process";
import { DEFAULT_DEV_PORT, startStripeListen } from "./stripe-listen.mjs";

const port = Number(process.env.WORKER_DEV_PORT) || DEFAULT_DEV_PORT;
const wrangler = spawn("wrangler", ["dev", "--port", String(port), ...process.argv.slice(2)], { stdio: "inherit" });
const stripe = startStripeListen({ port });

stripe?.once("exit", (code) => {
  if (!wrangler.killed && wrangler.exitCode === null && code) {
    console.warn(`[stripe] Webhook forwarding stopped (exit ${code}). The Worker keeps running without it.`);
  }
});
wrangler.once("exit", (code, signal) => {
  stripe?.kill("SIGTERM");
  process.exit(code ?? (signal ? 1 : 0));
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stripe?.kill(signal);
    wrangler.kill(signal);
  });
}
