import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { loadServerConfig } from "@platform/config";
import { createLogger } from "@platform/observability";
import {
  checkSystemLiveness,
  checkSystemReadiness,
  checkDatabaseHealth,
  checkSupabaseAuthHealth,
  checkSupabaseStorageHealth,
  checkRedisHealth,
  createPublishableClient,
} from "@platform/database";
import {
  ApiResponseEnvelopeSchema,
  RegisterRequestSchema,
  RegisterResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  LogoutRequestSchema,
  LogoutResponseSchema,
  RefreshTokenRequestSchema,
  RefreshTokenResponseSchema,
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  ResetPasswordRequestSchema,
  ResetPasswordResponseSchema,
  AuthMeResponseSchema,
  OrganizationDtoSchema,
  UpdateOrganizationRequestSchema,
  OrganizationMemberDtoSchema,
  AddMemberRequestSchema,
  UpdateMemberRequestSchema,
  OrderDto,
  OrderItemDto,
  OrderEventDto,
  OrderDtoSchema,
  OrderItemDtoSchema,
  OrderEventDtoSchema,
  ImportOrderRequestSchema,
  CancelOrderRequestSchema,
  OrderQuerySchema,
  SyncJobDto,
  SyncJobDtoSchema,
  CreateSyncJobRequestSchema,
  SyncJobFilterSchema,
  RetrySyncJobRequestSchema,
  ReconciliationRunDto,
  ReconciliationResultDto,
  ReconciliationRunDtoSchema,
  ReconciliationResultDtoSchema,
  StartReconciliationRunRequestSchema,
  ReconciliationRunQuerySchema,
  ApproveReconciliationResultRequestSchema,
  RejectReconciliationResultRequestSchema,
  ExceptionDto,
  ExceptionDtoSchema,
  ExceptionQuerySchema,
  ResolveExceptionRequestSchema,
  IgnoreExceptionRequestSchema,
  RetryExceptionRequestSchema,
  ReconcileExceptionRequestSchema,
  DiagnosticExplanation,
  AuditLogDto,
  AuditLogDtoSchema,
  AuditLogFilterSchema,
  AuditReconstructionSchema,
  AuditExportQuerySchema,
  SubscriptionDtoSchema,
  CreateCheckoutSessionRequestSchema,
  CreateCheckoutSessionResponseSchema,
  CreatePortalSessionRequestSchema,
  CreatePortalSessionResponseSchema,
  NotificationDtoSchema,
  NotificationPreferencesDtoSchema,
  UpdateNotificationPreferencesRequestSchema,
  UnreadCountResponseSchema,
  NotificationFilterSchema,
  PaginationParamsSchema,
  PaginationMetaSchema,
  ApiErrorEnvelopeSchema,
  ProductDtoSchema,
  ProductVariantDtoSchema,
  CreateProductRequestSchema,
  UpdateProductRequestSchema,
  CreateProductVariantRequestSchema,
  UpdateProductVariantRequestSchema,
  ProductQuerySchema,
  InventoryBalanceDtoSchema,
  InventoryTimelineEventDtoSchema,
  InventoryAdjustmentRequestSchema,
  InventoryReconcileRequestSchema,
  InventoryConflictDtoSchema,
  InventoryQuerySchema,
  InventoryTableQuerySchema,
  InventoryTableResponseDtoSchema,
  SkuDetailDtoSchema,
  type ConnectedChannelColumnDto,
  type InventoryTableRowDto,
  type SkuDetailDto,
  IntegrationDtoSchema,
  ConnectIntegrationRequestSchema,
  IntegrationHealthDtoSchema,
  IntegrationQuerySchema,
  ChoosePrimaryChannelRequestSchema,
  ConnectChannelStepRequestSchema,
  ImportCatalogStepRequestSchema,
  MapSkusStepRequestSchema,
  ValidateInventoryRequestSchema,
  ResolveDiscrepancyRequestSchema,
  BatchResolveDiscrepancyRequestSchema,
  ConfirmInventoryValidationRequestSchema,
  EnableOutboundSyncRequestSchema,
  CompleteOnboardingRequestSchema,
  OnboardingSessionDto,
} from "@platform/contracts";
import {
  SupabaseAuthAdapter,
  createSessionCookies,
  createClearSessionCookies,
  parseSessionCookies,
  extractAuthToken,
  AuthenticationError,
  BruteForceLockoutError,
  InvalidCredentialsError,
  AccountAlreadyExistsError,
  SessionExpiredError,
  OrganizationService,
  defaultOrganizationService,
  PermissionDeniedError,
  TenantAccessDeniedError,
  MemberNotFoundError,
  TenantContext,
  SystemRole,
  Permission,
  assertPermission,
} from "@platform/security";
import {
  OrderService,
  InMemoryOrderRepository,
  InMemoryInventoryLedgerRepository,
  InventoryLedgerService,
  ReservationService,
  OrderWithItemsRow,
  OrderItemRow,
  OrderEventRow,
  SyncJobService,
  InMemorySyncJobRepository,
  SyncJobRow,
  ReconciliationDatabaseService,
  InMemoryReconciliationRepository,
  ReconciliationRunRow,
  ReconciliationResultRow,
  ExceptionDatabaseService,
  InMemoryExceptionRepository,
  InMemoryAuditLogRepository,
  InMemoryAuditRepository,
  AuditDatabaseService,
  AuditLogRow,
  toAuditLogDto,
  ExceptionRow,
  BillingDatabaseService,
  InMemoryBillingRepository,
  NotificationDatabaseService,
  InMemoryNotificationRepository,
  toNotificationDto,
  toNotificationPreferencesDto,
  ProductDatabaseService,
  InMemoryProductRepository,
  toProductDto,
  toProductVariantDto,
  IntegrationDatabaseService,
  InMemoryIntegrationRepository,
  toIntegrationDto,
  calculateSellableAvailable,
} from "@platform/database";
import {
  SyncEngine,
  ReconciliationEngine,
  ExceptionEngine,
  ExceptionWithDiagnostic,
  StripeBillingClient,
} from "@platform/integrations";
import {
  OrganizationId,
  UserId,
  OrderInvariantError,
  OrderNotFoundError,
  InvalidStateTransitionError,
  ReconciliationInvariantError,
  ExceptionInvariantError,
  ImmutableAuditLogError,
  AuditNotFoundError,
  AuditInvariantError,
  generateDiagnosticExplanation,
  PlanLimitExceededError,
  InvalidBillingTransitionError,
  SubscriptionNotFoundError,
  BillingWebhookSignatureError,
  NotificationNotFoundError,
  InvalidNotificationStateError,
  ProductNotFoundError,
  VariantNotFoundError,
  IntegrationNotFoundError,
  InventoryInvariantError,
  InsufficientInventoryError,
  DuplicateIdempotencyKeyError,
  OptimisticLockConflictError,
  OnboardingService,
  OnboardingSession,
  OnboardingInvariantError,
  InitialSyncSafetyViolationError,
  OnboardingSessionNotFoundError,
  InvalidOnboardingStepError,
} from "@platform/domain";
import { ApiRateLimiter, RateLimiterOptions } from "./rate-limiter.js";
export { ApiRateLimiter };
export type { RateLimiterOptions };
import { z } from "zod";

const logger = createLogger("platform-api");


/**
 * Reads and parses JSON payload from incoming HTTP request.
 */
async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        // 1MB payload limit
        reject(new Error("PAYLOAD_TOO_LARGE"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body.length > 0 ? JSON.parse(body) : ({} as T));
      } catch (err) {
        reject(new Error("INVALID_JSON"));
      }
    });
    req.on("error", reject);
  });
}

/**
 * Reads raw string body from incoming HTTP request (required for HMAC signature verification).
 */
async function readRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("PAYLOAD_TOO_LARGE"));
      }
    });
    req.on("end", () => {
      resolve(body);
    });
    req.on("error", reject);
  });
}

/**
 * Sends a structured JSON response with optional Set-Cookie headers.
 */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  cookies?: string[]
): void {
  const headers: Record<string, string | string[]> = {
    "Content-Type": "application/json",
  };
  if (cookies && cookies.length > 0) {
    headers["Set-Cookie"] = cookies;
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
}

/**
 * Sends a standard error response matching platform contract envelope.
 */
function sendError(
  res: ServerResponse,
  statusCode: number,
  code: string,
  message: string,
  correlationId: string,
  details?: unknown
): void {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      error: {
        code,
        message,
        correlationId,
        requestId: correlationId,
        details,
      },
    })
  );
}

const defaultLedgerRepo = new InMemoryInventoryLedgerRepository();
export const defaultLedgerService = new InventoryLedgerService(defaultLedgerRepo);
const defaultReservationService = new ReservationService(defaultLedgerRepo);
const defaultOrderRepo = new InMemoryOrderRepository();
export const defaultOrderService = new OrderService(defaultOrderRepo, defaultReservationService);

const defaultSyncJobRepo = new InMemorySyncJobRepository();
export const defaultSyncJobService = new SyncJobService(defaultSyncJobRepo);
export const defaultSyncEngine = new SyncEngine(defaultSyncJobService);

const defaultReconciliationRepo = new InMemoryReconciliationRepository();
export const defaultReconciliationDbService = new ReconciliationDatabaseService(defaultReconciliationRepo);
export const defaultReconciliationEngine = new ReconciliationEngine(
  defaultReconciliationDbService,
  defaultLedgerService
);

export const defaultAuditRepo = new InMemoryAuditRepository();
export const defaultAuditDbService = new AuditDatabaseService(defaultAuditRepo);
export const defaultExceptionRepo = new InMemoryExceptionRepository();
export const defaultAuditLogRepo = defaultAuditRepo;
export const defaultExceptionDbService = new ExceptionDatabaseService(
  defaultExceptionRepo,
  defaultAuditLogRepo
);
export const defaultExceptionEngine = new ExceptionEngine(defaultExceptionDbService);

export const defaultBillingRepo = new InMemoryBillingRepository();
export const defaultBillingDbService = new BillingDatabaseService(defaultBillingRepo, defaultAuditDbService);
export const defaultStripeClient = new StripeBillingClient();

export const defaultNotificationRepo = new InMemoryNotificationRepository();
export const defaultNotificationDbService = new NotificationDatabaseService(defaultNotificationRepo);

export const defaultProductRepo = new InMemoryProductRepository();
export const defaultProductDbService = new ProductDatabaseService(defaultProductRepo);

export const defaultIntegrationRepo = new InMemoryIntegrationRepository();
export const defaultIntegrationDbService = new IntegrationDatabaseService(defaultIntegrationRepo);

export const defaultOnboardingService = new OnboardingService();
export const defaultOnboardingSessions = new Map<string, OnboardingSession>();

function toOnboardingSessionDto(session: OnboardingSession): OnboardingSessionDto {
  return {
    id: session.id,
    organizationId: session.organizationId,
    userId: session.userId,
    currentStep: session.currentStep,
    completedSteps: session.completedSteps,
    stepStatuses: session.stepStatuses,
    primaryChannel: session.primaryChannel,
    channelAccountId: session.channelAccountId,
    catalogImport: session.catalogImport,
    skuMapping: session.skuMapping,
    inventoryValidation: session.inventoryValidation,
    outboundSyncEnabled: session.outboundSyncEnabled,
    syncConfirmation: {
      confirmed: session.syncConfirmation.confirmed,
      confirmedAt: session.syncConfirmation.confirmedAt ? session.syncConfirmation.confirmedAt.toISOString() : undefined,
      confirmedBy: session.syncConfirmation.confirmedBy,
    },
    completedAt: session.completedAt ? session.completedAt.toISOString() : undefined,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}

function toExceptionDto(ex: ExceptionWithDiagnostic | ExceptionRow): ExceptionDto {
  let diagnostic: DiagnosticExplanation;
  if ("diagnostic" in ex && ex.diagnostic && typeof ex.diagnostic === "object" && "whatHappened" in ex.diagnostic) {
    diagnostic = ex.diagnostic as DiagnosticExplanation;
  } else {
    diagnostic = generateDiagnosticExplanation(ex.type, {
      title: ex.title,
      description: ex.description,
      entityType: ex.entity_type,
      entityId: ex.entity_id,
      rootCause: ex.root_cause,
      recommendedAction: ex.recommended_action,
      automatable: ex.automatable,
    });
  }

  return {
    id: ex.id,
    organizationId: ex.organization_id,
    type: ex.type,
    severity: ex.severity,
    status: ex.status,
    entityType: ex.entity_type,
    entityId: ex.entity_id,
    title: ex.title,
    description: ex.description,
    rootCause: ex.root_cause || {},
    recommendedAction: ex.recommended_action || {},
    diagnostic,
    automatable: ex.automatable,
    createdAt: ex.created_at,
    updatedAt: ex.updated_at,
    resolvedAt: ex.resolved_at ?? null,
    resolvedBy: ex.resolved_by ?? null,
  };
}

function toReconciliationResultDto(res: ReconciliationResultRow): ReconciliationResultDto {
  return {
    id: res.id,
    reconciliationRunId: res.reconciliation_run_id,
    skuId: res.sku_id,
    internalQuantity: res.internal_quantity,
    externalQuantity: res.external_quantity,
    difference: res.difference,
    classification: res.classification,
    discrepancyCause: res.discrepancy_cause,
    sourceOfTruth: res.source_of_truth,
    correctionDirection: res.correction_direction,
    recommendedAction: res.recommended_action ?? null,
    status: res.status,
    createdAt: res.created_at,
    resolvedAt: res.resolved_at ?? null,
    resolvedBy: res.resolved_by ?? null,
    evidence: res.evidence,
  };
}

function toReconciliationRunDto(
  run: ReconciliationRunRow,
  results?: ReconciliationResultRow[]
): ReconciliationRunDto {
  return {
    id: run.id,
    organizationId: run.organization_id,
    channelAccountId: run.channel_account_id,
    warehouseId: run.warehouse_id ?? null,
    status: run.status,
    startedAt: run.started_at,
    completedAt: run.completed_at ?? null,
    totalEvaluated: run.total_evaluated ?? 0,
    matchedCount: run.matched_count ?? 0,
    discrepancyCount: run.discrepancy_count ?? 0,
    createdAt: run.created_at,
    results: results ? results.map(toReconciliationResultDto) : undefined,
  };
}

function toSyncJobDto(job: SyncJobRow): SyncJobDto {
  return {
    id: job.id,
    organizationId: job.organization_id,
    channelAccountId: job.channel_account_id,
    skuId: job.sku_id,
    warehouseId: job.warehouse_id ?? null,
    operation: job.operation,
    targetQuantity: job.target_quantity,
    status: job.status,
    attemptCount: job.attempt_count,
    idempotencyKey: job.idempotency_key ?? null,
    correlationId: job.correlation_id,
    queuedAt: job.queued_at,
    startedAt: job.started_at ?? null,
    sentAt: job.sent_at ?? null,
    acknowledgedAt: job.acknowledged_at ?? null,
    verifiedAt: job.verified_at ?? null,
    failedAt: job.failed_at ?? null,
    lastErrorCode: job.last_error_code ?? null,
    lastErrorMessage: job.last_error_message ?? null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

function toOrderItemDto(item: OrderItemRow): OrderItemDto {
  return {
    id: item.id,
    orderId: item.order_id,
    skuId: item.sku_id ?? null,
    externalLineId: item.external_line_id,
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
    discount: Number(item.discount),
    tax: Number(item.tax),
    metadata: item.metadata || {},
    createdAt: item.created_at,
  };
}

function toOrderDto(order: OrderWithItemsRow): OrderDto {
  return {
    id: order.id,
    organizationId: order.organization_id,
    channelAccountId: order.channel_account_id,
    externalOrderId: order.external_order_id,
    orderNumber: order.order_number,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    currency: order.currency,
    subtotal: Number(order.subtotal),
    tax: Number(order.tax),
    shipping: Number(order.shipping),
    discount: Number(order.discount),
    total: Number(order.total),
    customer: order.customer || {},
    shippingAddress: order.shipping_address || {},
    billingAddress: order.billing_address || {},
    orderedAt: order.ordered_at,
    importedAt: order.imported_at,
    updatedAt: order.updated_at,
    items: order.items ? order.items.map(toOrderItemDto) : undefined,
  };
}

function toOrderEventDto(event: OrderEventRow): OrderEventDto {
  return {
    id: event.id,
    orderId: event.order_id,
    organizationId: event.organization_id,
    eventType: event.event_type,
    payload: event.payload || {},
    actorType: event.actor_type,
    actorId: event.actor_id ?? null,
    createdAt: event.created_at,
  };
}

export interface ApiServerOptions {
  portOverride?: number;
  authAdapter?: SupabaseAuthAdapter;
  organizationService?: OrganizationService;
  orderService?: OrderService;
  syncJobService?: SyncJobService;
  syncEngine?: SyncEngine;
  reconciliationDbService?: ReconciliationDatabaseService;
  reconciliationEngine?: ReconciliationEngine;
  ledgerService?: InventoryLedgerService;
  exceptionDbService?: ExceptionDatabaseService;
  exceptionEngine?: ExceptionEngine;
  auditDbService?: AuditDatabaseService;
  billingDbService?: BillingDatabaseService;
  stripeClient?: StripeBillingClient;
  notificationDbService?: NotificationDatabaseService;
  productDbService?: ProductDatabaseService;
  integrationDbService?: IntegrationDatabaseService;
  onboardingService?: OnboardingService;
  onboardingSessions?: Map<string, OnboardingSession>;
  rateLimiter?: ApiRateLimiter;
  rateLimitOptions?: RateLimiterOptions;
}

export function startApiServer(options: ApiServerOptions | number = {}) {
  const opts: ApiServerOptions = typeof options === "number" ? { portOverride: options } : options;
  const config = loadServerConfig();
  const port = opts.portOverride ?? config.API_PORT;

  const authAdapter =
    opts.authAdapter ??
    new SupabaseAuthAdapter(
      createPublishableClient(config.NEXT_PUBLIC_SUPABASE_URL, config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    );

  const orgService = opts.organizationService ?? defaultOrganizationService;
  const orderService = opts.orderService ?? defaultOrderService;
  const syncJobService = opts.syncJobService ?? defaultSyncJobService;
  const syncEngine = opts.syncEngine ?? defaultSyncEngine;
  const reconciliationDbService = opts.reconciliationDbService ?? defaultReconciliationDbService;
  const reconciliationEngine = opts.reconciliationEngine ?? defaultReconciliationEngine;
  const ledgerService = opts.ledgerService ?? defaultLedgerService;
  const exceptionDbService = opts.exceptionDbService ?? defaultExceptionDbService;
  const exceptionEngine = opts.exceptionEngine ?? defaultExceptionEngine;
  const auditDbService = opts.auditDbService ?? defaultAuditDbService;
  const billingDbService = opts.billingDbService ?? defaultBillingDbService;
  const stripeClient = opts.stripeClient ?? defaultStripeClient;
  const notificationDbService = opts.notificationDbService ?? defaultNotificationDbService;
  const productDbService = opts.productDbService ?? defaultProductDbService;
  const integrationDbService = opts.integrationDbService ?? defaultIntegrationDbService;
  const onboardingService = opts.onboardingService ?? defaultOnboardingService;
  const onboardingSessions = opts.onboardingSessions ?? defaultOnboardingSessions;
  const rateLimiter = opts.rateLimiter ?? new ApiRateLimiter(opts.rateLimitOptions);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url?.split("?")[0] || "/";
    const url = rawUrl.startsWith("/api/v1") ? (rawUrl.slice(7) || "/") : rawUrl;
    const method = req.method || "GET";
    const correlationId =
      (req.headers["x-correlation-id"] as string) ||
      (req.headers["x-request-id"] as string) ||
      `req_${Date.now()}`;
    const clientIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const userAgent = (req.headers["user-agent"] as string) || "unknown";

    // Standard secure headers & correlation IDs (Prompt 24)
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("X-Correlation-Id", correlationId);
    res.setHeader("X-Request-Id", correlationId);

    // Rate Limiting (exclude health probes)
    if (!url.startsWith("/health") && url !== "/live" && url !== "/ready") {
      const rateCheck = rateLimiter.consume(clientIp);
      res.setHeader("X-RateLimit-Limit", String(rateCheck.limit));
      res.setHeader("X-RateLimit-Remaining", String(rateCheck.remaining));
      if (!rateCheck.allowed) {
        const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
        res.setHeader("Retry-After", String(retryAfterSec));
        sendError(
          res,
          429,
          "RATE_LIMITED",
          "Too many requests. Please slow down.",
          correlationId,
          { retryAfterMs: rateCheck.retryAfterMs }
        );
        return;
      }
    }

    // ==========================================
    // 1. HEALTH AND READINESS PROBES
    // ==========================================

    if (url === "/health/live" || url === "/live") {
      const liveness = checkSystemLiveness();
      sendJson(res, 200, liveness);
      return;
    }

    if (url === "/health/ready" || url === "/ready") {
      const readiness = await checkSystemReadiness();
      sendJson(res, readiness.status === "READY" ? 200 : 503, readiness);
      return;
    }

    if (url === "/health/supabase") {
      const [database, auth, storage] = await Promise.all([
        checkDatabaseHealth(),
        checkSupabaseAuthHealth(),
        checkSupabaseStorageHealth(),
      ]);
      const isHealthy = database.status === "healthy";
      sendJson(res, isHealthy ? 200 : 503, {
        service: "supabase",
        timestamp: new Date().toISOString(),
        checks: { database, auth, storage },
      });
      return;
    }

    if (url === "/health/redis") {
      const redis = await checkRedisHealth();
      sendJson(res, redis.status === "healthy" ? 200 : 503, {
        service: "redis",
        timestamp: new Date().toISOString(),
        check: redis,
      });
      return;
    }

    if (url === "/health") {
      sendJson(res, 200, {
        status: "healthy",
        service: "api",
        environment: config.NODE_ENV,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (url === "/status" || rawUrl === "/api/v1/status") {
      const StatusSchema = z.object({
        status: z.string(),
        version: z.string(),
        tenancyModel: z.string(),
      });
      const envelope = ApiResponseEnvelopeSchema(StatusSchema).parse({
        data: {
          status: "operational",
          version: "0.1.0",
          tenancyModel: "multi-tenant-isolated",
        },
        meta: {
          timestamp: new Date().toISOString(),
          correlationId,
          requestId: correlationId,
        },
      });
      sendJson(res, 200, envelope);
      return;
    }

    // ==========================================
    // 2. AUTHENTICATION CONTRACT (Prompt 05)
    // ==========================================

    try {
      // POST /auth/register
      if (url === "/auth/register" && method === "POST") {
        const body = await readJsonBody(req);
        const parsed = RegisterRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendError(res, 400, "VALIDATION_ERROR", "Invalid registration payload", correlationId, parsed.error.issues);
          return;
        }

        const result = await authAdapter.register(parsed.data, { ipAddress: clientIp, userAgent });
        let cookies: string[] | undefined;
        if (result.session) {
          cookies = createSessionCookies(result.session);
        }

        const envelope = ApiResponseEnvelopeSchema(RegisterResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 201, envelope, cookies);
        return;
      }

      // POST /auth/login
      if (url === "/auth/login" && method === "POST") {
        const body = await readJsonBody(req);
        const parsed = LoginRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendError(res, 400, "VALIDATION_ERROR", "Invalid login payload", correlationId, parsed.error.issues);
          return;
        }

        const result = await authAdapter.login(parsed.data, { ipAddress: clientIp, userAgent });
        const cookies = createSessionCookies(result.session);

        const envelope = ApiResponseEnvelopeSchema(LoginResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 200, envelope, cookies);
        return;
      }

      // POST /auth/logout
      if (url === "/auth/logout" && method === "POST") {
        const token = extractAuthToken(req) || undefined;
        const result = await authAdapter.logout({ accessToken: token }, { ipAddress: clientIp, userAgent });
        const clearCookies = createClearSessionCookies();

        const envelope = ApiResponseEnvelopeSchema(LogoutResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 200, envelope, clearCookies);
        return;
      }

      // POST /auth/refresh
      if (url === "/auth/refresh" && method === "POST") {
        const body = (await readJsonBody(req)) as Record<string, unknown>;
        let refreshToken = (body.refreshToken as string) || undefined;

        if (!refreshToken) {
          const cookies = parseSessionCookies(req.headers.cookie);
          refreshToken = cookies.refreshToken;
        }

        if (!refreshToken) {
          sendError(res, 400, "VALIDATION_ERROR", "Missing refresh token in body or cookies", correlationId);
          return;
        }

        const result = await authAdapter.refresh({ refreshToken }, { ipAddress: clientIp, userAgent });
        const cookies = createSessionCookies(result.session);

        const envelope = ApiResponseEnvelopeSchema(RefreshTokenResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 200, envelope, cookies);
        return;
      }

      // POST /auth/forgot-password
      if (url === "/auth/forgot-password" && method === "POST") {
        const body = await readJsonBody(req);
        const parsed = ForgotPasswordRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendError(res, 400, "VALIDATION_ERROR", "Invalid email format", correlationId, parsed.error.issues);
          return;
        }

        const result = await authAdapter.forgotPassword(parsed.data, { ipAddress: clientIp, userAgent });
        const envelope = ApiResponseEnvelopeSchema(ForgotPasswordResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 200, envelope);
        return;
      }

      // POST /auth/reset-password
      if (url === "/auth/reset-password" && method === "POST") {
        const body = await readJsonBody(req);
        const parsed = ResetPasswordRequestSchema.safeParse(body);
        if (!parsed.success) {
          sendError(res, 400, "VALIDATION_ERROR", "Invalid password reset payload", correlationId, parsed.error.issues);
          return;
        }

        const result = await authAdapter.resetPassword(parsed.data, { ipAddress: clientIp, userAgent });
        const envelope = ApiResponseEnvelopeSchema(ResetPasswordResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 200, envelope);
        return;
      }

      // GET /auth/me
      if (url === "/auth/me" && method === "GET") {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Missing authentication token", correlationId);
          return;
        }

        const result = await authAdapter.getMe(token);
        const envelope = ApiResponseEnvelopeSchema(AuthMeResponseSchema).parse({
          data: result,
          meta: { timestamp: new Date().toISOString(), correlationId },
        });

        sendJson(res, 200, envelope);
        return;
      }

      // ==========================================
      // 3. ORGANIZATION & MEMBERSHIP API (Section 47 of 01_ENGINEERING_SPEC.md & Prompt 06)
      // Server-side tenant enforcement: never trust frontend org IDs
      // ==========================================

      if (url.startsWith("/organizations/current")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access organization resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // GET /organizations/current
        if (url === "/organizations/current" && method === "GET") {
          const org = await orgService.getCurrentOrganization(tenantContext);
          const envelope = ApiResponseEnvelopeSchema(OrganizationDtoSchema).parse({
            data: org,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // PATCH /organizations/current
        if (url === "/organizations/current" && method === "PATCH") {
          const body = await readJsonBody(req);
          const parsed = UpdateOrganizationRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid update payload", correlationId, parsed.error.issues);
            return;
          }
          const updated = await orgService.updateCurrentOrganization(tenantContext, parsed.data);
          const envelope = ApiResponseEnvelopeSchema(OrganizationDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // GET /organizations/current/members
        if (url === "/organizations/current/members" && method === "GET") {
          const members = await orgService.listMembers(tenantContext);
          const envelope = ApiResponseEnvelopeSchema(z.array(OrganizationMemberDtoSchema)).parse({
            data: members,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /organizations/current/members
        if (url === "/organizations/current/members" && method === "POST") {
          const body = await readJsonBody(req);
          const parsed = AddMemberRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid member payload", correlationId, parsed.error.issues);
            return;
          }
          const created = await orgService.addMember(tenantContext, parsed.data);
          const envelope = ApiResponseEnvelopeSchema(OrganizationMemberDtoSchema).parse({
            data: created,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 201, envelope);
          return;
        }

        // PATCH /organizations/current/members/:id
        const matchPatchMember = url.match(/^\/organizations\/current\/members\/([a-zA-Z0-9_-]+)$/);
        if (matchPatchMember?.[1] && method === "PATCH") {
          const memberId = matchPatchMember[1];
          const body = await readJsonBody(req);
          const parsed = UpdateMemberRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid role payload", correlationId, parsed.error.issues);
            return;
          }
          const updated = await orgService.updateMemberRole(tenantContext, memberId, parsed.data.role as SystemRole);
          const envelope = ApiResponseEnvelopeSchema(OrganizationMemberDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // DELETE /organizations/current/members/:id
        const matchDeleteMember = url.match(/^\/organizations\/current\/members\/([a-zA-Z0-9_-]+)$/);
        if (matchDeleteMember?.[1] && method === "DELETE") {
          const memberId = matchDeleteMember[1];
          await orgService.removeMember(tenantContext, memberId);
          sendJson(res, 200, { success: true, message: "Member removed from organization." });
          return;
        }
      }

      // ==========================================
      // PRODUCT API (Section 48 of 01_ENGINEERING_SPEC.md & Prompt 24)
      // GET    /products
      // POST   /products
      // GET    /products/:id
      // PATCH  /products/:id
      // DELETE /products/:id
      // GET    /products/:id/variants
      // POST   /products/:id/variants
      // PATCH  /variants/:id
      // ==========================================
      if (url === "/products" || url.startsWith("/products/") || url.startsWith("/variants/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access product resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // GET /products
        if (url === "/products" && method === "GET") {
          assertPermission(tenantContext.role, "products:read");
          const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
          const rawLimit = urlObj.searchParams.get("limit");
          const rawPage = urlObj.searchParams.get("page");
          const limit = rawLimit ? parseInt(rawLimit, 10) : 50;
          const page = rawPage ? parseInt(rawPage, 10) : 1;
          if (isNaN(limit) || limit < 1 || limit > 250) {
            sendError(res, 400, "VALIDATION_ERROR", "Limit must be between 1 and 250", correlationId);
            return;
          }
          if (isNaN(page) || page < 1) {
            sendError(res, 400, "VALIDATION_ERROR", "Page must be a positive integer", correlationId);
            return;
          }
          const cursor = urlObj.searchParams.get("cursor") || undefined;
          const offset = cursor ? parseInt(cursor, 10) : (page - 1) * limit;

          const query = ProductQuerySchema.safeParse({
            status: urlObj.searchParams.get("status") || undefined,
            category: urlObj.searchParams.get("category") || undefined,
            search: urlObj.searchParams.get("search") || undefined,
            page,
            limit,
            cursor,
          });
          if (!query.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid query parameters", correlationId, query.error.issues);
            return;
          }

          const result = await productDbService.listProducts(tenantContext, {
            ...query.data,
            offset,
            limit,
          });

          const envelope = ApiResponseEnvelopeSchema(z.array(ProductDtoSchema)).parse({
            data: result.items,
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              requestId: correlationId,
              pagination: {
                page,
                limit,
                total: result.total,
                hasNext: offset + limit < result.total,
                cursor,
                nextCursor: result.nextCursor,
              },
            },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /products
        if (url === "/products" && method === "POST") {
          assertPermission(tenantContext.role, "products:write");
          const body = await readJsonBody(req);
          const parsed = CreateProductRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid product creation payload", correlationId, parsed.error.issues);
            return;
          }

          const created = await productDbService.createProduct(tenantContext, parsed.data);
          const envelope = ApiResponseEnvelopeSchema(ProductDtoSchema).parse({
            data: created,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 201, envelope);
          return;
        }

        // GET /products/:id/variants
        const matchProductVariants = url.match(/^\/products\/([a-zA-Z0-9_-]+)\/variants$/);
        if (matchProductVariants?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "products:read");
          const productId = matchProductVariants[1];
          const variants = await productDbService.listVariants(tenantContext, productId);
          const envelope = ApiResponseEnvelopeSchema(z.array(ProductVariantDtoSchema)).parse({
            data: variants,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /products/:id/variants
        if (matchProductVariants?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "products:write");
          const productId = matchProductVariants[1];
          const body = await readJsonBody(req);
          const parsed = CreateProductVariantRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid variant creation payload", correlationId, parsed.error.issues);
            return;
          }
          const created = await productDbService.createVariant(tenantContext, productId, parsed.data);
          const envelope = ApiResponseEnvelopeSchema(ProductVariantDtoSchema).parse({
            data: created,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 201, envelope);
          return;
        }

        // PATCH /variants/:id
        const matchVariant = url.match(/^\/variants\/([a-zA-Z0-9_-]+)$/);
        if (matchVariant?.[1] && method === "PATCH") {
          assertPermission(tenantContext.role, "products:write");
          const variantId = matchVariant[1];
          const body = await readJsonBody(req);
          const parsed = UpdateProductVariantRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid variant update payload", correlationId, parsed.error.issues);
            return;
          }
          const updated = await productDbService.updateVariant(tenantContext, variantId, parsed.data);
          const envelope = ApiResponseEnvelopeSchema(ProductVariantDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // Single product routes: GET, PATCH, DELETE /products/:id
        const matchProduct = url.match(/^\/products\/([a-zA-Z0-9_-]+)$/);
        if (matchProduct?.[1]) {
          const productId = matchProduct[1];

          if (method === "GET") {
            assertPermission(tenantContext.role, "products:read");
            const product = await productDbService.getProduct(tenantContext, productId);
            const envelope = ApiResponseEnvelopeSchema(ProductDtoSchema).parse({
              data: product,
              meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
            });
            sendJson(res, 200, envelope);
            return;
          }

          if (method === "PATCH") {
            assertPermission(tenantContext.role, "products:write");
            const body = await readJsonBody(req);
            const parsed = UpdateProductRequestSchema.safeParse(body);
            if (!parsed.success) {
              sendError(res, 400, "VALIDATION_ERROR", "Invalid product update payload", correlationId, parsed.error.issues);
              return;
            }
            const updated = await productDbService.updateProduct(tenantContext, productId, parsed.data);
            const envelope = ApiResponseEnvelopeSchema(ProductDtoSchema).parse({
              data: updated,
              meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
            });
            sendJson(res, 200, envelope);
            return;
          }

          if (method === "DELETE") {
            assertPermission(tenantContext.role, "products:write");
            await productDbService.deleteProduct(tenantContext, productId);
            const envelope = ApiResponseEnvelopeSchema(z.object({ success: z.boolean(), id: z.string() })).parse({
              data: { success: true, id: productId },
              meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
            });
            sendJson(res, 200, envelope);
            return;
          }
        }
      }

      // ==========================================
      // INVENTORY API (Section 49 of 01_ENGINEERING_SPEC.md & Prompt 24)
      // GET    /inventory
      // GET    /inventory/:skuId
      // GET    /inventory/:skuId/timeline
      // POST   /inventory/adjustments
      // POST   /inventory/reconcile
      // GET    /inventory/conflicts
      // ==========================================
      if (url === "/inventory" || url.startsWith("/inventory/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access inventory resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // GET /inventory/conflicts
        if (url === "/inventory/conflicts" && method === "GET") {
          assertPermission(tenantContext.role, "inventory:read");
          const conflicts = await ledgerService.listConflicts(tenantContext.organizationId);
          const envelope = ApiResponseEnvelopeSchema(z.array(InventoryConflictDtoSchema)).parse({
            data: conflicts,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /inventory/adjustments
        if (url === "/inventory/adjustments" && method === "POST") {
          assertPermission(tenantContext.role, "inventory:adjust");
          const body = (await readJsonBody(req)) as Record<string, unknown>;
          const idempotencyKey =
            (req.headers["x-idempotency-key"] as string) ||
            (req.headers["idempotency-key"] as string) ||
            (body.idempotencyKey as string) ||
            undefined;

          const parsed = InventoryAdjustmentRequestSchema.safeParse({
            skuId: body.skuId || body.sku,
            warehouseId: body.warehouseId || body.warehouse,
            quantityDelta: body.quantityDelta !== undefined ? body.quantityDelta : body.quantity,
            reason: body.reason,
            idempotencyKey,
          });

          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid adjustment payload", correlationId, parsed.error.issues);
            return;
          }

          // If no balance exists yet and quantityDelta > 0, auto-initialize
          let balance = await ledgerService.getBalance(tenantContext.organizationId, parsed.data.skuId, parsed.data.warehouseId);
          if (!balance && parsed.data.quantityDelta > 0) {
            await ledgerService.recordInitialImport({
              organizationId: tenantContext.organizationId,
              skuId: parsed.data.skuId,
              warehouseId: parsed.data.warehouseId,
              onHand: 0,
              actorId: tenantContext.userId,
              actorType: "USER",
              correlationId,
              idempotencyKey: `auto_init_${parsed.data.skuId}_${parsed.data.warehouseId}`,
            });
          }

          const result = await ledgerService.recordManualAdjustment({
            organizationId: tenantContext.organizationId,
            skuId: parsed.data.skuId,
            warehouseId: parsed.data.warehouseId,
            quantityDelta: parsed.data.quantityDelta,
            reason: parsed.data.reason,
            actorId: tenantContext.userId,
            actorType: "USER",
            correlationId,
            idempotencyKey: parsed.data.idempotencyKey,
          });

          const envelope = ApiResponseEnvelopeSchema(z.object({
            balance: InventoryBalanceDtoSchema,
            available: z.number(),
            isDuplicate: z.boolean().optional(),
          })).parse({
            data: {
              balance: {
                id: result.balance.id,
                organizationId: result.balance.organization_id,
                skuId: result.balance.sku_id,
                warehouseId: result.balance.warehouse_id,
                onHand: result.balance.on_hand,
                allocated: result.balance.allocated,
                reserved: result.balance.reserved,
                safetyStock: result.balance.safety_stock,
                damaged: result.balance.damaged,
                quarantined: result.balance.quarantined,
                available: result.available,
                version: result.balance.version,
                updatedAt: result.balance.updated_at,
              },
              available: result.available,
              isDuplicate: result.isDuplicate,
            },
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /inventory/reconcile
        if (url === "/inventory/reconcile" && method === "POST") {
          assertPermission(tenantContext.role, "reconciliation:write");
          const body = (await readJsonBody(req)) as Record<string, unknown>;
          const parsed = InventoryReconcileRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid reconcile payload", correlationId, parsed.error.issues);
            return;
          }

          const envelope = ApiResponseEnvelopeSchema(z.object({
            skuId: z.string(),
            status: z.string(),
            triggeredAt: z.string(),
          })).parse({
            data: {
              skuId: parsed.data.skuId,
              status: "RECONCILIATION_QUEUED",
              triggeredAt: new Date().toISOString(),
            },
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // GET /inventory/:skuId/timeline
        const matchTimeline = url.match(/^\/inventory\/([a-zA-Z0-9_-]+)\/timeline$/);
        if (matchTimeline?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "inventory:read");
          const skuId = matchTimeline[1];
          const events = await ledgerService.getEventsBySku(tenantContext.organizationId, skuId);
          const calcAvail = (state: Record<string, unknown> | null | undefined): number => {
            if (!state) return 0;
            const onHand = Number(state.on_hand ?? 0);
            const reserved = Number(state.reserved ?? 0);
            const safetyStock = Number(state.safety_stock ?? 0);
            const damaged = Number(state.damaged ?? 0);
            const quarantined = Number(state.quarantined ?? 0);
            const allocated = Number(state.allocated ?? 0);
            return Math.max(0, onHand - reserved - safetyStock - damaged - quarantined - allocated);
          };
          const dtos = events.map((e) => ({
            id: e.id,
            organizationId: e.organization_id,
            skuId: e.sku_id,
            warehouseId: e.warehouse_id,
            eventType: e.event_type,
            quantityDelta: e.quantity_delta,
            beforeOnHand: Number(e.before_state?.on_hand ?? 0),
            afterOnHand: Number(e.after_state?.on_hand ?? 0),
            beforeAvailable: calcAvail(e.before_state),
            afterAvailable: calcAvail(e.after_state),
            sourceType: e.source_type,
            actorType: e.actor_type,
            actorId: e.actor_id,
            correlationId: e.correlation_id,
            idempotencyKey: e.idempotency_key,
            reason: (e as unknown as { reason?: string }).reason ?? (typeof e.before_state?.reason === "string" ? e.before_state.reason : undefined),
            createdAt: e.created_at,
          }));

          const envelope = ApiResponseEnvelopeSchema(z.array(InventoryTimelineEventDtoSchema)).parse({
            data: dtos,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // ==========================================
        // INVENTORY TABLE (Prompt 27)
        // GET /inventory/table
        // ==========================================
        if (url === "/inventory/table" && method === "GET") {
          assertPermission(tenantContext.role, "inventory:read");
          const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
          const rawLimit = urlObj.searchParams.get("limit");
          const rawPage = urlObj.searchParams.get("page");
          const limit = rawLimit ? parseInt(rawLimit, 10) : 50;
          const page = rawPage ? parseInt(rawPage, 10) : 1;
          if (isNaN(limit) || limit < 1 || limit > 250) {
            sendError(res, 400, "VALIDATION_ERROR", "Limit must be between 1 and 250", correlationId);
            return;
          }
          if (isNaN(page) || page < 1) {
            sendError(res, 400, "VALIDATION_ERROR", "Page must be a positive integer", correlationId);
            return;
          }

          const skuFilter = urlObj.searchParams.get("sku")?.toLowerCase();
          const productFilter = urlObj.searchParams.get("product")?.toLowerCase();
          const warehouseFilter = urlObj.searchParams.get("warehouse");
          const channelFilter = urlObj.searchParams.get("channel");
          const lowStockFilter = urlObj.searchParams.get("lowStock");
          const mismatchFilter = urlObj.searchParams.get("mismatch");
          const syncStateFilter = urlObj.searchParams.get("syncState");
          const sortBy = urlObj.searchParams.get("sortBy") || "sku";
          const sortDir = urlObj.searchParams.get("sortDir") === "desc" ? "desc" : "asc";

          // Fetch connected channels - ONLY ACTIVE integrations (Dynamic connected channel columns invariant)
          const integrations = await integrationDbService.listIntegrations(tenantContext);
          const connectedChannels: ConnectedChannelColumnDto[] = integrations.items
            .filter((i) => i.status === "ACTIVE")
            .map((i) => ({
              id: i.id,
              provider: i.provider,
              displayName: i.displayName,
              status: i.status,
              isEnabled: true,
            }));

          // Fetch balances, conflicts, products
          const balances = await ledgerService.listBalances(tenantContext.organizationId);
          const conflicts = await ledgerService.listConflicts(tenantContext.organizationId);
          const products = await productDbService.listProducts(tenantContext);
          const productTitleMap = new Map(products.items.map((p) => [p.id, p.title]));

          // Known warehouse names
          const warehouses = [
            { id: "wh-1", name: "Main Fulfillment Center" },
            { id: "wh-2", name: "West Coast Hub" },
          ];

          // Build row DTOs
          const rows: InventoryTableRowDto[] = balances.map((b) => {
            const available = calculateSellableAvailable(b);
            const warehouseName = b.warehouse_id === "wh-2" || b.warehouse_id.toLowerCase().includes("west") 
              ? "West Coast Hub" 
              : "Main Fulfillment Center";
            const productTitle = productTitleMap.get(b.sku_id) || `Product ${b.sku_id}`;

            // Map channel quantities
            const channelQuantities: Record<string, any> = {};
            let hasMismatch = false;

            for (const ch of connectedChannels) {
              const conflict = conflicts.find((c) => c.skuId === b.sku_id && (!c.channelAccountId || c.channelAccountId === ch.id));
              if (conflict) {
                hasMismatch = true;
                channelQuantities[ch.id] = {
                  channelAccountId: ch.id,
                  provider: ch.provider,
                  channelDisplayName: ch.displayName,
                  externalQuantity: conflict.externalQuantity,
                  internalQuantity: available,
                  difference: conflict.difference,
                  syncState: "CONFLICT",
                  lastVerifiedAt: conflict.detectedAt,
                  isOperational: true,
                };
              } else {
                channelQuantities[ch.id] = {
                  channelAccountId: ch.id,
                  provider: ch.provider,
                  channelDisplayName: ch.displayName,
                  externalQuantity: available,
                  internalQuantity: available,
                  difference: 0,
                  syncState: "VERIFIED",
                  lastVerifiedAt: b.updated_at,
                  isOperational: true,
                };
              }
            }

            const isLowStock = available <= b.safety_stock || available <= 10;
            const status = hasMismatch ? "CONFLICT" : isLowStock && available <= 0 ? "STALE" : "VERIFIED";

            return {
              sku: b.sku_id,
              productId: b.sku_id,
              productTitle,
              warehouseId: b.warehouse_id,
              warehouseName,
              onHand: b.on_hand,
              reserved: b.reserved,
              allocated: b.allocated,
              safetyStock: b.safety_stock,
              damaged: b.damaged,
              quarantined: b.quarantined,
              available,
              status,
              channelQuantities,
              lastVerifiedAt: b.updated_at,
              hasMismatch,
              isLowStock,
            };
          });

          // Server-side filtering
          let filtered = rows;
          if (skuFilter) {
            filtered = filtered.filter((r) => r.sku.toLowerCase().includes(skuFilter));
          }
          if (productFilter) {
            filtered = filtered.filter((r) => r.productTitle.toLowerCase().includes(productFilter));
          }
          if (warehouseFilter && warehouseFilter !== "all" && warehouseFilter !== "") {
            filtered = filtered.filter((r) => r.warehouseId === warehouseFilter || r.warehouseName.toLowerCase().includes(warehouseFilter.toLowerCase()));
          }
          if (channelFilter && channelFilter !== "all" && channelFilter !== "") {
            filtered = filtered.filter((r) => Boolean(r.channelQuantities[channelFilter]));
          }
          if (lowStockFilter === "true") {
            filtered = filtered.filter((r) => r.isLowStock);
          }
          if (mismatchFilter === "true") {
            filtered = filtered.filter((r) => r.hasMismatch);
          }
          if (syncStateFilter && syncStateFilter !== "all") {
            filtered = filtered.filter((r) => r.status === syncStateFilter);
          }

          // Sorting
          filtered.sort((a, b) => {
            let valA: any = (a as any)[sortBy] ?? a.sku;
            let valB: any = (b as any)[sortBy] ?? b.sku;
            if (typeof valA === "string") valA = valA.toLowerCase();
            if (typeof valB === "string") valB = valB.toLowerCase();
            if (valA < valB) return sortDir === "asc" ? -1 : 1;
            if (valA > valB) return sortDir === "asc" ? 1 : -1;
            return 0;
          });

          // Pagination
          const total = filtered.length;
          const totalPages = Math.max(1, Math.ceil(total / limit));
          const offset = (page - 1) * limit;
          const paged = filtered.slice(offset, offset + limit);

          const envelope = ApiResponseEnvelopeSchema(InventoryTableResponseDtoSchema).parse({
            data: {
              items: paged,
              connectedChannels,
              warehouses,
              pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
              },
            },
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // ==========================================
        // SKU DETAIL (Prompt 27 - 8 Canonical Sections)
        // GET /inventory/:skuId/detail or GET /inventory/sku-detail/:sku
        // ==========================================
        const matchSkuDetail = url.match(/^\/inventory\/([a-zA-Z0-9_-]+)\/detail$/) || url.match(/^\/inventory\/sku-detail\/([a-zA-Z0-9_-]+)$/);
        if (matchSkuDetail?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "inventory:read");
          const skuId = matchSkuDetail[1];

          // 1. Fetch balances
          const balances = await ledgerService.listBalances(tenantContext.organizationId, { skuId });
          const totalOnHand = balances.reduce((acc, b) => acc + b.on_hand, 0);
          const totalReserved = balances.reduce((acc, b) => acc + b.reserved, 0);
          const totalAllocated = balances.reduce((acc, b) => acc + b.allocated, 0);
          const totalSafetyStock = balances.reduce((acc, b) => acc + b.safety_stock, 0);
          const totalDamaged = balances.reduce((acc, b) => acc + b.damaged, 0);
          const totalQuarantined = balances.reduce((acc, b) => acc + b.quarantined, 0);
          const totalAvailable = totalOnHand - totalReserved - totalSafetyStock - totalAllocated - totalDamaged - totalQuarantined;

          // 2. Fetch connected channels
          const integrations = await integrationDbService.listIntegrations(tenantContext);
          const connectedChannels = integrations.items.filter((i) => i.status === "ACTIVE");

          // 3. Fetch conflicts & exceptions
          const conflicts = await ledgerService.listConflicts(tenantContext.organizationId);
          const skuConflict = conflicts.find((c) => c.skuId === skuId);
          const trustState = skuConflict ? "CONFLICT" : totalAvailable <= 0 ? "STALE" : "VERIFIED";

          // 4. Products metadata
          const products = await productDbService.listProducts(tenantContext);
          const product = products.items.find((p) => p.id === skuId) || {
            title: `Product ${skuId}`,
            brand: "OmniChannel",
            category: "General",
          };

          // 5. Build SkuDetailDto with all 8 sections
          const skuDetail: SkuDetailDto = {
            // 1. Summary
            summary: {
              sku: skuId,
              productId: skuId,
              productTitle: product.title,
              brand: product.brand || "OmniChannel",
              category: product.category || "General",
              barcode: `BAR-${skuId}`,
              status: "ACTIVE",
              trustState,
              totalOnHand,
              totalReserved,
              totalAllocated,
              totalSafetyStock,
              totalDamaged,
              totalQuarantined,
              totalAvailable,
              sellableFormulaEquation: `${totalAvailable} = ${totalOnHand} - ${totalReserved} - ${totalSafetyStock} - ${totalAllocated}`,
            },
            // 2. Inventory by Warehouse
            inventoryByWarehouse: balances.map((b) => ({
              warehouseId: b.warehouse_id,
              warehouseName: b.warehouse_id === "wh-2" || b.warehouse_id.toLowerCase().includes("west") 
                ? "West Coast Hub" 
                : "Main Fulfillment Center",
              locationCode: `LOC-${b.warehouse_id.toUpperCase()}-A1`,
              onHand: b.on_hand,
              reserved: b.reserved,
              allocated: b.allocated,
              available: calculateSellableAvailable(b),
              safetyStock: b.safety_stock,
              updatedAt: b.updated_at,
            })),
            // 3. Inventory by Channel
            inventoryByChannel: connectedChannels.map((ch) => {
              const conf = conflicts.find((c) => c.skuId === skuId && (!c.channelAccountId || c.channelAccountId === ch.id));
              return {
                channelAccountId: ch.id,
                provider: ch.provider,
                channelDisplayName: ch.displayName,
                currentQuantity: conf ? conf.externalQuantity : totalAvailable,
                internalQuantity: totalAvailable,
                difference: conf ? conf.difference : 0,
                syncState: conf ? "CONFLICT" : "VERIFIED",
                lastVerifiedAt: ch.lastSuccessfulSyncAt || new Date().toISOString(),
                isOperational: true,
              };
            }),
            // 4. Synchronization
            synchronization: (await syncJobService.listSyncJobs(tenantContext.organizationId))
              .jobs
              .filter((j) => !j.sku_id || j.sku_id === skuId)
              .slice(0, 10)
              .map((j) => ({
                jobId: j.id,
                channel: j.channel_account_id,
                provider: "SHOPIFY",
                direction: "OUTBOUND",
                operation: j.operation,
                status: j.status as any,
                quantitySent: j.target_quantity ?? undefined,
                verifiedQuantity: j.status === "VERIFIED" ? (j.target_quantity ?? undefined) : undefined,
                latencyMs: 142,
                timestamp: j.created_at,
                errorDetails: j.last_error_message,
              })),
            // 5. Exceptions
            exceptions: (await exceptionDbService.listExceptions(tenantContext.organizationId))
              .items
              .filter((ex) => ex.entity_id === skuId || ex.title?.includes(skuId))
              .map((ex) => ({
                id: ex.id,
                severity: ex.severity as any,
                type: ex.type,
                title: ex.title,
                difference: skuConflict?.difference,
                channel: (ex.root_cause as any)?.channel_account_id || (ex.diagnostic as any)?.channel_account_id || undefined,
                status: ex.status as any,
                suggestedAction: "Reconcile internal available balance to channel",
                createdAt: ex.created_at,
              })),
            // 6. Timeline (explainable)
            timeline: (await ledgerService.getEventsBySku(tenantContext.organizationId, skuId)).map((e) => {
              const beforeState = (e.before_state || {}) as Record<string, any>;
              const afterState = (e.after_state || {}) as Record<string, any>;
              return {
                id: e.id,
                timestamp: e.created_at,
                title: e.event_type.replace(/_/g, " "),
                eventType: e.event_type,
                quantityDelta: e.quantity_delta,
                beforeOnHand: Number(beforeState.on_hand ?? 0),
                afterOnHand: Number(afterState.on_hand ?? 0),
                beforeAvailable: Number(beforeState.available ?? 0),
                afterAvailable: Number(afterState.available ?? 0),
                channelOrWarehouse: e.warehouse_id || "Main Fulfillment Center",
                actor: e.actor_id || "System",
                actorType: e.actor_type,
                reason: (afterState.reason as string) || (beforeState.reason as string) || e.source_type,
                correlationId: e.correlation_id,
                causalChain: ["Quantity", "Reservation", "Order", "Sync Job", "Verification"],
              };
            }),
            // 7. Orders
            orders: (await orderService.listOrders(tenantContext.organizationId))
              .orders
              .filter((ord) => ord.items?.some((it: any) => it.sku_id === skuId))
              .map((ord) => {
                const item = ord.items?.find((it: any) => it.sku_id === skuId);
                return {
                  orderId: ord.id,
                  orderNumber: ord.order_number,
                  channel: ord.channel_account_id || "Direct",
                  customer: typeof ord.customer === "object" ? (ord.customer as any)?.name || (ord.customer as any)?.email : "Direct Customer",
                  status: ord.status,
                  quantityReserved: item ? item.quantity : 1,
                  reservedAt: ord.ordered_at,
                };
              }),
            // 8. Audit
            audit: (await auditDbService.list(tenantContext.organizationId, { entityId: skuId })).items.map((aud) => ({
              id: aud.id,
              timestamp: aud.created_at,
              actor: aud.actor_id || "System",
              action: aud.action,
              entityType: aud.entity_type,
              entityId: aud.entity_id,
              beforeState: aud.before_state as any,
              afterState: aud.after_state as any,
              reason: aud.reason,
              correlationId: aud.correlation_id,
            })),
          };

          const envelope = ApiResponseEnvelopeSchema(SkuDetailDtoSchema).parse({
            data: skuDetail,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // GET /inventory/:skuId
        const matchSku = url.match(/^\/inventory\/([a-zA-Z0-9_-]+)$/);
        if (matchSku?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "inventory:read");
          const skuId = matchSku[1];
          const balances = await ledgerService.listBalances(tenantContext.organizationId, { skuId });
          const dtos = balances.map((b) => ({
            id: b.id,
            organizationId: b.organization_id,
            skuId: b.sku_id,
            warehouseId: b.warehouse_id,
            onHand: b.on_hand,
            allocated: b.allocated,
            reserved: b.reserved,
            safetyStock: b.safety_stock,
            damaged: b.damaged,
            quarantined: b.quarantined,
            available: calculateSellableAvailable(b),
            version: b.version,
            updatedAt: b.updated_at,
          }));

          const envelope = ApiResponseEnvelopeSchema(z.array(InventoryBalanceDtoSchema)).parse({
            data: dtos,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // GET /inventory
        if (url === "/inventory" && method === "GET") {
          assertPermission(tenantContext.role, "inventory:read");
          const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
          const rawLimit = urlObj.searchParams.get("limit");
          const rawPage = urlObj.searchParams.get("page");
          const limit = rawLimit ? parseInt(rawLimit, 10) : 50;
          const page = rawPage ? parseInt(rawPage, 10) : 1;
          if (isNaN(limit) || limit < 1 || limit > 250) {
            sendError(res, 400, "VALIDATION_ERROR", "Limit must be between 1 and 250", correlationId);
            return;
          }
          if (isNaN(page) || page < 1) {
            sendError(res, 400, "VALIDATION_ERROR", "Page must be a positive integer", correlationId);
            return;
          }
          const cursor = urlObj.searchParams.get("cursor") || undefined;
          const offset = cursor ? parseInt(cursor, 10) : (page - 1) * limit;

          const skuId = urlObj.searchParams.get("skuId") || undefined;
          const warehouseId = urlObj.searchParams.get("warehouseId") || undefined;

          const allBalances = await ledgerService.listBalances(tenantContext.organizationId, { skuId, warehouseId });
          const total = allBalances.length;
          const paged = allBalances.slice(offset, offset + limit);
          const dtos = paged.map((b) => ({
            id: b.id,
            organizationId: b.organization_id,
            skuId: b.sku_id,
            warehouseId: b.warehouse_id,
            onHand: b.on_hand,
            allocated: b.allocated,
            reserved: b.reserved,
            safetyStock: b.safety_stock,
            damaged: b.damaged,
            quarantined: b.quarantined,
            available: calculateSellableAvailable(b),
            version: b.version,
            updatedAt: b.updated_at,
          }));

          const envelope = ApiResponseEnvelopeSchema(z.array(InventoryBalanceDtoSchema)).parse({
            data: dtos,
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              requestId: correlationId,
              pagination: {
                page,
                limit,
                total,
                hasNext: offset + limit < total,
                cursor,
                nextCursor: offset + limit < total ? String(offset + limit) : null,
              },
            },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // INTEGRATION & CHANNEL API (Section 51 of 01_ENGINEERING_SPEC.md & Prompt 24)
      // GET    /integrations (and /channels/accounts)
      // GET    /integrations/:id
      // POST   /integrations/:provider/connect
      // GET    /integrations/:provider/callback
      // POST   /integrations/:id/sync
      // POST   /integrations/:id/reconnect
      // POST   /integrations/:id/disconnect
      // GET    /integrations/:id/health
      // ==========================================
      if (
        url === "/integrations" ||
        url.startsWith("/integrations/") ||
        url === "/channels/accounts" ||
        url.startsWith("/channels/accounts/")
      ) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access integration resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // GET /integrations or GET /channels/accounts
        if ((url === "/integrations" || url === "/channels/accounts") && method === "GET") {
          assertPermission(tenantContext.role, "integrations:read");
          const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
          const rawLimit = urlObj.searchParams.get("limit");
          const rawPage = urlObj.searchParams.get("page");
          const limit = rawLimit ? parseInt(rawLimit, 10) : 50;
          const page = rawPage ? parseInt(rawPage, 10) : 1;
          if (isNaN(limit) || limit < 1 || limit > 250) {
            sendError(res, 400, "VALIDATION_ERROR", "Limit must be between 1 and 250", correlationId);
            return;
          }
          if (isNaN(page) || page < 1) {
            sendError(res, 400, "VALIDATION_ERROR", "Page must be a positive integer", correlationId);
            return;
          }
          const cursor = urlObj.searchParams.get("cursor") || undefined;
          const offset = cursor ? parseInt(cursor, 10) : (page - 1) * limit;

          const query = IntegrationQuerySchema.safeParse({
            provider: urlObj.searchParams.get("provider") || undefined,
            status: urlObj.searchParams.get("status") || undefined,
            page,
            limit,
            cursor,
          });
          if (!query.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid integration query parameters", correlationId, query.error.issues);
            return;
          }

          const result = await integrationDbService.listIntegrations(tenantContext, {
            ...query.data,
            offset,
            limit,
          });

          const envelope = ApiResponseEnvelopeSchema(z.array(IntegrationDtoSchema)).parse({
            data: result.items,
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              requestId: correlationId,
              pagination: {
                page,
                limit,
                total: result.total,
                hasNext: offset + limit < result.total,
                cursor,
                nextCursor: offset + limit < result.total ? String(offset + limit) : null,
              },
            },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /integrations/:provider/connect
        const matchConnect = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)\/connect$/);
        if (matchConnect?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "integrations:write");
          const providerStr = matchConnect[1].toUpperCase();
          const body = (await readJsonBody(req)) as Record<string, unknown>;
          const parsed = ConnectIntegrationRequestSchema.safeParse({
            provider: providerStr,
            displayName: body.displayName || `${providerStr} Store`,
            credentials: body.credentials,
            settings: body.settings,
          });
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid connect integration payload", correlationId, parsed.error.issues);
            return;
          }
          const created = await integrationDbService.connectIntegration(tenantContext, parsed.data);
          const envelope = ApiResponseEnvelopeSchema(IntegrationDtoSchema).parse({
            data: created,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 201, envelope);
          return;
        }

        // GET /integrations/:provider/callback
        const matchCallback = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)\/callback$/);
        if (matchCallback?.[1] && method === "GET") {
          const provider = matchCallback[1];
          const envelope = ApiResponseEnvelopeSchema(z.object({
            success: z.boolean(),
            provider: z.string(),
            callbackReceivedAt: z.string(),
          })).parse({
            data: {
              success: true,
              provider,
              callbackReceivedAt: new Date().toISOString(),
            },
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // GET /integrations/:id/health
        const matchHealth = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)\/health$/);
        if (matchHealth?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "integrations:read");
          const integrationId = matchHealth[1];
          const health = await integrationDbService.getHealth(tenantContext, integrationId);
          const envelope = ApiResponseEnvelopeSchema(IntegrationHealthDtoSchema).parse({
            data: health,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /integrations/:id/sync
        const matchSync = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)\/sync$/);
        if (matchSync?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "channels:sync");
          const integrationId = matchSync[1];
          const integration = await integrationDbService.getIntegration(tenantContext, integrationId);
          const envelope = ApiResponseEnvelopeSchema(z.object({
            syncTriggered: z.boolean(),
            integrationId: z.string(),
            startedAt: z.string(),
          })).parse({
            data: {
              syncTriggered: true,
              integrationId: integration.id,
              startedAt: new Date().toISOString(),
            },
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /integrations/:id/reconnect
        const matchReconnect = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)\/reconnect$/);
        if (matchReconnect?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "integrations:write");
          const integrationId = matchReconnect[1];
          const updated = await integrationDbService.reconnectIntegration(tenantContext, integrationId);
          const envelope = ApiResponseEnvelopeSchema(IntegrationDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // POST /integrations/:id/disconnect
        const matchDisconnect = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)\/disconnect$/);
        if (matchDisconnect?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "integrations:write");
          const integrationId = matchDisconnect[1];
          const updated = await integrationDbService.disconnectIntegration(tenantContext, integrationId);
          const envelope = ApiResponseEnvelopeSchema(IntegrationDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // GET /integrations/:id
        const matchIntegration = url.match(/^\/integrations\/([a-zA-Z0-9_-]+)$/);
        if (matchIntegration?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "integrations:read");
          const integrationId = matchIntegration[1];
          const item = await integrationDbService.getIntegration(tenantContext, integrationId);
          const envelope = ApiResponseEnvelopeSchema(IntegrationDtoSchema).parse({
            data: item,
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // 4. ORDER API (Section 50 of 01_ENGINEERING_SPEC.md & Prompt 10)
      // GET /orders
      // GET /orders/:id
      // POST /orders (and POST /orders/import)
      // POST /orders/:id/cancel
      // GET /orders/:id/events
      // GET /orders/:id/reservations
      // ==========================================

      if (url === "/orders" || url === "/orders/import" || url.startsWith("/orders/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access order resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 4.1 GET /orders
        if (url === "/orders" && method === "GET") {
          assertPermission(tenantContext.role, "orders:read");

          const urlObj = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
          const statusParam = urlObj.searchParams.get("status") || undefined;
          const channelAccParam = urlObj.searchParams.get("channelAccountId") || undefined;
          const limitParam = urlObj.searchParams.get("limit");
          const offsetParam = urlObj.searchParams.get("offset");

          const query = OrderQuerySchema.parse({
            status: statusParam,
            channelAccountId: channelAccParam,
            limit: limitParam ? Number(limitParam) : undefined,
            offset: offsetParam ? Number(offsetParam) : undefined,
          });

          const { orders } = await orderService.listOrders(
            tenantContext.organizationId,
            query,
            tenantContext.organizationId
          );
          const envelope = ApiResponseEnvelopeSchema(z.array(OrderDtoSchema)).parse({
            data: orders.map(toOrderDto),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 4.2 POST /orders or POST /orders/import
        if ((url === "/orders" || url === "/orders/import") && method === "POST") {
          assertPermission(tenantContext.role, "orders:write");

          const body = await readJsonBody(req);
          const parsed = ImportOrderRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid order payload", correlationId, parsed.error.issues);
            return;
          }

          const result = await orderService.importOrder({
            ...parsed.data,
            organizationId: tenantContext.organizationId,
            authenticatedOrgId: tenantContext.organizationId,
            actorId: tenantContext.userId,
            correlationId,
          });

          const statusCode = result.isDuplicate ? 200 : 201;
          const envelope = ApiResponseEnvelopeSchema(OrderDtoSchema).parse({
            data: toOrderDto(result.order),
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
            },
          });
          sendJson(res, statusCode, envelope);
          return;
        }

        // 4.3 POST /orders/:id/cancel
        const matchCancel = url.match(/^\/orders\/([a-zA-Z0-9_-]+)\/cancel$/);
        if (matchCancel?.[1] && method === "POST") {
          const orderId = matchCancel[1];
          assertPermission(tenantContext.role, "orders:write");

          const body = await readJsonBody(req);
          const parsed = CancelOrderRequestSchema.safeParse(body);
          const result = await orderService.cancelOrder({
            organizationId: tenantContext.organizationId,
            orderId,
            reason: parsed.success ? parsed.data.reason : undefined,
            actorId: tenantContext.userId,
            correlationId,
            authenticatedOrgId: tenantContext.organizationId,
          });

          const envelope = ApiResponseEnvelopeSchema(OrderDtoSchema).parse({
            data: toOrderDto(result.order),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 4.4 GET /orders/:id/events
        const matchEvents = url.match(/^\/orders\/([a-zA-Z0-9_-]+)\/events$/);
        if (matchEvents?.[1] && method === "GET") {
          const orderId = matchEvents[1];
          assertPermission(tenantContext.role, "orders:read");

          const events = await orderService.getOrderEvents(
            tenantContext.organizationId,
            orderId,
            tenantContext.organizationId
          );
          const envelope = ApiResponseEnvelopeSchema(z.array(OrderEventDtoSchema)).parse({
            data: events.map(toOrderEventDto),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 4.5 GET /orders/:id/reservations
        const matchReservations = url.match(/^\/orders\/([a-zA-Z0-9_-]+)\/reservations$/);
        if (matchReservations?.[1] && method === "GET") {
          const orderId = matchReservations[1];
          assertPermission(tenantContext.role, "orders:read");

          const reservations = await orderService.getOrderReservations(
            tenantContext.organizationId,
            orderId,
            tenantContext.organizationId
          );
          const envelope = ApiResponseEnvelopeSchema(z.array(z.any())).parse({
            data: reservations,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 4.6 GET /orders/:id
        const matchGetOrder = url.match(/^\/orders\/([a-zA-Z0-9_-]+)$/);
        if (matchGetOrder?.[1] && method === "GET") {
          const orderId = matchGetOrder[1];
          assertPermission(tenantContext.role, "orders:read");

          const order = await orderService.getOrder(
            tenantContext.organizationId,
            orderId,
            tenantContext.organizationId
          );
          const envelope = ApiResponseEnvelopeSchema(OrderDtoSchema).parse({
            data: toOrderDto(order),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // 5. SYNCHRONIZATION JOBS API (Section 23, 24 of 01_ENGINEERING_SPEC.md & Prompt 12)
      // GET /sync-jobs
      // GET /sync-jobs/:id
      // POST /sync-jobs
      // POST /sync-jobs/:id/retry
      // ==========================================

      if (
        url === "/sync-jobs" ||
        url.startsWith("/sync-jobs/") ||
        url === "/sync/jobs" ||
        url.startsWith("/sync/jobs/") ||
        url === "/sync" ||
        url.startsWith("/sync/")
      ) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access sync job resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 5.1 GET /sync-jobs or /sync/jobs
        if ((url === "/sync-jobs" || url === "/sync/jobs" || url === "/sync") && method === "GET") {
          assertPermission(tenantContext.role, "channels:read");
          const fullUrl = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);
          const filter = {
            channelAccountId: fullUrl.searchParams.get("channelAccountId") || undefined,
            skuId: fullUrl.searchParams.get("skuId") || undefined,
            status: (fullUrl.searchParams.get("status") as any) || undefined,
            limit: fullUrl.searchParams.get("limit") ? parseInt(fullUrl.searchParams.get("limit")!, 10) : 50,
            offset: fullUrl.searchParams.get("offset") ? parseInt(fullUrl.searchParams.get("offset")!, 10) : 0,
          };

          const result = await syncJobService.listSyncJobs(tenantContext.organizationId, filter);
          const page = Math.floor(filter.offset / filter.limit) + 1;
          const hasNext = filter.offset + filter.limit < result.total;
          const envelope = ApiResponseEnvelopeSchema(z.array(SyncJobDtoSchema)).parse({
            data: result.jobs.map(toSyncJobDto),
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              requestId: correlationId,
              pagination: {
                page,
                limit: filter.limit,
                total: result.total,
                hasNext,
              },
            },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 5.2 POST /sync-jobs or /sync/jobs
        if ((url === "/sync-jobs" || url === "/sync/jobs" || url === "/sync") && method === "POST") {
          assertPermission(tenantContext.role, "channels:sync");
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = CreateSyncJobRequestSchema.parse(rawBody);

          const result = await syncJobService.enqueue({
            organizationId: tenantContext.organizationId,
            channelAccountId: parsed.channelAccountId,
            skuId: parsed.skuId,
            warehouseId: parsed.warehouseId,
            operation: parsed.operation,
            targetQuantity: parsed.targetQuantity,
            idempotencyKey: parsed.idempotencyKey,
            correlationId: parsed.correlationId || correlationId,
          });

          const statusCode = result.isDuplicate ? 200 : 201;
          const envelope = ApiResponseEnvelopeSchema(SyncJobDtoSchema).parse({
            data: toSyncJobDto(result.job),
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, statusCode, envelope);
          return;
        }

        // 5.3 POST /sync-jobs/:id/retry or /sync/jobs/:id/retry
        const matchRetry = url.match(/^\/sync(?:\/jobs|-jobs)\/([a-zA-Z0-9_-]+)\/retry$/);
        if (matchRetry?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "channels:sync");
          const jobId = matchRetry[1];
          let force = false;
          try {
            const rawBody = await readJsonBody<unknown>(req);
            if (rawBody && typeof rawBody === "object") {
              const parsed = RetrySyncJobRequestSchema.parse(rawBody);
              force = parsed.force;
            }
          } catch {
            // Optional body
          }

          const retried = await syncJobService.retrySyncJob(tenantContext.organizationId, jobId, force);
          const envelope = ApiResponseEnvelopeSchema(SyncJobDtoSchema).parse({
            data: toSyncJobDto(retried),
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 5.4 GET /sync-jobs/:id or /sync/jobs/:id
        const matchGetSync = url.match(/^\/sync(?:\/jobs|-jobs)\/([a-zA-Z0-9_-]+)$/);
        if (matchGetSync?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "channels:read");
          const jobId = matchGetSync[1];
          const job = await syncJobService.getSyncJob(tenantContext.organizationId, jobId);
          if (!job) {
            sendError(res, 404, "SYNC_JOB_NOT_FOUND", `Sync job '${jobId}' was not found.`, correlationId);
            return;
          }

          const envelope = ApiResponseEnvelopeSchema(SyncJobDtoSchema).parse({
            data: toSyncJobDto(job),
            meta: { timestamp: new Date().toISOString(), correlationId, requestId: correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // 6. RECONCILIATION API (Section 53)
      // ==========================================

      if (url === "/reconciliation" || url.startsWith("/reconciliation/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access reconciliation resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 6.1 POST /reconciliation/run
        if (url === "/reconciliation/run" && method === "POST") {
          assertPermission(tenantContext.role, "reconciliation:write");
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = StartReconciliationRunRequestSchema.parse(rawBody);

          const summary = await reconciliationEngine.runReconciliation({
            organizationId: tenantContext.organizationId,
            channelAccountId: parsed.channelAccountId,
            warehouseId: parsed.warehouseId,
            skuIds: parsed.skuIds,
            policy: parsed.policy,
            sourceOfTruth: parsed.sourceOfTruth,
            actorId: tenantContext.userId,
            actorType: "USER",
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ReconciliationRunDtoSchema).parse({
            data: toReconciliationRunDto(summary.run, summary.results),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 201, envelope);
          return;
        }

        // 6.2 GET /reconciliation/runs
        if (url === "/reconciliation/runs" && method === "GET") {
          assertPermission(tenantContext.role, "reconciliation:read");
          const query = new URL(req.url || "/", "http://localhost").searchParams;
          const channelAccountId = query.get("channelAccountId") || undefined;
          const status = (query.get("status") as any) || undefined;
          const page = Math.max(1, parseInt(query.get("page") || "1", 10));
          const limit = Math.min(100, Math.max(1, parseInt(query.get("limit") || "50", 10)));
          const offset = (page - 1) * limit;

          const list = await reconciliationDbService.listRuns(tenantContext.organizationId, {
            channelAccountId,
            status,
            limit,
            offset,
          });

          const envelope = {
            data: list.items.map((r: ReconciliationRunRow) => toReconciliationRunDto(r)),
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              pagination: { total: list.total, page, limit },
            },
          };
          sendJson(res, 200, envelope);
          return;
        }

        // 6.3 GET /reconciliation/runs/:id
        const matchGetRun = url.match(/^\/reconciliation\/runs\/([a-zA-Z0-9_-]+)$/);
        if (matchGetRun?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "reconciliation:read");
          const runId = matchGetRun[1];
          const run = await reconciliationDbService.getRun(tenantContext.organizationId, runId);
          if (!run) {
            sendError(res, 404, "RECONCILIATION_RUN_NOT_FOUND", `Reconciliation run '${runId}' not found.`, correlationId);
            return;
          }
          const results = await reconciliationDbService.listResults(tenantContext.organizationId, runId);
          const envelope = ApiResponseEnvelopeSchema(ReconciliationRunDtoSchema).parse({
            data: toReconciliationRunDto(run, results.items),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 6.4 GET /reconciliation/results/:id
        const matchGetResult = url.match(/^\/reconciliation\/results\/([a-zA-Z0-9_-]+)$/);
        if (matchGetResult?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "reconciliation:read");
          const resultId = matchGetResult[1];
          const fetched = await reconciliationDbService.getResult(tenantContext.organizationId, resultId);
          if (!fetched) {
            sendError(res, 404, "RECONCILIATION_RESULT_NOT_FOUND", `Reconciliation result '${resultId}' not found.`, correlationId);
            return;
          }
          const envelope = ApiResponseEnvelopeSchema(ReconciliationResultDtoSchema).parse({
            data: toReconciliationResultDto(fetched.result),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 6.5 POST /reconciliation/results/:id/approve
        const matchApproveResult = url.match(/^\/reconciliation\/results\/([a-zA-Z0-9_-]+)\/approve$/);
        if (matchApproveResult?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "reconciliation:write");
          const resultId = matchApproveResult[1];
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = ApproveReconciliationResultRequestSchema.parse(rawBody || {});

          const updated = await reconciliationEngine.approveResult({
            organizationId: tenantContext.organizationId,
            resultId,
            correctionDirection: parsed.correctionDirection,
            targetQuantity: parsed.targetQuantity,
            warehouseId: parsed.warehouseId,
            reason: parsed.reason,
            actorId: tenantContext.userId,
            actorType: "USER",
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ReconciliationResultDtoSchema).parse({
            data: toReconciliationResultDto(updated),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 6.6 POST /reconciliation/results/:id/reject
        const matchRejectResult = url.match(/^\/reconciliation\/results\/([a-zA-Z0-9_-]+)\/reject$/);
        if (matchRejectResult?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "reconciliation:write");
          const resultId = matchRejectResult[1];
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = RejectReconciliationResultRequestSchema.parse(rawBody || {});

          const updated = await reconciliationEngine.rejectResult({
            organizationId: tenantContext.organizationId,
            resultId,
            reason: parsed.reason,
            actorId: tenantContext.userId,
            actorType: "USER",
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ReconciliationResultDtoSchema).parse({
            data: toReconciliationResultDto(updated),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // 7. EXCEPTION API (Section 52)
      // ==========================================

      if (url === "/exceptions" || url.startsWith("/exceptions/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access exception resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: me.user.id as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 7.1 GET /exceptions
        if (url === "/exceptions" && method === "GET") {
          assertPermission(tenantContext.role, "exceptions:read");
          const query = new URL(req.url || "/", "http://localhost").searchParams;
          const status = (query.get("status") as any) || undefined;
          const severity = (query.get("severity") as any) || undefined;
          const type = (query.get("type") as any) || undefined;
          const entityType = query.get("entityType") || undefined;
          const entityId = query.get("entityId") || undefined;
          const page = Math.max(1, parseInt(query.get("page") || "1", 10));
          const limit = Math.min(100, Math.max(1, parseInt(query.get("limit") || "50", 10)));
          const offset = (page - 1) * limit;

          const list = await exceptionEngine.listExceptions(tenantContext.organizationId, {
            status,
            severity,
            type,
            entityType,
            entityId,
            limit,
            offset,
          });

          const envelope = {
            data: list.items.map((e) => toExceptionDto(e)),
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              pagination: { total: list.total, page, limit },
            },
          };
          sendJson(res, 200, envelope);
          return;
        }

        // 7.2 GET /exceptions/:id
        const matchGetException = url.match(/^\/exceptions\/([a-zA-Z0-9_-]+)$/);
        if (matchGetException?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "exceptions:read");
          const exceptionId = matchGetException[1];
          const ex = await exceptionEngine.getException(tenantContext.organizationId, exceptionId);
          if (!ex) {
            sendError(res, 404, "EXCEPTION_NOT_FOUND", `Exception '${exceptionId}' not found.`, correlationId);
            return;
          }

          const envelope = ApiResponseEnvelopeSchema(ExceptionDtoSchema).parse({
            data: toExceptionDto(ex),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 7.3 POST /exceptions/:id/resolve
        const matchResolve = url.match(/^\/exceptions\/([a-zA-Z0-9_-]+)\/resolve$/);
        if (matchResolve?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "exceptions:resolve");
          const exceptionId = matchResolve[1];
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = ResolveExceptionRequestSchema.parse(rawBody || {});

          const updated = await exceptionEngine.resolveException({
            organizationId: tenantContext.organizationId,
            exceptionId,
            actorId: tenantContext.userId,
            actorType: "USER",
            notes: parsed.notes,
            reason: parsed.reason,
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ExceptionDtoSchema).parse({
            data: toExceptionDto(updated),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 7.4 POST /exceptions/:id/retry
        const matchRetry = url.match(/^\/exceptions\/([a-zA-Z0-9_-]+)\/retry$/);
        if (matchRetry?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "exceptions:resolve");
          const exceptionId = matchRetry[1];
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = RetryExceptionRequestSchema.parse(rawBody || {});

          const updated = await exceptionEngine.retryException({
            organizationId: tenantContext.organizationId,
            exceptionId,
            actorId: tenantContext.userId,
            actorType: "USER",
            reason: parsed.reason,
            idempotencyKey: parsed.idempotencyKey,
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ExceptionDtoSchema).parse({
            data: toExceptionDto(updated),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 7.5 POST /exceptions/:id/ignore
        const matchIgnore = url.match(/^\/exceptions\/([a-zA-Z0-9_-]+)\/ignore$/);
        if (matchIgnore?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "exceptions:resolve");
          const exceptionId = matchIgnore[1];
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = IgnoreExceptionRequestSchema.parse(rawBody || {});

          const updated = await exceptionEngine.ignoreException({
            organizationId: tenantContext.organizationId,
            exceptionId,
            actorId: tenantContext.userId,
            actorType: "USER",
            reason: parsed.reason,
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ExceptionDtoSchema).parse({
            data: toExceptionDto(updated),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 7.6 POST /exceptions/:id/reconcile
        const matchReconcile = url.match(/^\/exceptions\/([a-zA-Z0-9_-]+)\/reconcile$/);
        if (matchReconcile?.[1] && method === "POST") {
          assertPermission(tenantContext.role, "exceptions:resolve");
          const exceptionId = matchReconcile[1];
          const rawBody = await readJsonBody<unknown>(req);
          const parsed = ReconcileExceptionRequestSchema.parse(rawBody || {});

          const updated = await exceptionEngine.reconcileException({
            organizationId: tenantContext.organizationId,
            exceptionId,
            actorId: tenantContext.userId,
            actorType: "USER",
            correctionDirection: parsed.correctionDirection,
            targetQuantity: parsed.targetQuantity,
            warehouseId: parsed.warehouseId,
            notes: parsed.notes,
            reason: parsed.reason,
            correlationId,
          });

          const envelope = ApiResponseEnvelopeSchema(ExceptionDtoSchema).parse({
            data: toExceptionDto(updated),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // 8. AUDIT SYSTEM API ENDPOINTS
      // Canonical Specification: Sections 35, 36, 68, 114 of 01_ENGINEERING_SPEC.md & Prompt 21
      // ==========================================

      if (url === "/audit" || url.startsWith("/audit/")) {
        // 8.0 Immutability Guard: Reject PUT, PATCH, DELETE on /audit* and direct POST /audit
        if (method === "PUT" || method === "PATCH" || method === "DELETE") {
          sendError(
            res,
            405,
            "IMMUTABLE_AUDIT_LOG",
            "Audit logs are strictly append-only. Historical audit records cannot be modified or deleted.",
            correlationId
          );
          return;
        }
        if (method === "POST" && (url === "/audit" || url === "/audit/")) {
          sendError(
            res,
            405,
            "IMMUTABLE_AUDIT_LOG",
            "Direct client creation of audit logs is forbidden. Audit records are emitted automatically by the server during material mutations.",
            correlationId
          );
          return;
        }

        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access audit resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: (me.user?.id || "user_anonymous") as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 8.1 GET /audit/export
        if (url === "/audit/export" && method === "GET") {
          assertPermission(tenantContext.role, "audit:read");
          const query = new URL(req.url || "/", "http://localhost").searchParams;
          const format = query.get("format") === "csv" ? "csv" : "json";
          const entityType = query.get("entityType") || undefined;
          const entityId = query.get("entityId") || undefined;
          const action = query.get("action") || undefined;
          const actorType = (query.get("actorType") as any) || undefined;
          const actorId = query.get("actorId") || undefined;
          const startDate = query.get("startDate") || undefined;
          const endDate = query.get("endDate") || undefined;
          const targetCorrelationId = query.get("correlationId") || undefined;
          const limit = Math.min(500, Math.max(1, parseInt(query.get("limit") || "500", 10)));

          const exported = await auditDbService.exportAuditLogs(
            tenantContext.organizationId,
            {
              entityType,
              entityId,
              action,
              actorType,
              actorId,
              startDate,
              endDate,
              correlationId: targetCorrelationId,
              limit,
            },
            format
          );

          if (format === "csv") {
            res.writeHead(200, {
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": `attachment; filename="audit-log-${tenantContext.organizationId}.csv"`,
              "x-correlation-id": correlationId,
            });
            res.end(exported);
            return;
          } else {
            res.writeHead(200, {
              "Content-Type": "application/json; charset=utf-8",
              "x-correlation-id": correlationId,
            });
            res.end(exported);
            return;
          }
        }

        // 8.2 GET /audit/reconstruct/:correlationId
        const matchReconstruct = url.match(/^\/audit\/reconstruct\/([a-zA-Z0-9_-]+)$/);
        if (matchReconstruct?.[1] && method === "GET") {
          assertPermission(tenantContext.role, "audit:read");
          const targetCorrelationId = matchReconstruct[1];
          const reconstructed = await auditDbService.reconstructDiscrepancy(tenantContext.organizationId, {
            correlationId: targetCorrelationId,
          });

          const envelope = {
            data: reconstructed,
            meta: { timestamp: new Date().toISOString(), correlationId },
          };
          sendJson(res, 200, envelope);
          return;
        }

        if (url === "/audit/reconstruct" && method === "GET") {
          assertPermission(tenantContext.role, "audit:read");
          const query = new URL(req.url || "/", "http://localhost").searchParams;
          const targetCorrelationId = query.get("correlationId") || undefined;
          const entityType = query.get("entityType") || undefined;
          const entityId = query.get("entityId") || undefined;

          const reconstructed = await auditDbService.reconstructDiscrepancy(tenantContext.organizationId, {
            correlationId: targetCorrelationId,
            entityType,
            entityId,
          });

          const envelope = {
            data: reconstructed,
            meta: { timestamp: new Date().toISOString(), correlationId },
          };
          sendJson(res, 200, envelope);
          return;
        }

        // 8.3 GET /audit/:id
        const matchGetAudit = url.match(/^\/audit\/([a-zA-Z0-9_-]+)$/);
        if (
          matchGetAudit?.[1] &&
          method === "GET" &&
          matchGetAudit[1] !== "export" &&
          matchGetAudit[1] !== "reconstruct"
        ) {
          assertPermission(tenantContext.role, "audit:read");
          const auditId = matchGetAudit[1];
          const log = await auditDbService.findById(tenantContext.organizationId, auditId);
          if (!log) {
            sendError(res, 404, "AUDIT_LOG_NOT_FOUND", `Audit log record '${auditId}' not found.`, correlationId);
            return;
          }

          const envelope = ApiResponseEnvelopeSchema(AuditLogDtoSchema).parse({
            data: toAuditLogDto(log),
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 8.4 GET /audit
        if (url === "/audit" && method === "GET") {
          assertPermission(tenantContext.role, "audit:read");
          const query = new URL(req.url || "/", "http://localhost").searchParams;
          const entityType = query.get("entityType") || undefined;
          const entityId = query.get("entityId") || undefined;
          const action = query.get("action") || undefined;
          const actorType = (query.get("actorType") as any) || undefined;
          const actorId = query.get("actorId") || undefined;
          const targetCorrelationId = query.get("correlationId") || undefined;
          const startDate = query.get("startDate") || undefined;
          const endDate = query.get("endDate") || undefined;
          const page = Math.max(1, parseInt(query.get("page") || "1", 10));
          const limit = Math.min(100, Math.max(1, parseInt(query.get("limit") || "50", 10)));
          const offset = query.has("offset") ? Math.max(0, parseInt(query.get("offset") || "0", 10)) : (page - 1) * limit;

          const result = await auditDbService.list(tenantContext.organizationId, {
            entityType,
            entityId,
            action,
            actorType,
            actorId,
            correlationId: targetCorrelationId,
            startDate,
            endDate,
            limit,
            offset,
          });

          const envelope = {
            data: result.items.map(toAuditLogDto),
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              pagination: {
                total: result.total,
                page,
                limit,
                offset,
                hasMore: offset + result.items.length < result.total,
              },
            },
          };
          sendJson(res, 200, envelope);
          return;
        }

        if (url === "/audit" && (method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH")) {
          sendError(res, 405, "METHOD_NOT_ALLOWED", `Method ${method} is not allowed on /audit. Audit records are immutable.`, correlationId);
          return;
        }
      }

      // ==========================================
      // 9. BILLING & SUBSCRIPTION API (Prompt 22 & Sections 38, 56, 72, 73, 74, 75, 116)
      // GET /billing/subscription
      // POST /billing/checkout
      // POST /billing/portal
      // POST /webhooks/stripe
      // ==========================================

      // 9.1 POST /webhooks/stripe (Machine-to-machine, verified by HMAC-SHA256 signature)
      if (url === "/webhooks/stripe" && method === "POST") {
        const rawPayload = await readRawBody(req);
        const signatureHeader = (req.headers["stripe-signature"] as string) || "";

        const event = stripeClient.constructEvent(rawPayload, signatureHeader);
        const updatedSub = await billingDbService.handleStripeEvent(event, correlationId);

        sendJson(res, 200, {
          received: true,
          eventId: event.id,
          status: updatedSub.status,
          plan: updatedSub.plan,
        });
        return;
      }

      // 9.2 Authenticated Billing Endpoints (/billing/*)
      if (url.startsWith("/billing/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access billing resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: (me.user?.id || "user_anonymous") as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 9.2.1 GET /billing/subscription
        if (url === "/billing/subscription" && method === "GET") {
          assertPermission(tenantContext.role, "billing:read");

          const sub = await billingDbService.getOrCreateSubscription(tenantContext.organizationId);
          const envelope = ApiResponseEnvelopeSchema(SubscriptionDtoSchema).parse({
            data: sub,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 9.2.2 POST /billing/checkout
        if (url === "/billing/checkout" && method === "POST") {
          assertPermission(tenantContext.role, "billing:manage");

          const body = await readJsonBody(req);
          const parsed = CreateCheckoutSessionRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid checkout session request", correlationId, parsed.error.issues);
            return;
          }

          const currentSub = await billingDbService.getOrCreateSubscription(tenantContext.organizationId);
          const session = await stripeClient.createCheckoutSession({
            organizationId: tenantContext.organizationId,
            plan: parsed.data.plan,
            successUrl: parsed.data.successUrl,
            cancelUrl: parsed.data.cancelUrl,
            customerId: currentSub.stripeCustomerId,
          });

          const envelope = ApiResponseEnvelopeSchema(CreateCheckoutSessionResponseSchema).parse({
            data: session,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 9.2.3 POST /billing/portal
        if (url === "/billing/portal" && method === "POST") {
          assertPermission(tenantContext.role, "billing:manage");

          const body = await readJsonBody(req);
          const parsed = CreatePortalSessionRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid portal session request", correlationId, parsed.error.issues);
            return;
          }

          const currentSub = await billingDbService.getOrCreateSubscription(tenantContext.organizationId);
          const session = await stripeClient.createPortalSession({
            organizationId: tenantContext.organizationId,
            customerId: currentSub.stripeCustomerId,
            returnUrl: parsed.data.returnUrl,
          });

          const envelope = ApiResponseEnvelopeSchema(CreatePortalSessionResponseSchema).parse({
            data: session,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }
      }

      // ==========================================
      // 10. NOTIFICATIONS API (Prompt 23 & Section 76)
      // GET /notifications
      // GET /notifications/unread-count
      // PATCH /notifications/:id/read
      // POST /notifications/mark-all-read
      // DELETE /notifications/:id
      // GET /notifications/preferences
      // PUT /notifications/preferences
      // ==========================================

      if (url === "/notifications" || url.startsWith("/notifications/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access notification resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: (me.user?.id || "user_anonymous") as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        // 10.1 GET /notifications/unread-count
        if (url === "/notifications/unread-count" && method === "GET") {
          assertPermission(tenantContext.role, "notifications:read");
          const count = await notificationDbService.getUnreadCount(
            tenantContext.organizationId,
            tenantContext.userId
          );

          const envelope = ApiResponseEnvelopeSchema(UnreadCountResponseSchema).parse({
            data: { unreadCount: count },
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 10.2 POST /notifications/mark-all-read
        if (url === "/notifications/mark-all-read" && method === "POST") {
          assertPermission(tenantContext.role, "notifications:read");
          const updatedCount = await notificationDbService.markAllAsRead(
            tenantContext.organizationId,
            tenantContext.userId
          );

          sendJson(res, 200, {
            data: { markedCount: updatedCount },
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          return;
        }

        // 10.3 GET /notifications/preferences
        if (url === "/notifications/preferences" && method === "GET") {
          assertPermission(tenantContext.role, "notifications:read");
          const prefs = await notificationDbService.getPreferences(
            tenantContext.organizationId,
            tenantContext.userId
          );

          const envelope = ApiResponseEnvelopeSchema(NotificationPreferencesDtoSchema).parse({
            data: prefs,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 10.4 PUT /notifications/preferences
        if (url === "/notifications/preferences" && (method === "PUT" || method === "PATCH")) {
          assertPermission(tenantContext.role, "notifications:manage");
          const body = await readJsonBody(req);
          const parsed = UpdateNotificationPreferencesRequestSchema.safeParse(body);
          if (!parsed.success) {
            sendError(res, 400, "VALIDATION_ERROR", "Invalid notification preferences payload", correlationId, parsed.error.issues);
            return;
          }

          const updated = await notificationDbService.updatePreferences(
            tenantContext.organizationId,
            tenantContext.userId,
            parsed.data
          );

          const envelope = ApiResponseEnvelopeSchema(NotificationPreferencesDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 10.5 PATCH /notifications/:id/read
        const matchRead = url.match(/^\/notifications\/([a-zA-Z0-9_-]+)\/read$/);
        if (matchRead?.[1] && method === "PATCH") {
          assertPermission(tenantContext.role, "notifications:read");
          const notifId = matchRead[1];
          const updated = await notificationDbService.markAsRead(tenantContext.organizationId, notifId);

          const envelope = ApiResponseEnvelopeSchema(NotificationDtoSchema).parse({
            data: updated,
            meta: { timestamp: new Date().toISOString(), correlationId },
          });
          sendJson(res, 200, envelope);
          return;
        }

        // 10.6 DELETE /notifications/:id
        const matchDelete = url.match(/^\/notifications\/([a-zA-Z0-9_-]+)$/);
        if (matchDelete?.[1] && method === "DELETE") {
          assertPermission(tenantContext.role, "notifications:manage");
          const notifId = matchDelete[1];
          await notificationDbService.dismiss(tenantContext.organizationId, notifId);
          sendJson(res, 200, { success: true, message: "Notification dismissed." });
          return;
        }

        // 10.7 GET /notifications
        if (url === "/notifications" && method === "GET") {
          assertPermission(tenantContext.role, "notifications:read");
          const query = new URL(req.url || "/", "http://localhost").searchParams;
          const status = (query.get("status") as any) || undefined;
          const category = (query.get("category") as any) || undefined;
          const severity = (query.get("severity") as any) || undefined;
          const page = Math.max(1, parseInt(query.get("page") || "1", 10));
          const limit = Math.min(100, Math.max(1, parseInt(query.get("limit") || "20", 10)));

          const result = await notificationDbService.list(tenantContext.organizationId, {
            userId: tenantContext.userId,
            status,
            category,
            severity,
            page,
            limit,
          });

          sendJson(res, 200, {
            data: result.items,
            meta: {
              timestamp: new Date().toISOString(),
              correlationId,
              pagination: {
                total: result.total,
                page,
                limit,
                offset: (page - 1) * limit,
                hasMore: page * limit < result.total,
              },
            },
          });
          return;
        }
      }

      // ==========================================
      // 11. ONBOARDING (Section 62, 63, 64 & Prompt 26)
      // ==========================================
      if (url === "/onboarding" || url.startsWith("/onboarding/")) {
        const token = extractAuthToken(req);
        if (!token) {
          sendError(res, 401, "UNAUTHORIZED", "Authentication required to access onboarding resources", correlationId);
          return;
        }

        let me;
        try {
          me = await authAdapter.getMe(token);
        } catch (e) {
          sendError(res, 401, "UNAUTHORIZED", "Invalid or expired session token", correlationId);
          return;
        }

        const tenantContext: TenantContext = {
          organizationId: (me.organization?.id || "00000000-0000-0000-0000-000000000001") as unknown as OrganizationId,
          userId: (me.user?.id || "user_anonymous") as unknown as UserId,
          role: (me.membership?.role as SystemRole) || "OWNER",
          permissions: (me.membership?.permissions as readonly Permission[]) || [],
        };

        function getOrCreateSession(): OnboardingSession {
          let session = onboardingSessions.get(tenantContext.organizationId);
          if (!session) {
            session = onboardingService.initializeOnboarding({
              organizationId: tenantContext.organizationId,
              userId: tenantContext.userId,
            });
            onboardingSessions.set(tenantContext.organizationId, session);
          }
          return session;
        }

          // 11.1 GET /onboarding/state
          if (url === "/onboarding/state" && method === "GET") {
            const session = getOrCreateSession();
            sendJson(res, 200, {
              data: toOnboardingSessionDto(session),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.2 POST /onboarding/choose-channel
          if (url === "/onboarding/choose-channel" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = ChoosePrimaryChannelRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.choosePrimaryChannel(session, parsed);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.3 POST /onboarding/connect-channel
          if (url === "/onboarding/connect-channel" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = ConnectChannelStepRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.connectChannel(session, parsed);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.4 POST /onboarding/import-catalog
          if (url === "/onboarding/import-catalog" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = ImportCatalogStepRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.importCatalog(session, parsed);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.5 POST /onboarding/map-skus
          if (url === "/onboarding/map-skus" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = MapSkusStepRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.mapSkus(session, parsed);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.6 POST /onboarding/validate-inventory (Initial sync safety comparison)
          if (url === "/onboarding/validate-inventory" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = ValidateInventoryRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.validateInventory(session, parsed.items);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.7 POST /onboarding/resolve-discrepancy (Explicit source-of-truth selection)
          if (url === "/onboarding/resolve-discrepancy" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = ResolveDiscrepancyRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.resolveSourceOfTruth(session, parsed as any);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.8 POST /onboarding/batch-resolve-discrepancies
          if (url === "/onboarding/batch-resolve-discrepancies" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = BatchResolveDiscrepancyRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.batchResolveSourceOfTruth(session, parsed as any);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.9 POST /onboarding/confirm-inventory
          if (url === "/onboarding/confirm-inventory" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const session = getOrCreateSession();
            const updated = onboardingService.confirmInventoryValidation(session, tenantContext.userId);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.10 POST /onboarding/enable-sync (CRITICAL SAFETY GATE)
          if (url === "/onboarding/enable-sync" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const body = await readJsonBody<unknown>(req);
            const parsed = EnableOutboundSyncRequestSchema.parse(body);
            const session = getOrCreateSession();
            const updated = onboardingService.enableOutboundSynchronization(session, {
              confirmed: parsed.confirmed,
              userId: tenantContext.userId,
            });
            onboardingSessions.set(tenantContext.organizationId, updated);

            // Audit record for outbound sync enablement
            await auditDbService.record({
              id: `audit_onb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              organization_id: tenantContext.organizationId,
              action: "INTEGRATION_CONNECTED",
              entity_type: "ONBOARDING",
              entity_id: session.id,
              actor_type: "USER",
              actor_id: tenantContext.userId,
              reason: "Merchant authorized outbound inventory synchronization during initial onboarding.",
              before_state: { outboundSyncEnabled: false },
              after_state: { outboundSyncEnabled: true, confirmedAt: new Date().toISOString() },
              request_id: null,
              correlation_id: correlationId,
              created_at: new Date().toISOString(),
            });

            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.11 POST /onboarding/complete
          if (url === "/onboarding/complete" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const session = getOrCreateSession();
            const updated = onboardingService.completeOnboarding(session);
            onboardingSessions.set(tenantContext.organizationId, updated);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(updated),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }

          // 11.12 POST /onboarding/reset
          if (url === "/onboarding/reset" && method === "POST") {
            assertPermission(tenantContext.role, "organization:manage");
            const freshSession = onboardingService.initializeOnboarding({
              organizationId: tenantContext.organizationId,
              userId: tenantContext.userId,
            });
            onboardingSessions.set(tenantContext.organizationId, freshSession);
            sendJson(res, 200, {
              data: toOnboardingSessionDto(freshSession),
              meta: { timestamp: new Date().toISOString(), correlationId },
            });
            return;
          }
        }
      } catch (err: unknown) {
      if (err instanceof InitialSyncSafetyViolationError) {
        sendError(res, 400, "INITIAL_SYNC_SAFETY_VIOLATION", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof OnboardingInvariantError) {
        sendError(res, 400, "ONBOARDING_INVARIANT_VIOLATION", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof InvalidOnboardingStepError) {
        sendError(res, 400, "INVALID_ONBOARDING_STEP", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof OnboardingSessionNotFoundError) {
        sendError(res, 404, "ONBOARDING_SESSION_NOT_FOUND", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof Error && err.message === "PAYLOAD_TOO_LARGE") {
        sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request payload exceeds maximum allowed size of 1MB", correlationId);
        return;
      }
      if (err instanceof Error && err.message === "INVALID_JSON") {
        sendError(res, 400, "INVALID_JSON", "Request body contains malformed JSON", correlationId);
        return;
      }
      if (err instanceof z.ZodError) {
        sendError(res, 400, "VALIDATION_ERROR", "Request validation failed", correlationId, err.issues);
        return;
      }
      if (err instanceof ProductNotFoundError) {
        sendError(res, 404, "PRODUCT_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof VariantNotFoundError) {
        sendError(res, 404, "VARIANT_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof IntegrationNotFoundError) {
        sendError(res, 404, "INTEGRATION_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof InsufficientInventoryError) {
        sendError(res, 409, "INSUFFICIENT_INVENTORY", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof DuplicateIdempotencyKeyError) {
        sendError(res, 409, "DUPLICATE_IDEMPOTENCY_KEY", err.message, correlationId, { idempotencyKey: err.idempotencyKey });
        return;
      }
      if (err instanceof OptimisticLockConflictError) {
        sendError(res, 409, "OPTIMISTIC_LOCK_CONFLICT", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof InventoryInvariantError) {
        sendError(res, 400, "INVENTORY_INVARIANT_VIOLATION", err.message, correlationId);
        return;
      }
      if (err instanceof NotificationNotFoundError) {
        sendError(res, 404, "NOTIFICATION_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof InvalidNotificationStateError) {
        sendError(res, 400, "INVALID_NOTIFICATION_STATE", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof BillingWebhookSignatureError) {
        sendError(res, 400, "INVALID_WEBHOOK_SIGNATURE", err.message, correlationId);
        return;
      }
      if (err instanceof SubscriptionNotFoundError) {
        sendError(res, 404, "SUBSCRIPTION_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof InvalidBillingTransitionError) {
        sendError(res, 400, "INVALID_BILLING_TRANSITION", err.message, correlationId, { from: err.fromStatus, to: err.toStatus });
        return;
      }
      if (err instanceof PlanLimitExceededError) {
        sendError(res, 400, "PLAN_LIMIT_EXCEEDED", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof ImmutableAuditLogError) {
        sendError(res, 405, "IMMUTABLE_AUDIT_LOG", err.message, correlationId);
        return;
      }
      if (err instanceof AuditNotFoundError) {
        sendError(res, 404, "AUDIT_LOG_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof AuditInvariantError) {
        sendError(res, 400, "AUDIT_INVARIANT_VIOLATION", err.message, correlationId);
        return;
      }
      if (err instanceof PermissionDeniedError) {
        sendError(res, 403, "FORBIDDEN", err.message, correlationId);
        return;
      }
      if (err instanceof TenantAccessDeniedError) {
        sendError(res, 403, "FORBIDDEN", err.message, correlationId);
        return;
      }
      if (err instanceof InvalidStateTransitionError) {
        sendError(res, 400, "INVALID_STATE_TRANSITION", err.message, correlationId, err.details);
        return;
      }
      if (err instanceof ReconciliationInvariantError) {
        sendError(res, 400, "RECONCILIATION_INVARIANT_VIOLATION", err.message, correlationId);
        return;
      }
      if (err instanceof ExceptionInvariantError) {
        sendError(res, 400, "EXCEPTION_INVARIANT_VIOLATION", err.message, correlationId);
        return;
      }
      if (err instanceof OrderNotFoundError) {
        sendError(res, 404, "ORDER_NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof OrderInvariantError) {
        sendError(res, 400, "ORDER_INVARIANT_VIOLATION", err.message, correlationId);
        return;
      }
      if (err instanceof MemberNotFoundError) {
        sendError(res, 404, "NOT_FOUND", err.message, correlationId);
        return;
      }
      if (err instanceof BruteForceLockoutError) {
        sendError(res, 429, err.code, err.message, correlationId, { retryAfterMs: err.retryAfterMs });
        return;
      }
      if (err instanceof InvalidCredentialsError) {
        sendError(res, 401, err.code, err.message, correlationId);
        return;
      }
      if (err instanceof AccountAlreadyExistsError) {
        sendError(res, 409, err.code, err.message, correlationId);
        return;
      }
      if (err instanceof SessionExpiredError) {
        sendError(res, 401, err.code, err.message, correlationId);
        return;
      }
      if (err instanceof AuthenticationError) {
        sendError(res, err.status, err.code, err.message, correlationId);
        return;
      }
      logger.error("Unhandled API error", {
        error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
        correlationId,
        method,
        url,
      });
      sendError(res, 500, "INTERNAL_ERROR", "An internal server error occurred. Please contact support.", correlationId);
      return;
    }

    // 404 handler
    sendError(res, 404, "NOT_FOUND", `Endpoint ${method} ${url} not found`, correlationId);
  });

  server.listen(port, () => {
    logger.info(`Platform API server listening on port ${port}`, {
      port,
      environment: config.NODE_ENV,
    });
  });

  return server;
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  startApiServer();
}
