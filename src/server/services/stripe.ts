import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function createStripeCustomer(params: {
  email: string;
  name: string;
  organizationId: string;
}) {
  return stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      organizationId: params.organizationId,
    },
  });
}

export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  organizationId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripe.checkout.sessions.create({
    customer: params.customerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      organizationId: params.organizationId,
    },
    subscription_data: {
      metadata: {
        organizationId: params.organizationId,
      },
    },
  });
}

export async function createBillingPortalSession(params: {
  customerId: string;
  returnUrl: string;
}) {
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
}

export async function getSubscription(subscriptionId: string) {
  return stripe.subscriptions.retrieve(subscriptionId);
}

export async function cancelSubscription(subscriptionId: string) {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

export async function resumeSubscription(subscriptionId: string) {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

export async function reportUsage(params: {
  subscriptionItemId: string;
  quantity: number;
  timestamp?: number;
}) {
  return stripe.billing.meterEvents.create({
    event_name: "usage",
    payload: {
      stripe_customer_id: params.subscriptionItemId,
      value: String(params.quantity),
    },
    timestamp: params.timestamp ?? Math.floor(Date.now() / 1000),
  });
}

export async function getInvoices(customerId: string, limit = 10) {
  return stripe.invoices.list({
    customer: customerId,
    limit,
  });
}

export async function getUpcomingInvoice(customerId: string) {
  try {
    return await stripe.invoices.createPreview({
      customer: customerId,
    });
  } catch {
    return null;
  }
}

export function constructWebhookEvent(
  payload: string | Buffer,
  signature: string,
  webhookSecret: string
) {
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}
