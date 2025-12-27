# Usameter

A billing-grade usage metering platform for SaaS companies. Track API calls, enforce quotas, and generate invoices with the precision required for financial compliance.

## Overview

Usameter solves the critical challenge of usage-based billing: accurately measuring, pricing, and enforcing consumption across multi-tenant applications. Built for companies that need to charge customers based on actual usage rather than flat subscriptions.

### Core Capabilities

- **Event Ingestion** — High-throughput REST API accepting single events or batches of 1,000+
- **Idempotency** — Guaranteed exactly-once event processing with deduplication
- **Quota Enforcement** — Real-time limits with soft warnings and hard blocks
- **Tiered Pricing** — Volume-based pricing with automatic tier calculation
- **Invoice Generation** — Detailed invoices with full audit trail to source events
- **Rate Limiting** — Configurable per-second, per-minute, and per-hour limits

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Event Ingestion                          │
│                                                                  │
│  POST /api/v1/events                                             │
│  ├─ API Key Validation (SHA256)                                  │
│  ├─ Rate Limit Check (Redis sliding window)                      │
│  ├─ Idempotency Check (Redis + PostgreSQL)                       │
│  ├─ Quota Enforcement (soft/hard limits)                         │
│  └─ Event Persistence (PostgreSQL)                               │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                         Data Layer                               │
│                                                                  │
│  PostgreSQL                 Redis                   Stripe       │
│  ├─ UsageEvent             ├─ Rolling counters     ├─ Customers  │
│  ├─ UsageSnapshot          ├─ Rate limits          ├─ Subscriptions│
│  ├─ Invoice                ├─ Quota tracking       └─ Webhooks   │
│  ├─ Tenant                 └─ Idempotency cache                  │
│  └─ QuotaLimit                                                   │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      Billing Pipeline                            │
│                                                                  │
│  Daily Snapshots → Tiered Pricing → Invoice Generation           │
│  (Vercel Cron)     (per event type)  (with audit trail)          │
└──────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| Framework | Next.js 16 (App Router) |
| Database | PostgreSQL with Prisma ORM |
| Cache | Redis (ioredis) |
| Authentication | Clerk |
| Payments | Stripe |
| API Layer | tRPC + REST |
| Validation | Zod |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+
- Clerk account
- Stripe account

### Installation

```bash
git clone https://github.com/your-org/usameter.git
cd usameter

pnpm install

cp env.example .env
# Configure environment variables

npx prisma db push

pnpm dev
```

### Environment Configuration

```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/usameter"

# Redis
REDIS_URL="redis://localhost:6379"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."
CLERK_SECRET_KEY="sk_test_..."

# Stripe
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Cron Jobs
CRON_SECRET="<random-secret>"
```

## API Reference

### Authentication

All requests require an API key:

```
Authorization: Bearer usa_<api_key>
```

### POST /api/v1/events

Record usage events.

**Single Event:**
```json
{
  "event_type": "api_request",
  "tenant_id": "tenant_abc123",
  "quantity": 1,
  "idempotency_key": "req_unique_id",
  "metadata": {
    "endpoint": "/users",
    "method": "GET"
  }
}
```

**Batch (up to 1,000 events):**
```json
{
  "events": [
    {
      "event_type": "api_request",
      "tenant_id": "tenant_abc123",
      "quantity": 1,
      "idempotency_key": "req_001"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "event_id": "evt_xyz789",
  "deduplicated": false
}
```

### GET /api/v1/events

Query recorded events.

**Parameters:**
- `tenant_id` — Filter by tenant
- `event_type` — Filter by event type
- `start_date` — ISO 8601 datetime
- `end_date` — ISO 8601 datetime
- `limit` — Max 1000, default 100

### Error Responses

**Quota Exceeded (403):**
```json
{
  "error": "Quota exceeded",
  "code": "QUOTA_EXCEEDED",
  "details": {
    "limit": 10000,
    "current": 10000,
    "reset_at": "2024-02-01T00:00:00Z"
  }
}
```

**Rate Limited (429):**
```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMIT_EXCEEDED",
  "details": {
    "limit": 100,
    "remaining": 0,
    "resetAt": "2024-01-15T10:30:00Z",
    "retryAfter": 30
  }
}
```

## Data Model

### UsageEvent

```prisma
model UsageEvent {
  id              String    @id
  tenantId        String
  organizationId  String
  eventType       String
  quantity        Decimal   @db.Decimal(20, 6)
  metadata        Json?
  timestamp       DateTime
  idempotencyKey  String?
  invoiceId       String?   // Audit trail
  billedAt        DateTime?

  @@unique([organizationId, idempotencyKey])
  @@index([tenantId, eventType, timestamp])
}
```

### QuotaLimit

```prisma
model QuotaLimit {
  id               String
  tenantId         String
  eventType        String
  limitValue       Decimal
  enforcementMode  QuotaEnforcementMode  // HARD, SOFT, DISABLED
  softLimitPercent Int?
  gracePeriodHours Int?
  resetAt          DateTime
}
```

## Deployment

### Vercel

The project includes Vercel configuration with automated cron jobs:

```json
{
  "crons": [
    {
      "path": "/api/cron/snapshots",
      "schedule": "0 1 * * *"
    }
  ]
}
```

### Self-Hosted

```bash
pnpm build
pnpm start
```

Configure your scheduler to call `/api/cron/snapshots` daily:
```
Authorization: Bearer <CRON_SECRET>
```

## Pricing Configuration

### Subscription Plans

| Plan | Monthly | Included Events | Overage |
|------|---------|-----------------|---------|
| Starter | $29 | 100,000 | $0.50/1K |
| Growth | $99 | 500,000 | $0.30/1K |
| Enterprise | $499 | 5,000,000 | $0.10/1K |

### Tiered Pricing

Configure per event type:
```
Tier 1: 0-1,000 units @ $0.10/unit
Tier 2: 1,001-10,000 units @ $0.08/unit
Tier 3: 10,001+ units @ $0.05/unit
```

---

## How This Project Stands Out

### 1. Billing-Grade Correctness

Most usage tracking systems are built for analytics. Usameter is built for billing:

- **Idempotency keys** prevent duplicate charges on network retries
- **Event-to-invoice audit trail** lets you prove exactly what was billed
- **High-precision decimals** (20,6) prevent rounding errors at scale
- **Atomic quota enforcement** ensures limits are never exceeded

### 2. Production-Ready Reliability

- **Circuit breaker pattern** — Redis failures fall back to PostgreSQL
- **Batch optimization** — N+1 queries eliminated for high-throughput ingestion
- **Graceful degradation** — System remains operational when dependencies fail

### 3. Flexible Enforcement Model

Unlike binary on/off quotas:
- **Soft limits** warn customers before hard cutoff
- **Grace periods** give time to upgrade plans
- **Enforcement modes** (HARD/SOFT/DISABLED) per tenant/event type

### 4. Complete Billing Pipeline

End-to-end from event to invoice:
- Event ingestion with deduplication
- Automated daily snapshots
- Tiered pricing calculation
- Invoice generation with line-item breakdown
- Stripe integration for payment processing

### 5. Multi-Tenant by Design

- Organization → Tenant hierarchy
- Per-tenant quotas and limits
- Isolated API keys with scoped permissions
- Tenant auto-provisioning on first event

### 6. Developer Experience

- Type-safe API with tRPC
- Zod validation on all inputs
- Comprehensive error responses with actionable details
- REST API for external integrations

---

## License

MIT
