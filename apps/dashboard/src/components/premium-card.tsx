import { useState } from "react"
import { PREMIUM_PLANS, type BillingStatus, type PremiumPlan } from "@language-coach/core/types"
import { ArrowRightIcon, CheckIcon, CreditCardIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const PERIOD_LABELS: Record<PremiumPlan, string> = {
  monthly: "per month",
  quarterly: "every 3 months",
  yearly: "per year",
}

const MONTHLY_PRICE = PREMIUM_PLANS.find((plan) => plan.id === "monthly")!.unitAmount

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function planSummary(plan: (typeof PREMIUM_PLANS)[number]) {
  const months = plan.interval === "year" ? plan.intervalCount * 12 : plan.intervalCount
  const perMonth = plan.unitAmount / months
  const savings = Math.round((1 - perMonth / MONTHLY_PRICE) * 100)
  return {
    price: formatPrice(plan.unitAmount),
    period: PERIOD_LABELS[plan.id],
    perMonth: months > 1 ? `${formatPrice(Math.round(perMonth))}/month` : undefined,
    savings: savings > 0 ? `Save ${savings}%` : undefined,
  }
}

function premiumStatusText(billing: BillingStatus): string {
  const plan = PREMIUM_PLANS.find((candidate) => candidate.id === billing.plan)
  const date = billing.currentPeriodEnd ? new Date(billing.currentPeriodEnd).toLocaleDateString() : undefined
  const planText = plan ? `${plan.label} plan` : "Premium plan"
  if (billing.status === "past_due") return `${planText}. Your last payment did not go through. Update your payment method to keep sync running.`
  if (billing.cancelAtPeriodEnd) return date ? `${planText}. Sync stays on until ${date}, then it will stop.` : `${planText}. It will not renew.`
  return date ? `${planText}. Renews on ${date}.` : `${planText}.`
}

export function PremiumCard({ billing, signedIn, notice, error, pendingAction, onSubscribe, onManage }: {
  billing?: BillingStatus
  signedIn: boolean
  notice?: string
  error?: string
  pendingAction?: PremiumPlan | "portal"
  onSubscribe: (plan: PremiumPlan) => Promise<void>
  onManage: () => Promise<void>
}) {
  const [selectedPlan, setSelectedPlan] = useState<PremiumPlan>("yearly")
  if (billing && !billing.required && !billing.premium && !billing.hasBillingAccount) return null

  const busy = Boolean(pendingAction)
  const checkoutBlocked = signedIn && billing !== undefined && !billing.checkoutAvailable

  return (
    <Card id="premium" className="settings-editorial-card premium-card">
      <CardHeader>
        <CardTitle className="premium-card-title">
          Language Coach Premium
          {billing?.premium && <Badge variant="secondary">Active</Badge>}
        </CardTitle>
        <CardDescription>
          Premium unlocks remote sync. Upload notes from each computer to your private account and review them all on the web.
        </CardDescription>
      </CardHeader>
      <CardContent className="sync-card-content">
        {notice && <p className="premium-notice" role="status">{notice}</p>}

        {billing?.premium ? (
          <div className="sync-current-status" data-enabled={billing.status !== "past_due"}>
            <span className="sync-status-dot" aria-hidden="true" />
            <div>
              <strong>Premium is active</strong>
              <p>{premiumStatusText(billing)}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="premium-plan-options" role="radiogroup" aria-label="Premium plan">
              {PREMIUM_PLANS.map((plan) => {
                const summary = planSummary(plan)
                const selected = selectedPlan === plan.id
                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    data-active={selected}
                    disabled={busy}
                    onClick={() => setSelectedPlan(plan.id)}
                  >
                    <span className="premium-plan-heading">
                      <strong>{plan.label}</strong>
                      {summary.savings && <span className="premium-plan-savings">{summary.savings}</span>}
                    </span>
                    <span className="premium-plan-price">{summary.price}</span>
                    <span className="premium-plan-period">{summary.period}{summary.perMonth && <> · {summary.perMonth}</>}</span>
                    <span className="sync-option-check" aria-hidden="true"><CheckIcon /></span>
                  </button>
                )
              })}
            </div>
            <ul className="premium-benefits">
              <li><CheckIcon /> Upload notes from every computer you use</li>
              <li><CheckIcon /> See all your lessons in the web dashboard</li>
              <li><CheckIcon /> Cancel anytime. Your local notes always stay free</li>
            </ul>
          </>
        )}

        {error && <p className="sync-error" role="alert">{error}</p>}

        <div className="premium-actions">
          {!billing?.premium && (
            <Button disabled={busy || checkoutBlocked} onClick={() => void onSubscribe(selectedPlan)}>
              {pendingAction && pendingAction !== "portal"
                ? "Opening secure checkout…"
                : signedIn ? "Continue to checkout" : "Sign in to subscribe"}
              {!pendingAction && <ArrowRightIcon />}
            </Button>
          )}
          {signedIn && billing?.hasBillingAccount && (
            <Button variant="outline" disabled={busy} onClick={() => void onManage()}>
              <CreditCardIcon /> {pendingAction === "portal" ? "Opening billing…" : "Manage billing"}
            </Button>
          )}
          <span className="premium-secure-note">
            {checkoutBlocked ? "Checkout is not available right now. Please try again later." : "Payments are processed securely by Stripe."}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
