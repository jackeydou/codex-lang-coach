import type { Client } from "pg";
import type { BillingStatus, PremiumPlan } from "@language-coach/core/types";
import { planForPrice, subscriptionGrantsPremium, subscriptionPeriodEnd, type StripeSubscription } from "./stripe";

type SubscriptionRow = {
  status: string;
  plan: PremiumPlan | null;
  current_period_end: Date | string | null;
  cancel_at_period_end: boolean;
};

async function readSubscriptions(client: Client, userId: string): Promise<SubscriptionRow[]> {
  const result = await client.query<SubscriptionRow>(`SELECT status, plan, current_period_end, cancel_at_period_end
    FROM public.billing_subscriptions
    WHERE user_id = $1
    ORDER BY current_period_end DESC NULLS LAST, updated_at DESC`, [userId]);
  return result.rows;
}

export async function readCustomerId(client: Client, userId: string): Promise<string | undefined> {
  const result = await client.query<{ stripe_customer_id: string }>(
    "SELECT stripe_customer_id FROM public.billing_customers WHERE user_id = $1",
    [userId],
  );
  return result.rows[0]?.stripe_customer_id;
}

/** Records the user's Stripe customer and returns whichever customer is stored after concurrent requests settle. */
export async function saveCustomerId(client: Client, userId: string, customerId: string): Promise<string> {
  await client.query(`INSERT INTO public.billing_customers (user_id, stripe_customer_id) VALUES ($1, $2)
    ON CONFLICT (user_id) DO NOTHING`, [userId, customerId]);
  return (await readCustomerId(client, userId)) ?? customerId;
}

export async function hasPremiumAccess(client: Client, userId: string): Promise<boolean> {
  return (await readSubscriptions(client, userId)).some((row) => subscriptionGrantsPremium(row));
}

export async function readBillingStatus(
  client: Client,
  userId: string,
  options: { required: boolean; checkoutAvailable: boolean },
): Promise<BillingStatus> {
  const [subscriptions, customerId] = await Promise.all([readSubscriptions(client, userId), readCustomerId(client, userId)]);
  const active = subscriptions.find((row) => subscriptionGrantsPremium(row));
  const current = active ?? subscriptions[0];
  return {
    premium: Boolean(active),
    required: options.required,
    checkoutAvailable: options.checkoutAvailable,
    plan: current?.plan ?? undefined,
    status: current?.status,
    currentPeriodEnd: current?.current_period_end ? new Date(current.current_period_end).toISOString() : undefined,
    cancelAtPeriodEnd: current?.cancel_at_period_end,
    hasBillingAccount: Boolean(customerId),
  };
}

export async function upsertSubscription(client: Client, userId: string, subscription: StripeSubscription): Promise<void> {
  const price = subscription.items.data[0]?.price;
  await client.query(`INSERT INTO public.billing_subscriptions (
      stripe_subscription_id, user_id, stripe_customer_id, status, plan, price_id,
      current_period_end, cancel_at_period_end, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status = excluded.status,
      plan = excluded.plan,
      price_id = excluded.price_id,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = excluded.updated_at`, [
    subscription.id,
    userId,
    subscription.customer,
    subscription.status,
    planForPrice(price) ?? null,
    price?.id ?? null,
    subscriptionPeriodEnd(subscription) ?? null,
    subscription.cancel_at_period_end || Boolean(subscription.cancel_at),
  ]);
}
