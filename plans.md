# LYDEV Pay — Implementation Plan

> Domain: `https://pay.lydev.id`  
> Framework: TanStack Start + React + TypeScript  
> Payment provider: Sumopod Pay  
> Primary payment method: QRIS  
> Status: Approved architecture / implementation blueprint

> **Revisi 25 September 2026:** Semua halaman browser di `pay.lydev.id`, termasuk checkout, invoice, receipt, dan dashboard, mewajibkan login operator. Endpoint project tetap memakai API key untuk panggilan server-ke-server. Webhook Sumopod memakai signature provider, dan `/api/health` tetap terbuka hanya untuk pemeriksaan layanan. Palet UI adalah putih krem dan cokelat. Ketentuan revisi ini mengungguli bagian lama yang menyebut checkout/status/QR sebagai halaman atau endpoint publik.

---

## 0. Purpose of this document

This file is the source of truth for building **LYDEV Pay** at `pay.lydev.id`.

The objective is to provide a completely custom LYDEV payment experience while Sumopod Pay remains the actual payment provider behind the scenes.

The customer-facing flow must remain on `pay.lydev.id` as much as technically possible:

1. A payment is created by LYDEV Pay.
2. LYDEV Pay requests a payment from Sumopod.
3. Sumopod returns a hosted `paymentUrl`.
4. The LYDEV Pay backend opens/fetches that URL server-side.
5. **Only the QR payment image/data required for the transaction is extracted.**
6. LYDEV Pay serves that QR from its own endpoint under `pay.lydev.id`.
7. The customer scans the QR while remaining on the LYDEV Pay UI.
8. Sumopod sends its payment notification/webhook to LYDEV Pay.
9. The backend verifies the notification and updates the transaction.
10. The frontend receives the new status and displays success/expired/failure without using the Sumopod page as the source of truth.

This project is **not** intended to become a payment processor or to imitate Sumopod's payment processing infrastructure. LYDEV Pay is the merchant-facing orchestration, checkout, invoice, QR presentation, status, and internal API layer.

---

# 1. Non-negotiable architecture decisions

These decisions have already been approved and should not be changed unless there is a strong technical reason.

## 1.1 Framework

Use:

- TanStack Start
- React
- TypeScript
- TanStack Router file-based routing
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- Zod for request/environment validation

TanStack Start is used as a full-stack React application. Public HTTP/API endpoints such as Sumopod webhooks should use **server routes**. Internal same-origin application operations can use server functions where appropriate.

## 1.2 Public domain

Everything customer-facing belongs under:

```text
https://pay.lydev.id
```

Examples:

```text
https://pay.lydev.id/
https://pay.lydev.id/pay/LY-01JXYZ...
https://pay.lydev.id/invoice/LY-01JXYZ...
https://pay.lydev.id/receipt/LY-01JXYZ...
https://pay.lydev.id/status/LY-01JXYZ...
https://pay.lydev.id/dashboard
```

The customer should not need to open `pay.sumopod.com` during the normal QRIS flow.

## 1.3 Sumopod hosted payment URL

The Sumopod payment URL must be treated as a **server-side provider resource**.

Rules:

- Do not expose the raw provider payment URL in normal frontend API responses.
- Do not render the complete Sumopod page.
- Do not iframe the Sumopod page.
- Do not reverse proxy the complete Sumopod payment page.
- Do not copy Sumopod branding/UI.
- Do not scrape unrelated page content.
- Only extract the QR asset or QR payload needed to complete the payment.
- Never bypass CAPTCHA, authentication, anti-bot protection, or access controls.
- If Sumopod explicitly disallows this use in its terms/API agreement, switch to a supported direct/custom checkout method rather than bypassing restrictions.

## 1.4 Payment status source of truth

The payment page is **not** the source of truth.

Never mark a transaction as paid because:

- the user opened `/success`;
- the browser claims payment succeeded;
- scraped HTML says "success";
- a query parameter says `status=paid`;
- the frontend submits a paid status.

A transaction becomes `PAID` only after a trusted server-side provider verification path succeeds, normally:

```text
Sumopod webhook
      -> signature/token verification
      -> payment identity verification
      -> amount/currency verification
      -> database transaction
      -> status = PAID
```

If Sumopod provides a reliable server-to-server status endpoint, it may be used as an additional reconciliation mechanism, but webhook/provider verification remains authoritative.

---

# 2. Product goals

## 2.1 MVP goals

LYDEV Pay MVP must provide:

- custom LYDEV checkout UI;
- create payment endpoint;
- Sumopod payment creation adapter;
- secure storage of Sumopod provider payment URL;
- server-side QR extraction;
- QR served from `pay.lydev.id`;
- QR expiration countdown;
- payment status page;
- Sumopod webhook endpoint;
- webhook verification;
- idempotent payment event processing;
- automatic UI update after payment;
- invoice page;
- receipt page for paid transactions;
- basic admin/dashboard transaction list;
- login operator yang melindungi seluruh halaman browser;
- project API key untuk create/read payment dari backend project lain;
- structured logging;
- rate limiting;
- production environment validation;
- health endpoint.

## 2.2 Post-MVP goals

Later phases may include:

- multiple LYDEV projects using one payment API;
- payment links;
- refund tracking if supported by Sumopod;
- reconciliation jobs;
- exported CSV reports;
- dashboard charts;
- customer email receipts;
- per-project webhook callbacks;
- SDK for JavaScript/TypeScript;
- multi-provider payment adapter;
- automatic provider failover only if contractually and technically supported;
- custom merchant branding per project.

## 2.3 Explicit non-goals for MVP

Do not build these initially:

- custom card processing;
- collecting card numbers;
- storing bank credentials;
- wallet balances;
- peer-to-peer money transfer;
- user-held funds;
- arbitrary payout system;
- payment gateway marketplace;
- reverse proxy of Sumopod checkout pages;
- automated scraping outside the specific QR resource required for a payment.

---

# 3. Recommended runtime/deployment strategy

QR extraction determines the runtime requirement.

## 3.1 Preferred strategy

Start with a **Node.js container/runtime** rather than a restrictive edge runtime.

Recommended deployment targets:

- Railway;
- a small Ubuntu VPS with Docker;
- another Node-compatible container platform.

Reason:

If Sumopod's QR is directly present in server-rendered HTML, simple `fetch + Cheerio` will be enough. If the QR is rendered by JavaScript, LYDEV Pay may need a browser renderer such as Playwright. Running Playwright is significantly easier and more reliable in a normal Node container than an edge/serverless runtime.

The customer still sees only:

```text
pay.lydev.id
```

Cloudflare remains the DNS/TLS layer regardless of where the application is hosted.

## 3.2 Deployment mode A — lightweight parser

Use this when the payment page contains a directly discoverable QR image or payload.

```text
TanStack Start
Node runtime
fetch()
Cheerio
PostgreSQL
```

This is preferred because it is faster and cheaper.

## 3.3 Deployment mode B — browser fallback

Use only if Sumopod renders the QR after client-side JavaScript execution.

```text
TanStack Start
Node container
Playwright/Chromium
PostgreSQL
```

Playwright must be isolated to the provider adapter/scraper module. The application must not depend on browser automation for unrelated functionality.

## 3.4 Do not commit to Vercel/Cloudflare Workers before QR extraction is proven

A standard serverless deployment may be considered later if:

- Sumopod QR extraction is confirmed to work using simple HTTP requests;
- no Chromium/Playwright runtime is needed;
- database connection strategy is serverless-safe.

---

# 4. High-level architecture

```text
                                  +----------------------+
                                  |     Sumopod Pay      |
                                  |                      |
                                  | Create payment       |
                                  | Hosted payment URL   |
                                  | Payment webhook      |
                                  +----------+-----------+
                                             |
                           server-to-server  |
                                             v
+-------------------+             +------------------------------+
| Customer Browser  |             |         LYDEV Pay            |
|                   |             |      pay.lydev.id            |
| Custom checkout   |<----------->|                              |
| QRIS              |             | TanStack Start               |
| Countdown         |             | Server Routes                |
| Payment status    |             | Sumopod Adapter              |
| Receipt           |             | QR Extractor                 |
+-------------------+             | Webhook Processor            |
                                  | Prisma                       |
                                  +--------------+---------------+
                                                 |
                                                 v
                                  +------------------------------+
                                  |        PostgreSQL            |
                                  | Payments                     |
                                  | Payment events               |
                                  | QR cache                     |
                                  | Projects/API keys            |
                                  | Audit logs                   |
                                  +------------------------------+
```

---

# 5. User journeys

## 5.1 Direct checkout

```text
User opens checkout and logs in as operator
    -> LYDEV creates order
    -> backend creates Sumopod transaction
    -> backend receives paymentUrl
    -> backend extracts QR
    -> user sees QR at pay.lydev.id/pay/:orderId
    -> user scans QRIS
    -> Sumopod receives payment
    -> Sumopod webhook -> LYDEV Pay
    -> payment becomes PAID
    -> checkout UI updates automatically
    -> receipt becomes available
```

## 5.2 Payment from another LYDEV project

Example project calls:

```http
POST https://pay.lydev.id/api/v1/payments
Authorization: Bearer <project-api-key>
Idempotency-Key: <unique-request-key>
Content-Type: application/json
```

Payload example:

```json
{
  "externalReference": "TOPUP-2026-000123",
  "amount": 50000,
  "currency": "IDR",
  "description": "Top Up 50K",
  "customer": {
    "name": "Customer",
    "email": "customer@example.com"
  },
  "metadata": {
    "productId": "topup-50k"
  }
}
```

LYDEV Pay responds with its own public checkout URL:

```json
{
  "orderId": "LY-01JXYZ...",
  "status": "PENDING",
  "amount": 50000,
  "currency": "IDR",
  "checkoutUrl": "https://pay.lydev.id/pay/LY-01JXYZ...",
  "expiresAt": "2026-09-25T14:00:00+07:00"
}
```

Do not return the Sumopod payment URL in the normal public response.

---

# 6. Repository structure

Recommended single-repository structure:

```text
lydev-pay/
├─ src/
│  ├─ routes/
│  │  ├─ __root.tsx
│  │  ├─ index.tsx
│  │  ├─ pay/
│  │  │  └─ $orderId.tsx
│  │  ├─ invoice/
│  │  │  └─ $orderId.tsx
│  │  ├─ receipt/
│  │  │  └─ $orderId.tsx
│  │  ├─ status/
│  │  │  └─ $orderId.tsx
│  │  ├─ dashboard/
│  │  │  ├─ index.tsx
│  │  │  └─ payments/
│  │  │     └─ $orderId.tsx
│  │  └─ api/
│  │     ├─ health.ts
│  │     ├─ v1/
│  │     │  └─ payments/
│  │     │     ├─ index.ts
│  │     │     ├─ $orderId.ts
│  │     │     ├─ $orderId.status.ts
│  │     │     └─ $orderId.qr.ts
│  │     └─ webhooks/
│  │        └─ sumopod.ts
│  │
│  ├─ components/
│  │  ├─ checkout/
│  │  │  ├─ PaymentCard.tsx
│  │  │  ├─ QrDisplay.tsx
│  │  │  ├─ PaymentStatusBadge.tsx
│  │  │  ├─ PaymentCountdown.tsx
│  │  │  └─ PaymentSuccess.tsx
│  │  ├─ dashboard/
│  │  │  ├─ PaymentTable.tsx
│  │  │  ├─ MetricCard.tsx
│  │  │  └─ StatusFilter.tsx
│  │  └─ ui/
│  │
│  ├─ server/
│  │  ├─ db.ts
│  │  ├─ env.ts
│  │  ├─ logger.ts
│  │  ├─ rate-limit.ts
│  │  ├─ auth/
│  │  │  ├─ api-key.ts
│  │  │  └─ dashboard.ts
│  │  ├─ payments/
│  │  │  ├─ payment.service.ts
│  │  │  ├─ payment.repository.ts
│  │  │  ├─ payment-state.ts
│  │  │  └─ idempotency.ts
│  │  ├─ providers/
│  │  │  └─ sumopod/
│  │  │     ├─ sumopod.client.ts
│  │  │     ├─ sumopod.types.ts
│  │  │     ├─ sumopod.mapper.ts
│  │  │     ├─ sumopod.webhook.ts
│  │  │     └─ sumopod.config.ts
│  │  └─ qr/
│  │     ├─ qr-extractor.ts
│  │     ├─ html-extractor.ts
│  │     ├─ browser-extractor.ts
│  │     ├─ qr-validator.ts
│  │     └─ allowed-provider-url.ts
│  │
│  ├─ lib/
│  │  ├─ format-currency.ts
│  │  ├─ dates.ts
│  │  ├─ constants.ts
│  │  └─ public-types.ts
│  │
│  ├─ router.tsx
│  └─ styles.css
│
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ fixtures/
│  │  └─ sumopod/
│  └─ e2e/
│
├─ scripts/
│  ├─ verify-env.ts
│  ├─ reconcile-payments.ts
│  └─ cleanup-expired-qr.ts
│
├─ public/
│  ├─ logo.svg
│  └─ favicon.ico
│
├─ .env.example
├─ .gitignore
├─ Dockerfile
├─ docker-compose.yml
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ prisma.config.ts
├─ README.md
└─ plans.md
```

Route filenames may be adjusted to match the exact TanStack Start file-route conventions generated by the current CLI. Do not fight the generated route tree.

---

# 7. Database design

Use PostgreSQL with Prisma migrations.

Never use `prisma db push` as the production deployment strategy. Production schema changes must use reviewed migrations.

## 7.1 Enums

```prisma
enum PaymentStatus {
  CREATED
  PENDING
  PAID
  FAILED
  EXPIRED
  CANCELLED
  REFUNDED
}

enum PaymentProvider {
  SUMOPOD
}

enum PaymentEventSource {
  SYSTEM
  PROVIDER_WEBHOOK
  PROVIDER_RECONCILIATION
  ADMIN
}
```

## 7.2 Project model

Future-proofs LYDEV Pay for several LYDEV services.

```prisma
model Project {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  apiKeys     ApiKey[]
  payments    Payment[]
}
```

Examples:

```text
portfolio
store
topup
archive
internal
```

## 7.3 API key model

Never store raw API keys.

```prisma
model ApiKey {
  id          String   @id @default(cuid())
  projectId   String
  prefix      String
  keyHash     String   @unique
  label       String?
  isActive    Boolean  @default(true)
  lastUsedAt  DateTime?
  expiresAt   DateTime?
  createdAt   DateTime @default(now())

  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
}
```

Store only a strong hash of the API key. Show the raw key once at creation time.

## 7.4 Payment model

```prisma
model Payment {
  id                    String          @id @default(cuid())
  orderId               String          @unique

  projectId             String?
  externalReference     String?

  provider              PaymentProvider @default(SUMOPOD)
  providerPaymentId     String?          @unique
  providerPaymentUrl    String?

  amount                Int
  currency              String          @default("IDR")
  description           String?

  status                PaymentStatus   @default(CREATED)
  paymentMethod         String?

  customerName          String?
  customerEmail         String?

  expiresAt             DateTime?
  paidAt                DateTime?
  failedAt              DateTime?
  cancelledAt           DateTime?

  providerMetadata      Json?
  publicMetadata        Json?

  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  project               Project?        @relation(fields: [projectId], references: [id])
  events                PaymentEvent[]
  qrAsset               PaymentQrAsset?

  @@index([status, createdAt])
  @@index([projectId, createdAt])
  @@index([externalReference])
}
```

### Important rules

- `amount` is integer IDR; never floating point.
- `providerPaymentUrl` is server-only data.
- `providerMetadata` may contain provider-specific fields and must never be blindly returned to clients.
- frontend responses are built using explicit DTOs, never `return payment` directly.

## 7.5 QR asset model

For MVP, storing short-lived QR bytes in PostgreSQL is acceptable and avoids exposing a public object-storage URL.

```prisma
model PaymentQrAsset {
  id           String   @id @default(cuid())
  paymentId    String   @unique
  mimeType     String
  image        Bytes
  checksum     String
  fetchedAt    DateTime @default(now())
  expiresAt    DateTime?

  payment      Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
}
```

Rules:

- QR images are ephemeral.
- Delete QR bytes after a configurable retention period after payment/expiration.
- Do not publish QR assets in a public bucket for MVP.
- `/api/v1/payments/:orderId/qr` performs authorization/validation and returns the bytes.

## 7.6 Payment event model

```prisma
model PaymentEvent {
  id               String             @id @default(cuid())
  paymentId        String
  source           PaymentEventSource
  eventType        String
  providerEventId  String?
  payloadHash      String?
  payload          Json?
  createdAt        DateTime           @default(now())

  payment          Payment            @relation(fields: [paymentId], references: [id], onDelete: Cascade)

  @@index([paymentId, createdAt])
  @@unique([providerEventId])
}
```

This provides webhook idempotency and an audit trail.

## 7.7 Idempotency record

```prisma
model IdempotencyRecord {
  id             String   @id @default(cuid())
  projectId      String
  key            String
  requestHash    String
  responseStatus Int?
  responseBody   Json?
  paymentId      String?
  expiresAt      DateTime
  createdAt      DateTime @default(now())

  @@unique([projectId, key])
  @@index([expiresAt])
}
```

---

# 8. Payment state machine

Allowed transitions must be centralized in `payment-state.ts`.

```text
CREATED
   |
   v
PENDING --------------------------+
   |                              |
   +-----------> PAID             |
   |                              |
   +-----------> EXPIRED          |
   |                              |
   +-----------> FAILED           |
   |                              |
   +-----------> CANCELLED        |
                                  |
PAID ------------------> REFUNDED |
```

Do not allow arbitrary writes such as:

```ts
payment.status = input.status
```

Implement explicit transition rules.

Example policy:

```text
CREATED -> PENDING
PENDING -> PAID
PENDING -> EXPIRED
PENDING -> FAILED
PENDING -> CANCELLED
PAID    -> REFUNDED
```

A repeated webhook for a status already applied must return a successful acknowledgement without changing the payment again.

---

# 9. Sumopod provider abstraction

Do not spread Sumopod-specific HTTP requests throughout the application.

Create a provider adapter.

Conceptual interface:

```ts
export interface PaymentProviderAdapter {
  createPayment(input: CreateProviderPaymentInput): Promise<CreateProviderPaymentResult>
  verifyWebhook(request: Request): Promise<VerifiedProviderEvent>
  getPaymentStatus?(providerPaymentId: string): Promise<ProviderPaymentStatus>
}
```

Sumopod implementation:

```text
src/server/providers/sumopod/
```

The rest of LYDEV Pay should work with internal types.

Example internal create result:

```ts
type CreateProviderPaymentResult = {
  providerPaymentId: string
  providerPaymentUrl: string
  amount: number
  currency: 'IDR'
  expiresAt?: Date
  raw?: unknown
}
```

## 9.1 Provider facts that must be confirmed before final implementation

Do not invent these values:

- exact production API base URL;
- exact sandbox API base URL;
- create-payment endpoint path;
- exact authentication header format;
- exact create-payment request body;
- exact response property names;
- exact webhook event names;
- exact webhook verification/signature rules;
- exact expiry behavior;
- whether provider payment URLs require cookies or JavaScript;
- QR DOM selector/image format.

Keep these details isolated in the Sumopod adapter/config so changes do not affect business logic.

---

# 10. Payment creation flow

## 10.1 Endpoint

```text
POST /api/v1/payments
```

For internal LYDEV projects this endpoint requires an API key.

For a future public payment-link creator/dashboard flow, use authenticated server functions instead of exposing unrestricted anonymous payment creation.

## 10.2 Validation

Validate with Zod:

- `externalReference`: optional bounded string;
- `amount`: positive integer;
- maximum amount: configuration-controlled;
- currency: `IDR` for MVP;
- description: bounded safe text;
- customer email: valid email when provided;
- metadata: size-limited JSON object.

Never accept a provider URL from the client.

## 10.3 Server algorithm

```text
1. Authenticate project API key.
2. Validate request.
3. Validate Idempotency-Key.
4. Calculate/validate amount server-side.
5. Generate LYDEV orderId.
6. Insert Payment(CREATED).
7. Call Sumopod create payment.
8. Validate provider response.
9. Verify returned provider URL belongs to an allowed Sumopod host.
10. Persist providerPaymentId + providerPaymentUrl.
11. Change CREATED -> PENDING.
12. Start QR extraction.
13. Persist QR asset.
14. Return LYDEV checkout URL.
```

If QR extraction fails:

- payment remains `PENDING` if Sumopod payment was successfully created;
- record QR extraction error separately;
- allow controlled retry;
- do not create another Sumopod payment unless the existing one is invalid/expired;
- never automatically create duplicate payment requests on a simple scraper failure.

---

# 11. LYDEV order ID format

Use a sortable, non-sequential identifier such as ULID.

Example:

```text
LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC
```

Requirements:

- unique;
- not trivially enumerable;
- safe in URLs;
- generated server-side.

Do not use simple incrementing IDs like `PAY-001`, `PAY-002` as the public identifier.

---

# 12. QR extraction subsystem

This is one of the most important parts of LYDEV Pay.

## 12.1 Interface

```ts
interface QrExtractor {
  extract(input: {
    paymentUrl: string
    expectedAmount: number
    orderId: string
  }): Promise<ExtractedQr>
}

type ExtractedQr = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml'
  bytes: Uint8Array
  source: 'html-image' | 'data-url' | 'browser-screenshot'
}
```

## 12.2 SSRF protection — mandatory

The scraper must never act as a general URL fetcher.

Before any request:

1. `paymentUrl` must originate from the Sumopod API response, never user input.
2. Parse with `new URL()`.
3. Require HTTPS.
4. Compare hostname against an explicit allowlist.
5. Reject credentials in the URL.
6. Restrict ports to expected HTTPS behavior.
7. Limit redirects.
8. Validate every redirect target against the allowlist.
9. Set connection/read timeout.
10. Limit downloaded HTML/image size.

Example configuration:

```env
SUMOPOD_ALLOWED_PAYMENT_HOSTS=pay.sumopod.com
QR_FETCH_TIMEOUT_MS=10000
QR_HTML_MAX_BYTES=1000000
QR_IMAGE_MAX_BYTES=2000000
```

Do not allow:

```text
/api/qr?url=https://anything.com
```

That would create an SSRF vulnerability.

## 12.3 Extraction strategy order

Use the cheapest safe strategy first.

### Strategy A — HTML image extraction

```text
GET provider payment URL
 -> verify response Content-Type HTML
 -> parse with Cheerio
 -> locate expected QR element
 -> resolve URL
 -> validate host/data URL
 -> download image
 -> validate image Content-Type and size
 -> persist bytes
```

Selectors must be provider-specific and stored in one module.

Do not use broad selectors that may accidentally capture logos/ads.

Bad:

```ts
$('img').first()
```

Better conceptually:

```ts
$('[data-payment-qr] img')
$('.qris-container img')
$('img[alt="QRIS"]')
```

Use the real selector only after inspecting an actual Sandbox payment URL.

### Strategy B — data URL

If the page contains:

```text
data:image/png;base64,...
```

extract, validate, decode and persist it.

### Strategy C — browser rendering

Use Playwright only when A/B cannot obtain the QR because it is client-rendered.

Browser rules:

- open only the provider allowlisted URL;
- no login bypass;
- no stealth plugins;
- no CAPTCHA bypass;
- wait for a provider-specific QR locator;
- capture only the QR element, not the full checkout page;
- strict timeout;
- close context/browser reliably;
- concurrency limit to prevent resource exhaustion.

Example configuration:

```env
QR_EXTRACTOR_MODE=auto
QR_BROWSER_CONCURRENCY=2
QR_BROWSER_TIMEOUT_MS=15000
```

`auto` means:

```text
HTML extractor
  -> if not found and browser extraction is enabled
Playwright extractor
```

## 12.4 QR validation

Before saving:

- Content-Type must be an allowed image type.
- Size must be > minimum reasonable bytes and < configured maximum.
- Hash the bytes with SHA-256.
- Optional: decode QR locally and confirm it is a QR payload.
- Never modify the QR pixels except safe presentation scaling.
- Do not watermark or overlay the QR.
- Preserve adequate quiet zone around QR in the frontend.

If QR decoding is used, it is for validation only. Do not rewrite the payment payload.

---

# 13. QR serving endpoint

## Endpoint

```text
GET /api/v1/payments/:orderId/qr
```

Response:

```http
HTTP/1.1 200 OK
Content-Type: image/png
Cache-Control: private, no-store, max-age=0
X-Content-Type-Options: nosniff
```

Rules:

- find payment by public `orderId`;
- do not expose database ID;
- only serve QR for appropriate payment states;
- return `410 Gone` after expiry/cleanup when appropriate;
- never redirect the browser to Sumopod's image URL;
- never expose `providerPaymentUrl`;
- use a generic error image/UI only at the frontend, not a forged QR.

---

# 14. Webhook subsystem

## 14.1 Endpoint

```text
POST /api/webhooks/sumopod
```

Use a TanStack Start **server route** because this endpoint is called externally by Sumopod.

## 14.2 Processing order

```text
1. Receive raw request/body.
2. Enforce maximum request size.
3. Read required signature/token headers.
4. Verify Sumopod authentication/signature using documented algorithm.
5. Parse validated JSON.
6. Derive provider event identity.
7. Check event idempotency.
8. Find payment by provider payment ID/order reference.
9. Verify amount/currency when included.
10. Map provider status -> LYDEV status.
11. Apply allowed state transition inside DB transaction.
12. Save PaymentEvent.
13. Return provider-required success response quickly.
```

Never perform browser scraping inside the webhook request.

## 14.3 Webhook idempotency

Sumopod may retry webhooks.

Processing must behave safely when receiving the same event multiple times.

If `providerEventId` exists:

```text
unique(providerEventId)
```

If the provider does not supply a stable event ID, derive a deterministic hash from trusted fields plus the raw body.

## 14.4 Webhook failure behavior

- Invalid signature/token -> `401` or `400` according to provider requirements.
- Unknown payment -> record safely and respond according to provider retry expectations.
- Temporary DB failure -> return retryable 5xx.
- Already processed event -> return success.

Do not include secrets or stack traces in webhook responses.

---

# 15. Payment status API

## Endpoint

```text
GET /api/v1/payments/:orderId/status
```

Public checkout-safe response:

```json
{
  "orderId": "LY-01JXYZ...",
  "status": "PENDING",
  "amount": 50000,
  "currency": "IDR",
  "expiresAt": "2026-09-25T14:00:00+07:00",
  "paidAt": null
}
```

Never include:

- `providerPaymentUrl`;
- API keys;
- webhook secret;
- full provider metadata;
- internal database IDs;
- customer private data not needed by the page.

---

# 16. Frontend status synchronization

For MVP use lightweight polling.

Recommended behavior:

```text
PENDING page visible:
  poll every 3 seconds for first 60 seconds
  then every 5 seconds
  stop when PAID/FAILED/EXPIRED/CANCELLED
  stop or slow significantly when tab is hidden
```

Use TanStack Query only if it materially simplifies caching/status handling. Do not add it merely because it is part of the TanStack ecosystem.

Later optimization options:

- Server-Sent Events;
- WebSocket;
- provider-to-server webhook + SSE to browser.

Polling is sufficient for MVP and operationally simpler.

---

# 17. Checkout UI specification

## 17.1 Main payment page

Route:

```text
/pay/:orderId
```

Desktop layout:

```text
+--------------------------------------------------+
| LYDEV PAY                                        |
| Secure Payment                                   |
|                                                  |
| Order                                            |
| LY-01K...                                        |
|                                                  |
| Total                                            |
| Rp50.000                                         |
|                                                  |
|              +----------------+                  |
|              |                |                  |
|              |      QRIS      |                  |
|              |                |                  |
|              +----------------+                  |
|                                                  |
| Scan menggunakan aplikasi pembayaran Anda        |
|                                                  |
| ● Menunggu pembayaran                           |
| Sisa waktu 09:42                                 |
|                                                  |
| Jangan tutup halaman sampai pembayaran selesai. |
+--------------------------------------------------+
```

## 17.2 Mobile design

Mobile-first requirements:

- QR large enough to scan from another device;
- if payment page is opened on the same phone, provide a safe "open payment provider" fallback only if product requirements later allow it;
- amount visually prominent;
- status always visible;
- countdown visible but not alarming;
- no unnecessary navigation;
- avoid layout shifts after QR loads.

## 17.3 Status visuals

Use neutral, accessible states:

```text
CREATED    -> Menyiapkan pembayaran
PENDING    -> Menunggu pembayaran
PAID       -> Pembayaran berhasil
EXPIRED    -> Pembayaran kedaluwarsa
FAILED     -> Pembayaran gagal
CANCELLED  -> Pembayaran dibatalkan
REFUNDED   -> Pembayaran dikembalikan
```

## 17.4 Paid state

After webhook changes payment to `PAID`:

- stop polling;
- replace QR with success state;
- display paid timestamp;
- show receipt button;
- optional redirect after a short delay only when an allowed return URL was registered server-side;
- never trust a return URL supplied directly in a public query string.

---

# 18. Invoice and receipt

## 18.1 Invoice

Route:

```text
/invoice/:orderId
```

Contains:

- LYDEV Pay branding;
- order ID;
- created timestamp;
- description;
- amount;
- current payment status;
- expiry;
- optional customer name/email masked appropriately.

## 18.2 Receipt

Route:

```text
/receipt/:orderId
```

Available only when status is `PAID` or `REFUNDED` where applicable.

Contains:

- receipt number;
- order ID;
- amount;
- method;
- paid timestamp;
- transaction status;
- project/merchant reference.

Do not claim the receipt is a bank receipt. Label it clearly as an LYDEV Pay merchant payment receipt.

---

# 19. Dashboard

Route:

```text
/dashboard
```

Dashboard requires authentication.

MVP cards:

```text
Total transactions
Paid transactions
Pending transactions
Revenue from PAID transactions
Failed/expired count
```

Table columns:

```text
Order ID
Project
Description
Amount
Status
Created
Paid At
```

Filters:

- status;
- date range;
- project;
- order ID search.

Payment detail page:

```text
/dashboard/payments/:orderId
```

Show:

- public payment data;
- internal provider payment ID;
- provider status mapping;
- webhook/event timeline;
- QR extraction status;
- safe metadata;
- retry QR extraction button for eligible pending payment;
- manual reconciliation button only after provider status endpoint is implemented.

Do not include a manual "mark paid" button in MVP.

---

# 20. Authentication strategy

Two independent authentication domains exist.

## 20.1 Project API authentication

For server-to-server payment creation.

Header:

```http
Authorization: Bearer ly_live_xxxxxxxxx
```

Key behavior:

- generated using cryptographically secure random bytes;
- prefix shown for identification;
- raw key shown once;
- hash stored in database;
- constant-time comparison where appropriate;
- key can be revoked;
- per-key/project rate limits;
- sandbox and production keys separated.

## 20.2 Browser authentication

MVP options in preferred order:

1. simple secure application authentication with a proven auth library compatible with current TanStack Start;
2. Cloudflare Access protecting `/dashboard` if the deployment architecture uses it;
3. a dedicated admin session implementation only if necessary.

Do not hand-roll password cryptography/session signing when a mature solution is available.

Login operator melindungi seluruh halaman browser, termasuk `/`, `/dashboard`, `/pay/:orderId`, `/invoice/:orderId`, dan `/receipt/:orderId`. Tidak ada registrasi publik. Sesi menggunakan cookie HttpOnly, Secure di production, dan SameSite=Lax. Server route yang membaca data privat juga harus memeriksa sesi atau API key pada endpoint itu sendiri. Login operator tidak berbagi project API key.

Pengecualian terukur: `/api/health` hanya mengembalikan status layanan; `/api/webhooks/sumopod` menerima request provider setelah signature valid; `/api/v1/payments` menerima request server-ke-server setelah project API key valid.

---

# 21. API design

## Browser-authenticated checkout endpoints

```text
GET  /api/v1/payments/:orderId/status
GET  /api/v1/payments/:orderId/qr
```

## Project/server endpoints

```text
POST /api/v1/payments
GET  /api/v1/payments/:orderId
```

## Provider endpoint

```text
POST /api/webhooks/sumopod
```

## Operational endpoint

```text
GET /api/health
```

Health response should not reveal secret configuration.

Example:

```json
{
  "status": "ok",
  "service": "lydev-pay"
}
```

---

# 22. Return URL security

If other LYDEV projects need a return link after payment, do not accept arbitrary URLs on each anonymous request.

Store allowed origins/URLs on the `Project` record.

Example:

```text
Project: store
Allowed return origins:
- https://store.lydev.id
- https://app.example.com
```

On payment creation:

- validate the requested return URL against the project's allowlist;
- store the validated URL with the payment;
- never create an open redirect endpoint.

---

# 23. Environment variables

`.env.example` should include placeholders only.

```env
# Application
NODE_ENV=development
APP_URL=http://localhost:3000
APP_NAME=LYDEV Pay

# Database
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/lydev_pay

# Sumopod
SUMOPOD_ENV=sandbox
SUMOPOD_API_BASE_URL=
SUMOPOD_API_KEY=
SUMOPOD_WEBHOOK_SECRET=
SUMOPOD_WEBHOOK_TOKEN=
SUMOPOD_ALLOWED_PAYMENT_HOSTS=pay.sumopod.com

# QR extraction
QR_EXTRACTOR_MODE=auto
QR_FETCH_TIMEOUT_MS=10000
QR_HTML_MAX_BYTES=1000000
QR_IMAGE_MAX_BYTES=2000000
QR_BROWSER_ENABLED=false
QR_BROWSER_CONCURRENCY=2
QR_BROWSER_TIMEOUT_MS=15000

# Security
API_KEY_PEPPER=
SESSION_SECRET=

# Rate limit
RATE_LIMIT_ENABLED=true

# Logging
LOG_LEVEL=info
```

Actual Sumopod variable names may be adjusted once the official integration details are confirmed.

## Environment validation

Create `src/server/env.ts` with Zod.

Production startup must fail early if required variables are missing.

Never silently fall back to Sandbox when `NODE_ENV=production`.

---

# 24. Secrets policy

Never commit:

```text
.env
.env.local
production API keys
webhook secrets
database credentials
session secrets
raw LYDEV project API keys
```

Never prefix server secrets with frontend/public environment prefixes.

Redact these fields from logs.

---

# 25. Security requirements

## 25.1 HTTP security

Configure appropriate headers:

```text
Strict-Transport-Security
X-Content-Type-Options: nosniff
Referrer-Policy
Content-Security-Policy
Permissions-Policy
```

Do not use an overly permissive CSP simply to fix development issues.

## 25.2 CSRF

- TanStack Start server functions are same-origin operations and should retain CSRF protection.
- Public server routes require their own authentication/validation model.
- Sumopod webhook is authenticated with provider signature/token, not browser CSRF tokens.

## 25.3 CORS

Default to same-origin.

Server-to-server project API calls do not require browser CORS.

If browser CORS becomes necessary later, configure an explicit project origin allowlist. Never use `Access-Control-Allow-Origin: *` on privileged endpoints.

## 25.4 Rate limiting

Apply rate limits to:

- payment creation;
- public status polling;
- QR endpoint;
- login endpoints;
- dashboard mutation endpoints.

Webhook rate limiting must not accidentally block legitimate provider retries. Use provider verification and reasonable abuse controls instead of a tiny generic limit.

## 25.5 Data minimization

Store only customer data needed for payment operations.

Avoid collecting:

- national ID;
- bank credentials;
- card details;
- unnecessary address/profile fields.

## 25.6 Logging

Never log:

- complete API keys;
- database passwords;
- webhook secrets;
- session cookies;
- Authorization headers;
- raw QR payload unless specifically required for debugging in a local non-production environment.

---

# 26. Observability

Use structured JSON logs in production.

Recommended log fields:

```text
requestId
orderId
providerPaymentId
eventType
status
latencyMs
extractorMode
errorCode
```

Never log sensitive customer/payment secrets.

Useful events:

```text
payment.create.requested
payment.create.provider_success
payment.create.provider_failed
qr.extract.started
qr.extract.html_success
qr.extract.browser_success
qr.extract.failed
webhook.received
webhook.verified
webhook.rejected
payment.status.changed
payment.expired
```

---

# 27. Error model

Internal APIs should use stable error codes.

Example:

```json
{
  "error": {
    "code": "PAYMENT_QR_UNAVAILABLE",
    "message": "QR pembayaran belum tersedia."
  }
}
```

Suggested codes:

```text
INVALID_REQUEST
UNAUTHORIZED
FORBIDDEN
RATE_LIMITED
PAYMENT_NOT_FOUND
PAYMENT_EXPIRED
PAYMENT_NOT_PENDING
PROVIDER_UNAVAILABLE
PROVIDER_INVALID_RESPONSE
PAYMENT_QR_UNAVAILABLE
QR_EXTRACTION_FAILED
WEBHOOK_INVALID
INTERNAL_ERROR
```

User-facing messages must not contain stack traces or provider secrets.

---

# 28. QR extraction resilience

Because scraping a provider page is structurally more fragile than a documented API, design for breakage.

Required protections:

- provider-specific fixtures in tests;
- extractor version identifier in logs;
- alert when QR extraction failure rate increases;
- fallback from HTTP parser to browser renderer when enabled;
- bounded retries;
- no endless loops;
- do not create duplicate Sumopod transactions on extraction retry;
- dashboard visibility for `QR_EXTRACTION_FAILED`.

Recommended retry policy:

```text
attempt 1: immediate
attempt 2: +2s
attempt 3: +5s
then stop and surface controlled error
```

Retries apply to QR extraction only, not provider payment creation unless idempotency guarantees are proven.

---

# 29. Expiration handling

Use the provider expiry when supplied.

If provider does not expose a reliable expiry, define a local display expiry only after confirming it cannot conflict with provider behavior.

When payment expires:

```text
PENDING -> EXPIRED
```

But do not locally expire a payment earlier than Sumopod unless product policy explicitly intends that behavior.

If a late provider webhook reports a legitimate payment after a local expiry, use provider rules and a carefully defined reconciliation policy rather than dropping the event silently.

---

# 30. Reconciliation

If Sumopod provides a payment status endpoint, implement a reconciliation command/job.

Use cases:

- webhook delivery outage;
- server downtime;
- uncertain pending transactions;
- recovery after deployment incident.

Script concept:

```text
scripts/reconcile-payments.ts
```

Flow:

```text
find old PENDING payments
  -> query provider status
  -> verify identity/amount
  -> safely transition status
  -> record PROVIDER_RECONCILIATION event
```

Never scrape visible status text from the payment page as the primary reconciliation mechanism when a provider API exists.

---

# 31. Cleanup jobs

Implement cleanup for:

- expired QR image bytes;
- expired idempotency records;
- stale sessions;
- old temporary webhook debug data if enabled.

Do not delete core payment ledger/event data without a deliberate retention policy.

---

# 32. Styling direction

LYDEV Pay should feel like a standalone payment product.

Design direction:

- clean;
- minimal;
- putih krem dan cokelat sebagai palet utama;
- fast;
- professional;
- mobile-first;
- strong amount hierarchy;
- clear status;
- no visual clutter around QR;
- accessible contrast;
- dark mode optional, not required for MVP.

Suggested components:

```text
LYDEV logo
Secure Payment label
Order summary
Amount
QRIS card
Countdown
Status pill
Help text
Receipt button
```

Do not mimic Sumopod's UI.

---

# 33. Accessibility

Minimum requirements:

- semantic headings;
- keyboard-accessible controls;
- visible focus states;
- status changes announced using appropriate live regions;
- text status in addition to color;
- sufficient contrast;
- QR has meaningful surrounding instructions;
- loading skeletons do not trap screen readers.

---

# 34. Performance goals

Target:

- checkout shell renders immediately without waiting for QR extraction;
- QR loading state is independent;
- avoid large client bundles;
- no unnecessary global state library;
- lazy load dashboard-only components;
- Playwright must run server-side only;
- provider requests have strict timeouts;
- database indexes support status/date dashboard queries.

---

# 35. Packages

Initial dependencies should stay small.

Core candidates:

```text
@tanstack/react-start
@tanstack/react-router
react
react-dom
zod
@prisma/client
prisma
cheerio
```

Likely utilities:

```text
pino
ulid
```

Testing:

```text
vitest
@testing-library/react
playwright (E2E and optional provider browser extraction)
```

Do not install packages until they have a clear use.

---

# 36. Initial project bootstrap

Use the current TanStack CLI rather than copying an outdated template manually.

Conceptual bootstrap:

```bash
npx @tanstack/cli@latest create
```

During setup select:

```text
React / TanStack Start
TypeScript
Tailwind CSS
ESLint
```

Then add Prisma/PostgreSQL and project-specific dependencies.

Always verify generated scripts/package versions against the current TanStack Start documentation before implementation.

---

# 37. Local development environment

Recommended Docker Compose development services:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: lydev_pay
      POSTGRES_USER: lydev
      POSTGRES_PASSWORD: local_only_password
    ports:
      - "5432:5432"
```

Application runs on host during development.

Do not put production secrets in `docker-compose.yml`.

---

# 38. Sandbox workflow

All development must begin against Sumopod Sandbox if available.

Mandatory test sequence:

```text
1. Create Sandbox payment.
2. Capture returned payment URL.
3. Manually inspect payment page DOM/network.
4. Identify QR rendering method.
5. Implement HTML extractor if possible.
6. Add browser fallback only if needed.
7. Verify extracted QR scans correctly in Sandbox.
8. Verify QR cannot be served after expiration as intended.
9. Verify webhook authentication.
10. Verify webhook changes PENDING -> PAID.
11. Verify repeated webhook is idempotent.
12. Verify success page does not independently mark payment paid.
13. Verify invalid payment URL cannot trigger arbitrary server fetch.
```

Do not enable production keys before this suite passes.

---

# 39. Test strategy

## 39.1 Unit tests

Test:

- currency formatting;
- order ID generation;
- payment transition rules;
- Zod validation;
- Sumopod response mapper;
- provider URL allowlist;
- QR image validation;
- webhook status mapping;
- API key hashing/verification;
- idempotency logic.

## 39.2 QR fixture tests

Save sanitized local HTML fixtures representing the Sumopod Sandbox payment page structure.

Test:

```text
HTML fixture -> expected QR source found
logo image -> not selected
missing QR -> controlled failure
invalid image type -> rejected
oversized image -> rejected
redirect to non-Sumopod host -> rejected
```

Never commit private live transaction data into fixtures.

## 39.3 Integration tests

Test against a test PostgreSQL database:

```text
create payment service
payment DB persistence
QR asset persistence
webhook processing
idempotent duplicate webhook
state transition transaction
```

Provider HTTP calls should be mocked except dedicated Sandbox integration tests.

## 39.4 E2E tests

Browser tests:

```text
checkout page loads
QR loading -> visible
pending state displayed
mock webhook -> paid state appears
receipt link becomes available
expired payment state
404 unknown order
mobile viewport
```

---

# 40. Production readiness checklist

Do not go live until all are true.

## Domain / TLS

- [ ] `pay.lydev.id` resolves to production application.
- [ ] HTTPS is valid.
- [ ] HTTP redirects to HTTPS.
- [ ] HSTS configured appropriately.

## Sumopod

- [ ] Production merchant/account approval completed as required.
- [ ] Production API endpoint verified.
- [ ] Production API authentication verified.
- [ ] Webhook URL registered.
- [ ] Webhook secret/signature verification confirmed with real provider documentation.
- [ ] Real small-value payment test completed.
- [ ] Refund/expiry behavior documented.

## Application

- [ ] Production env validation passes.
- [ ] Database migrations deployed.
- [ ] No `db push` in production workflow.
- [ ] QR scraper works against production-format payment page.
- [ ] SSRF protections tested.
- [ ] API rate limits enabled.
- [ ] Logs redact secrets.
- [ ] Health endpoint works.
- [ ] Dashboard protected.
- [ ] Error pages do not expose internals.

## Payment integrity

- [ ] Browser cannot mark transaction paid.
- [ ] Webhook verification required.
- [ ] Amount is checked where provider data permits.
- [ ] Duplicate webhook safe.
- [ ] Payment creation idempotency implemented.
- [ ] Unknown provider event handled safely.

## UX

- [ ] QR scans from another phone.
- [ ] Mobile layout tested.
- [ ] Countdown correct.
- [ ] Paid state appears automatically.
- [ ] Expired state clear.
- [ ] Receipt correct.

---

# 41. Development phases

## Phase 0 — discovery / provider proof

Goal: prove Sumopod integration before building the entire dashboard.

Tasks:

- [ ] obtain current Sumopod Sandbox API documentation/credentials;
- [ ] create one Sandbox payment manually via API;
- [ ] record exact create-payment request/response schema;
- [ ] inspect one active Sandbox payment URL;
- [ ] determine QR type: `<img>`, data URL, canvas, SVG, or client-rendered;
- [ ] determine exact QR locator;
- [ ] confirm webhook headers/signature/token mechanism;
- [ ] capture sanitized sample webhook;
- [ ] document provider expiry/status mapping.

Deliverable:

```text
Provider contract is known and testable.
```

## Phase 1 — project foundation

Tasks:

- [ ] scaffold TanStack Start project;
- [ ] configure TypeScript/Tailwind;
- [ ] configure ESLint/formatting;
- [ ] create env validation;
- [ ] configure Prisma/PostgreSQL;
- [ ] create initial migrations;
- [ ] create structured logger;
- [ ] create `/api/health`.

Deliverable:

```text
Application boots locally with database connection.
```

## Phase 2 — payment domain

Tasks:

- [ ] implement payment enums/models;
- [ ] implement order ID generation;
- [ ] implement state machine;
- [ ] implement repository/service layer;
- [ ] implement payment DTOs;
- [ ] implement idempotency records;
- [ ] add unit tests.

Deliverable:

```text
Provider-independent payment core works.
```

## Phase 3 — Sumopod adapter

Tasks:

- [ ] implement typed Sumopod client;
- [ ] configure Sandbox base URL;
- [ ] create payment mapping;
- [ ] validate provider responses;
- [ ] validate provider payment URL host;
- [ ] persist provider IDs/URL;
- [ ] add mocked integration tests.

Deliverable:

```text
LYDEV Pay can create a real Sandbox payment safely.
```

## Phase 4 — QR extraction

Tasks:

- [ ] implement SSRF-safe provider URL validator;
- [ ] implement HTTP HTML fetcher;
- [ ] implement Cheerio selector extractor;
- [ ] implement image fetch/validation;
- [ ] store QR bytes;
- [ ] implement QR endpoint;
- [ ] test actual Sandbox QR scan;
- [ ] add Playwright fallback only if required;
- [ ] add extraction retry policy;
- [ ] add extraction fixtures/tests.

Deliverable:

```text
Sumopod QR appears entirely inside pay.lydev.id.
```

## Phase 5 — webhook

Tasks:

- [ ] create external server route;
- [ ] preserve raw request data when signature algorithm requires it;
- [ ] verify webhook authenticity;
- [ ] map provider event/status;
- [ ] validate payment identity/amount;
- [ ] enforce idempotency;
- [ ] update payment in DB transaction;
- [ ] write payment event;
- [ ] test repeated webhook;
- [ ] test invalid signature.

Deliverable:

```text
Verified Sumopod webhook controls payment state.
```

## Phase 6 — checkout UI

Tasks:

- [ ] implement `/pay/:orderId`;
- [ ] implement amount/order summary;
- [ ] implement QR loading/success/failure states;
- [ ] implement countdown;
- [ ] implement status polling;
- [ ] implement paid transition animation/state;
- [ ] implement expired state;
- [ ] mobile responsive pass;
- [ ] accessibility pass.

Deliverable:

```text
Customer completes QRIS flow without leaving LYDEV Pay UI.
```

## Phase 7 — invoice/receipt

Tasks:

- [ ] invoice route;
- [ ] receipt route;
- [ ] protect receipt status rules;
- [ ] print CSS;
- [ ] avoid exposing provider secrets.

Deliverable:

```text
Payment has shareable LYDEV invoice and post-payment receipt pages.
```

## Phase 8 — internal API

Tasks:

- [ ] create Project model;
- [ ] API key issuance script/admin flow;
- [ ] API key verification;
- [ ] project-level rate limit;
- [ ] `POST /api/v1/payments`;
- [ ] `GET /api/v1/payments/:orderId`;
- [ ] idempotency header support;
- [ ] allowed return URL support;
- [ ] API documentation examples.

Deliverable:

```text
Other LYDEV projects can create payments through pay.lydev.id.
```

## Phase 9 — dashboard

Tasks:

- [ ] dashboard auth;
- [ ] KPI cards;
- [ ] payments table;
- [ ] search/filter;
- [ ] payment detail;
- [ ] event timeline;
- [ ] QR extraction diagnostics;
- [ ] safe retry action.

Deliverable:

```text
LYDEV Pay can be operated without database access.
```

## Phase 10 — production hardening

Tasks:

- [ ] production Sumopod config;
- [ ] production domain;
- [ ] TLS/security headers;
- [ ] rate limiting;
- [ ] log review;
- [ ] error monitoring;
- [ ] DB backups;
- [ ] migration workflow;
- [ ] reconciliation strategy;
- [ ] cleanup jobs;
- [ ] live low-value test;
- [ ] rollback plan.

Deliverable:

```text
Production-ready LYDEV Pay.
```

---

# 42. API response DTO examples

## Payment detail — customer-safe

```json
{
  "orderId": "LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
  "description": "Top Up 50K",
  "amount": 50000,
  "currency": "IDR",
  "status": "PENDING",
  "paymentMethod": "QRIS",
  "createdAt": "2026-09-25T13:00:00+07:00",
  "expiresAt": "2026-09-25T13:15:00+07:00",
  "paidAt": null,
  "qrUrl": "/api/v1/payments/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC/qr"
}
```

## Paid response

```json
{
  "orderId": "LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC",
  "amount": 50000,
  "currency": "IDR",
  "status": "PAID",
  "paidAt": "2026-09-25T13:04:22+07:00",
  "receiptUrl": "https://pay.lydev.id/receipt/LY-01K5XH4KQFPV8Y7NYQ6D4M7AZC"
}
```

---

# 43. Internal code boundaries

Keep these layers separate.

```text
Route handler
     |
     v
Payment Service
     |
     +------> Payment Repository -> Prisma
     |
     +------> Provider Adapter -> Sumopod
     |
     +------> QR Extractor
```

Routes must not directly contain:

- Prisma-heavy business logic;
- Sumopod parsing logic;
- HTML scraper selectors;
- payment transition rules.

This keeps provider changes isolated and makes tests easier.

---

# 44. Database transaction boundaries

Use DB transactions for critical state changes.

Webhook example:

```text
BEGIN
  check duplicate event
  fetch payment
  verify valid state transition
  update payment
  insert event
COMMIT
```

If event insertion fails, payment status should not be partially updated.

---

# 45. Concurrency handling

Expect simultaneous events:

- frontend poll;
- webhook;
- duplicate webhook;
- dashboard read;
- reconciliation job.

Critical updates should use transaction-safe conditions.

Concept:

```text
update payment
where id = X and status = PENDING
set status = PAID
```

Then inspect affected row count.

Do not assume only one request touches a transaction at a time.

---

# 46. Provider payment URL handling

The provider URL is sensitive operational data.

Rules:

- store server-side;
- do not show in frontend JSON;
- redact query parameters in logs;
- validate domain before use;
- never allow customer to overwrite it;
- delete or retain according to operational needs after transaction completion;
- never use it as an authentication token for LYDEV APIs.

---

# 47. Failure scenarios

## Sumopod API down

Customer receives controlled error:

```text
Pembayaran belum dapat dibuat. Silakan coba lagi.
```

Do not create a fake pending payment unless a provider transaction was actually created.

## Sumopod payment created but QR extraction fails

Keep payment `PENDING` and flag extraction failure internally.

Frontend:

```text
QR sedang disiapkan / gagal dimuat.
```

Offer controlled retry from backend.

## Webhook delayed

Checkout stays `PENDING` until verified.

Do not fake success based on elapsed time.

## Browser closes

Payment remains valid according to provider expiry. User may reopen:

```text
/pay/:orderId
```

## Duplicate create request

`Idempotency-Key` returns the original LYDEV payment rather than creating another Sumopod payment.

## Provider page DOM changes

Extractor fails closed, logs `QR_EXTRACTION_FAILED`, alerts operator, and does not return the wrong image.

---

# 48. Monitoring signals

At minimum track:

```text
payment create success rate
Sumopod API latency
QR extraction success rate
QR extraction mode (HTML/browser)
webhook verification failures
payments stuck pending
webhook processing latency
5xx response rate
DB latency
```

Alert-worthy conditions:

```text
QR extraction success < 95% over recent transactions
provider create failures spike
webhook signature failures spike
pending transactions older than expected threshold
application health endpoint unavailable
```

---

# 49. Backup and recovery

PostgreSQL production database must have backups.

Minimum:

- daily automated backup;
- documented restore procedure;
- backup retention suitable for project needs;
- credentials stored outside repository.

The payment/event ledger is more important than cached QR images.

If QR cache is lost, pending payments may attempt safe re-extraction from the stored provider URL if still valid.

---

# 50. CI/CD

Suggested pipeline:

```text
install
 -> lint
 -> typecheck
 -> unit tests
 -> integration tests
 -> build
 -> deploy staging
 -> smoke test
 -> production deployment
 -> prisma migrate deploy
```

Migration execution order must be deliberate for the chosen hosting platform.

Never run destructive migrations automatically without review.

---

# 51. Git strategy

Suggested branches:

```text
main      -> production-ready
staging   -> integration/testing (optional)
feat/*
fix/*
```

Do not commit:

- `.env`;
- live provider payloads containing secrets;
- production database dumps;
- screenshots containing active QR payments.

---

# 52. Coding rules for agents/contributors

Any AI coding agent or contributor implementing this plan must follow these rules:

1. Read `plans.md` before modifying architecture.
2. Do not replace TanStack Start with Next.js.
3. Do not move payment processing into the browser.
4. Do not expose the Sumopod API key to the client.
5. Do not expose the raw Sumopod payment URL in normal client responses.
6. Do not reverse proxy the Sumopod page.
7. Scrape/extract only the QR asset required for the current payment.
8. Do not bypass access controls or anti-bot protections.
9. Do not mark payments paid from frontend input.
10. Webhook/provider verification is authoritative.
11. Use database migrations; do not use production `db push`.
12. Do not hardcode secrets.
13. Do not invent undocumented Sumopod endpoints or field names.
14. Keep provider-specific logic inside the Sumopod adapter.
15. Keep QR selector logic inside the QR extractor.
16. Add tests for security-sensitive changes.
17. Fail closed when provider data is inconsistent.
18. Prefer small dependencies and server-side code for sensitive operations.
19. Preserve `pay.lydev.id` as the customer-facing domain.
20. Update this plan when an approved architecture decision changes.

---

# 53. Definition of Done — MVP

MVP is complete when all of the following work in Sandbox:

```text
[ ] TanStack Start app deployed at pay.lydev.id staging/preview.
[ ] PostgreSQL + Prisma migrations work.
[ ] LYDEV can create a Sumopod Sandbox payment.
[ ] Raw Sumopod payment URL remains server-side.
[ ] Backend extracts only the QR payment image/data.
[ ] QR is served from pay.lydev.id.
[ ] QR can be scanned successfully.
[ ] Checkout stays on LYDEV custom UI.
[ ] Sumopod webhook is authenticated.
[ ] Valid webhook changes PENDING -> PAID.
[ ] Invalid webhook cannot change status.
[ ] Duplicate webhook is safe.
[ ] Browser cannot self-report PAID.
[ ] Status automatically updates in UI.
[ ] Expiry is handled.
[ ] Invoice page works.
[ ] Paid receipt page works.
[ ] Basic dashboard works.
[ ] Semua halaman browser memerlukan login operator.
[ ] Endpoint project memerlukan API key, dan webhook memerlukan signature provider.
[ ] Rate limiting is active.
[ ] SSRF protection is tested.
[ ] Secrets are absent from frontend bundle/logs/repository.
[ ] Mobile checkout works.
[ ] Production checklist is documented.
```

---

# 54. Immediate next implementation tasks

Start in this exact order:

```text
1. Scaffold TanStack Start project with current CLI.
2. Add Tailwind, Zod, Prisma/PostgreSQL and logger.
3. Create database schema + first migration.
4. Create provider-neutral payment service/state machine.
5. Add Sumopod Sandbox adapter using verified API docs/credentials.
6. Create one Sandbox payment and capture paymentUrl.
7. Inspect one real payment page to determine exact QR rendering method.
8. Implement SSRF-safe QR extractor.
9. Serve QR from /api/v1/payments/:orderId/qr.
10. Build /pay/:orderId UI.
11. Implement and verify Sumopod webhook.
12. Add status polling and paid transition.
13. Build invoice/receipt.
14. Add internal project API keys + idempotency.
15. Add dashboard.
16. Harden, test, deploy, then switch to production Sumopod credentials.
```

Do **not** start with dashboard styling before steps 1–12 are proven. The payment integrity path is the core product.

---

# 55. Reference architecture notes

TanStack Start currently supports file-based routing, server routes for raw HTTP/external endpoints, server functions for app-internal server logic, full-document SSR, and a fetch-style server entry point suitable for multiple runtimes. Use the current official TanStack Start documentation during implementation because framework setup and adapter details can evolve.

Official references:

```text
https://tanstack.com/start/latest/docs/framework/react/overview
https://tanstack.com/start/latest/docs/framework/react/getting-started
https://tanstack.com/start/latest/docs/framework/react/guide/routing
https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
https://tanstack.com/start/latest/docs/framework/react/guide/server-entry-point
```

For Sumopod, use the current merchant/Sandbox documentation supplied by Sumopod for exact API endpoints, request fields, authentication, webhook verification and production requirements. If public documentation and merchant-dashboard documentation differ, implement against the contract applicable to the actual LYDEV merchant account.

---

# 56. Final architecture summary

```text
                         SUMOPOD PAY
                 +-----------------------+
                 | Create payment        |
                 | Hosted payment URL    |
                 | QR payment resource   |
                 | Webhook               |
                 +-----------+-----------+
                             |
                             | server only
                             v
+----------------------------------------------------------------+
|                         LYDEV PAY                               |
|                      pay.lydev.id                              |
|                                                                |
|  TanStack Start                                                |
|                                                                |
|  Payment Service                                               |
|      |                                                         |
|      +---- Sumopod Adapter                                     |
|      |                                                         |
|      +---- QR Extractor                                        |
|      |        |- HTML/Cheerio                                  |
|      |        `- Playwright fallback (only if needed)          |
|      |                                                         |
|      +---- Webhook Processor                                   |
|      |                                                         |
|      `---- PostgreSQL / Prisma                                 |
|                                                                |
|  Customer UI                                                   |
|      |- Checkout                                               |
|      |- QRIS                                                   |
|      |- Countdown                                              |
|      |- Live payment status                                    |
|      |- Invoice                                                |
|      `- Receipt                                                |
|                                                                |
|  Operator UI                                                   |
|      `- Dashboard                                              |
+----------------------------------------------------------------+
                             ^
                             |
                             |
                    Customer remains here
```

**Core rule:** Sumopod processes the money; LYDEV Pay owns the customer experience, orchestration, QR presentation, transaction records, webhook processing, invoice, receipt, and internal payment API.
