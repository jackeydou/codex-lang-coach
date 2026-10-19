import { describe, expect, it } from "vitest";

import { PREMIUM_PLANS } from "@language-coach/core/types";
import { STRIPE_API_VERSION as WORKER_API_VERSION } from "../src/stripe";
import { PLANS, STRIPE_API_VERSION, WEBHOOK_EVENTS } from "./stripe-setup.mjs";

describe("Stripe setup script", () => {
  it("creates the same plans the Worker sells", () => {
    expect(PLANS).toEqual(PREMIUM_PLANS);
  });

  it("uses the Worker's pinned Stripe API version", () => {
    expect(STRIPE_API_VERSION).toBe(WORKER_API_VERSION);
  });

  it("subscribes to every event the Worker uses to track subscriptions", () => {
    expect(WEBHOOK_EVENTS).toEqual(expect.arrayContaining([
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]));
  });
});
