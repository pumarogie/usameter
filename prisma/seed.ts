import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding subscription plans...");

  // Delete existing plans to avoid duplicates
  await prisma.subscriptionPlan.deleteMany();

  // Create subscription plans with Stripe Price IDs
  const plans = await prisma.subscriptionPlan.createMany({
    data: [
      {
        name: "Starter",
        description: "Perfect for small projects and testing",
        stripePriceId: "price_1Sj4uLLBP2A6hMJSgfeNoagf",
        basePrice: 2900, // $29.00 in cents
        includedEvents: 100000,
        overageRate: 50, // $0.50 per 1000 events in cents
        features: {
          analytics: "basic",
          support: "email",
          apiAccess: true,
          teamMembers: 1,
          customEventTypes: false,
          webhookIntegrations: false,
        },
        isActive: true,
      },
      {
        name: "Growth",
        description: "For growing businesses with higher volume",
        stripePriceId: "price_1Sj4uiLBP2A6hMJSxbe7CJaA",
        basePrice: 9900, // $99.00 in cents
        includedEvents: 500000,
        overageRate: 30, // $0.30 per 1000 events in cents
        features: {
          analytics: "advanced",
          support: "priority",
          apiAccess: true,
          teamMembers: 5,
          customEventTypes: true,
          webhookIntegrations: true,
        },
        isActive: true,
      },
      {
        name: "Enterprise",
        description: "Custom solutions for large organizations",
        stripePriceId: "price_1Sj4vSLBP2A6hMJSEBccg00E",
        basePrice: 49900, // $499.00 in cents
        includedEvents: 5000000,
        overageRate: 10, // $0.10 per 1000 events in cents
        features: {
          analytics: "enterprise",
          support: "dedicated",
          apiAccess: true,
          teamMembers: -1, // unlimited
          customEventTypes: true,
          webhookIntegrations: true,
          slaGuarantee: true,
          customContracts: true,
        },
        isActive: true,
      },
    ],
  });

  console.log(`Created ${plans.count} subscription plans`);

  // List the created plans
  const allPlans = await prisma.subscriptionPlan.findMany();
  console.log("\nCreated plans:");
  allPlans.forEach((plan) => {
    console.log(
      `  - ${plan.name}: ${plan.stripePriceId} ($${plan.basePrice / 100}/mo)`,
    );
  });

  console.log("\nSeeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
