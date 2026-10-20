import { describe, expect, it } from "vitest";

import { readDevVars, resolveListenKey, stripeListenArgs } from "./stripe-listen.mjs";
import { WEBHOOK_EVENTS } from "./stripe-setup.mjs";

describe("Stripe webhook forwarding for local development", () => {
  it("forwards every subscription event the Worker handles to the local webhook", () => {
    const args = stripeListenArgs("sk_test_123", 8790);
    expect(args.slice(0, 3)).toEqual(["listen", "--api-key", "sk_test_123"]);
    expect(args[args.indexOf("--events") + 1].split(",")).toEqual(WEBHOOK_EVENTS);
    expect(args[args.indexOf("--forward-to") + 1]).toBe("http://localhost:8790/api/stripe/webhook");
  });

  it("only forwards with a test key, preferring the mise environment over .dev.vars", () => {
    expect(resolveListenKey({ STRIPE_SECRET_KEY: "sk_test_env" }, { STRIPE_SECRET_KEY: "sk_test_file" })).toEqual({ secretKey: "sk_test_env" });
    expect(resolveListenKey({}, { STRIPE_SECRET_KEY: "rk_test_file" })).toEqual({ secretKey: "rk_test_file" });
    expect(resolveListenKey({ STRIPE_SECRET_KEY: "sk_live_env" }, {}).skip).toMatch(/test or sandbox/);
    expect(resolveListenKey({}, {}).skip).toMatch(/not set/);
  });

  it("reads KEY=value lines from .dev.vars", () => {
    expect(readDevVars("# comment\nSTRIPE_SECRET_KEY=sk_test_1\n STRIPE_WEBHOOK_SECRET = \"whsec_2\" \n")).toEqual({
      STRIPE_SECRET_KEY: "sk_test_1",
      STRIPE_WEBHOOK_SECRET: "whsec_2",
    });
  });
});
