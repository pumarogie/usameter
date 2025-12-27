/**
 * Script to manually sync a Stripe subscription to the local database.
 * Run with: npx tsx scripts/sync-stripe-subscription.ts
 */

import Stripe from "stripe";
import { PrismaClient } from "@prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const prisma = new PrismaClient();

async function syncSubscriptions() {
  console.log("Fetching subscriptions from Stripe...");

  // Get all active subscriptions with expanded data
  const subscriptions = await stripe.subscriptions.list({
    status: "active",
    limit: 100,
    expand: ["data.items.data.price"],
  });

  console.log(`Found ${subscriptions.data.length} active subscription(s)`);

  for (const sub of subscriptions.data) {
    const organizationId = sub.metadata?.organizationId;
    const priceId = sub.items.data[0]?.price.id;

    console.log(`\nProcessing subscription ${sub.id}:`);
    console.log(`  organizationId: ${organizationId}`);
    console.log(`  priceId: ${priceId}`);
    console.log(`  status: ${sub.status}`);

    if (!organizationId) {
      console.log(`  ⚠ Skipping - no organizationId in metadata`);
      continue;
    }

    // Find the plan by price ID
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { stripePriceId: priceId },
    });

    if (!plan) {
      console.log(`  ⚠ Skipping - no plan found for price ${priceId}`);
      continue;
    }

    // Get period dates from the subscription item or use defaults
    const item = sub.items.data[0];
    const now = new Date();

    // Use created timestamp as fallback for period start
    const periodStartTimestamp = (sub as any).current_period_start || sub.created;
    const periodEndTimestamp = (sub as any).current_period_end;

    const currentPeriodStart = periodStartTimestamp
      ? new Date(periodStartTimestamp * 1000)
      : now;

    const currentPeriodEnd = periodEndTimestamp
      ? new Date(periodEndTimestamp * 1000)
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // Default to 30 days from now

    console.log(`  Period: ${currentPeriodStart.toISOString()} - ${currentPeriodEnd.toISOString()}`);

    // Upsert the subscription
    const result = await prisma.subscription.upsert({
      where: { stripeSubscriptionId: sub.id },
      create: {
        organizationId,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      },
      update: {
        stripePriceId: priceId,
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
        trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      },
    });

    console.log(`✓ Synced subscription ${sub.id} for org ${organizationId}`);
    console.log(`  Plan: ${plan.name}, Status: ACTIVE`);
    console.log(`  Period: ${currentPeriodStart.toISOString()} - ${currentPeriodEnd.toISOString()}`);
  }

  console.log("\nDone!");
}

syncSubscriptions()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
