const {
  BillingError,
  buildIdempotencyKey,
  createBillingService,
} = require("./index.cjs");
const {
  assertPaymentProvider,
} = require("../../infrastructure/payments/provider-interface.cjs");

function createBillingIntegrationService({
  repository,
  paymentProviders,
  now = () => new Date().toISOString(),
  createId,
} = {}) {
  if (!repository) {
    throw new BillingError(
      "REPOSITORY_REQUIRED",
      "Billing integration service requires a repository.",
    );
  }

  const billingService = createBillingService({ repository, now, createId });
  const providers = normalizePaymentProviders(paymentProviders);

  async function createPaymentIntent(input) {
    const order = await requireOrder(repository, input?.orderId, input?.referenceId);
    if (!["created", "pending"].includes(order.status)) {
      throw new BillingError(
        "ORDER_NOT_PAYABLE",
        `Order "${order.id}" is already ${order.status} and cannot create a payment intent.`,
        409,
      );
    }

    const provider = resolvePaymentProvider(providers, order.provider);
    const intent = await provider.createPayment({
      order: cloneJson(order),
      referenceId: order.referenceId,
      callbackUrl: requireUrl(input?.callbackUrl, "callbackUrl"),
      returnUrl: optionalUrl(input?.returnUrl, "returnUrl"),
      idempotencyKey: requireIdempotencyKey(input?.idempotencyKey),
      metadata: cloneJson(input?.metadata || null),
    });
    assertPaymentIntent(intent, order);

    if (order.providerOrderId && order.providerOrderId !== intent.providerPaymentId) {
      throw new BillingError(
        "PROVIDER_PAYMENT_MISMATCH",
        `Order "${order.id}" is already bound to provider payment "${order.providerOrderId}".`,
        409,
      );
    }

    let nextOrder = order;
    if (order.status === "created") {
      nextOrder = (
        await billingService.markOrderPending({
          orderId: order.id,
          referenceId: order.referenceId,
          providerOrderId: intent.providerPaymentId,
          idempotencyKey: buildIdempotencyKey({
            scope: "order.pending",
            referenceId: order.referenceId,
            requestId: `intent:${intent.providerPaymentId}`,
          }),
        })
      ).order;
    }

    return {
      order: nextOrder,
      paymentIntent: intent,
      provider: order.provider,
    };
  }

  async function queryPaymentStatus(input) {
    const order = await requireOrder(repository, input?.orderId, input?.referenceId);
    const provider = resolvePaymentProvider(providers, order.provider);
    const providerPaymentId =
      typeof input?.providerPaymentId === "string" && input.providerPaymentId.trim()
        ? input.providerPaymentId.trim()
        : order.providerOrderId;

    if (!providerPaymentId) {
      throw new BillingError(
        "PROVIDER_PAYMENT_REQUIRED",
        `Order "${order.id}" does not have a provider payment id yet.`,
        409,
      );
    }

    const paymentStatus = await provider.queryPayment({
      order: cloneJson(order),
      providerPaymentId,
      referenceId: order.referenceId,
    });
    assertPaymentStatus(paymentStatus, order, providerPaymentId);

    return applyPaymentStatus({
      order,
      requestId:
        paymentStatus.providerEventId ||
        paymentStatus.providerPaymentId ||
        requireIdempotencyKey(input?.idempotencyKey),
      paymentStatus,
      source: "query",
    });
  }

  async function handlePaymentCallback(input) {
    const providerName = requireString(input?.provider, "provider");
    const provider = resolvePaymentProvider(providers, providerName);
    const verifiedEvent = await provider.verifyCallback({
      headers: normalizeHeaders(input?.headers || {}),
      rawBody: requireRawBody(input?.rawBody),
      query: cloneJson(input?.query || {}),
    });
    assertVerifiedPaymentEvent(verifiedEvent, providerName);

    const order = await requireOrder(
      repository,
      verifiedEvent.orderId,
      verifiedEvent.referenceId,
    );

    switch (verifiedEvent.eventType) {
      case "payment.succeeded":
        return settlePaymentSuccess({
          order,
          requestId: verifiedEvent.providerEventId || verifiedEvent.providerPaymentId,
          paymentStatus: {
            provider: providerName,
            providerPaymentId: verifiedEvent.providerPaymentId,
            providerEventId: verifiedEvent.providerEventId,
            providerStatus: verifiedEvent.providerStatus || "SUCCEEDED",
            status: "succeeded",
            amountValue: verifiedEvent.amountValue,
            currency: verifiedEvent.currency,
            checkedAt: verifiedEvent.occurredAt || now(),
          },
          source: "callback",
        });
      case "payment.failed":
      case "payment.closed":
        return closePaymentOrder(order, verifiedEvent);
      case "refund.pending":
        return markRefundPending(order, verifiedEvent);
      case "refund.succeeded":
        return settleRefundSuccess(order, verifiedEvent);
      case "refund.failed":
        return {
          order,
          event: verifiedEvent,
          paymentStatus: null,
          account: await billingService.getCreditAccount({
            accountId: order.accountId,
          }),
        };
      default:
        throw new BillingError(
          "UNSUPPORTED_PAYMENT_EVENT",
          `Unsupported payment event "${verifiedEvent.eventType}".`,
          400,
        );
    }
  }

  async function createRefundRequest(input) {
    const order = await requireOrder(repository, input?.orderId, input?.referenceId);
    if (!["paid", "fulfilled", "refund_pending"].includes(order.status)) {
      throw new BillingError(
        "ORDER_NOT_REFUNDABLE",
        `Order "${order.id}" is ${order.status} and cannot start refund flow.`,
        409,
      );
    }

    const provider = resolvePaymentProvider(providers, order.provider);
    const refund = await provider.createRefund({
      order: cloneJson(order),
      referenceId: order.referenceId,
      idempotencyKey: requireIdempotencyKey(input?.idempotencyKey),
      reason: optionalString(input?.reason),
      amountValue:
        input?.amountValue === undefined
          ? order.amountValue
          : requireNonNegativeInteger(input.amountValue, "amountValue"),
      metadata: cloneJson(input?.metadata || null),
    });
    assertRefundResult(refund, order);

    const nextOrder =
      order.status === "refund_pending" || order.status === "refunded"
        ? order
        : (
            await billingService.markRefundPending({
              orderId: order.id,
              referenceId: order.referenceId,
              idempotencyKey: buildIdempotencyKey({
                scope: "order.refund_pending",
                referenceId: order.referenceId,
                requestId: refund.providerRefundId || requireIdempotencyKey(input?.idempotencyKey),
              }),
            })
          ).order;

    return {
      order: nextOrder,
      refund,
    };
  }

  async function queryRefundStatus(input) {
    const order = await requireOrder(repository, input?.orderId, input?.referenceId);
    const provider = resolvePaymentProvider(providers, order.provider);
    const refundStatus = await provider.queryRefund({
      order: cloneJson(order),
      referenceId: order.referenceId,
      providerRefundId: requireString(input?.providerRefundId, "providerRefundId"),
    });
    assertRefundResult(refundStatus, order);

    if (refundStatus.status === "succeeded") {
      return settleRefundSuccess(order, {
        provider: order.provider,
        eventType: "refund.succeeded",
        providerEventId: refundStatus.providerRefundId,
        providerPaymentId: order.providerOrderId,
        orderId: order.id,
        referenceId: order.referenceId,
        providerStatus: refundStatus.providerStatus || "REFUND_SUCCEEDED",
        amountValue: refundStatus.amountValue,
        currency: refundStatus.currency,
        occurredAt: refundStatus.checkedAt || now(),
      });
    }

    if (refundStatus.status === "pending") {
      return markRefundPending(order, {
        provider: order.provider,
        eventType: "refund.pending",
        providerEventId: refundStatus.providerRefundId,
        providerPaymentId: order.providerOrderId,
        orderId: order.id,
        referenceId: order.referenceId,
        providerStatus: refundStatus.providerStatus || "REFUND_PENDING",
        amountValue: refundStatus.amountValue,
        currency: refundStatus.currency,
        occurredAt: refundStatus.checkedAt || now(),
      });
    }

    return {
      order,
      refund: refundStatus,
      account: await billingService.getCreditAccount({
        accountId: order.accountId,
      }),
    };
  }

  async function applyPaymentStatus({ order, paymentStatus, requestId, source }) {
    switch (paymentStatus.status) {
      case "succeeded":
        return settlePaymentSuccess({ order, paymentStatus, requestId, source });
      case "failed":
      case "cancelled":
        return closePaymentOrder(order, {
          eventType: paymentStatus.status === "failed" ? "payment.failed" : "payment.closed",
          providerEventId: paymentStatus.providerEventId || requestId,
          providerPaymentId: paymentStatus.providerPaymentId,
          referenceId: order.referenceId,
          providerStatus: paymentStatus.providerStatus,
        });
      case "requires_action":
      case "processing":
        return {
          order,
          paymentStatus,
          account: await billingService.getCreditAccount({
            accountId: order.accountId,
          }),
        };
      default:
        throw new BillingError(
          "UNSUPPORTED_PROVIDER_STATUS",
          `Unsupported payment status "${paymentStatus.status}".`,
          400,
        );
    }
  }

  async function settlePaymentSuccess({ order, paymentStatus, requestId, source }) {
    if (["closed", "refund_pending", "refunded"].includes(order.status)) {
      throw new BillingError(
        "PAYMENT_EVENT_CONFLICT",
        `Order "${order.id}" is ${order.status} and cannot settle payment success.`,
        409,
      );
    }

    assertProviderPaymentBinding(
      order,
      paymentStatus.providerPaymentId,
      "Payment settlement does not match the bound provider payment id.",
    );

    const settled = await billingService.settlePaidOrder({
      orderId: order.id,
      referenceId: order.referenceId,
      providerOrderId: paymentStatus.providerPaymentId || order.providerOrderId,
      requestId,
      metadata: {
        provider: order.provider,
        providerPaymentId: paymentStatus.providerPaymentId || order.providerOrderId || null,
        providerEventId: paymentStatus.providerEventId || null,
        source,
      },
    });

    return {
      order: settled.order,
      ledgerEntry: settled.entry,
      account: settled.account,
      paymentStatus,
      source,
    };
  }

  async function closePaymentOrder(order, event) {
    if (order.status === "closed") {
      return {
        order,
        event,
        account: await billingService.getCreditAccount({
          accountId: order.accountId,
        }),
      };
    }
    if (!["created", "pending"].includes(order.status)) {
      return {
        order,
        event,
        account: await billingService.getCreditAccount({
          accountId: order.accountId,
        }),
      };
    }

    const closed = await billingService.closeOrder({
      orderId: order.id,
      referenceId: order.referenceId,
      idempotencyKey: buildIdempotencyKey({
        scope: "order.closed",
        referenceId: order.referenceId,
        requestId: event.providerEventId || event.providerPaymentId,
      }),
    });

    return {
      order: closed.order,
      event,
      account: await billingService.getCreditAccount({
        accountId: order.accountId,
      }),
    };
  }

  async function markRefundPending(order, event) {
    if (order.status === "refund_pending" || order.status === "refunded") {
      return {
        order,
        event,
        account: await billingService.getCreditAccount({
          accountId: order.accountId,
        }),
      };
    }

    if (!["paid", "fulfilled"].includes(order.status)) {
      return {
        order,
        event,
        account: await billingService.getCreditAccount({
          accountId: order.accountId,
        }),
      };
    }

    const pending = await billingService.markRefundPending({
      orderId: order.id,
      referenceId: order.referenceId,
      idempotencyKey: buildIdempotencyKey({
        scope: "order.refund_pending",
        referenceId: order.referenceId,
        requestId: event.providerEventId || event.providerPaymentId,
      }),
    });

    return {
      order: pending.order,
      event,
      account: await billingService.getCreditAccount({
        accountId: order.accountId,
      }),
    };
  }

  async function settleRefundSuccess(order, event) {
    let currentOrder = order;
    if (currentOrder.status !== "refund_pending") {
      const pendingResult = await markRefundPending(currentOrder, event);
      currentOrder = pendingResult.order;
    }

    if (currentOrder.status === "refunded") {
      return {
        order: currentOrder,
        event,
        account: await billingService.getCreditAccount({
          accountId: currentOrder.accountId,
        }),
      };
    }

    if (currentOrder.status !== "refund_pending") {
      return {
        order: currentOrder,
        event,
        account: await billingService.getCreditAccount({
          accountId: currentOrder.accountId,
        }),
      };
    }

    const refunded = await billingService.markRefunded({
      orderId: currentOrder.id,
      referenceId: currentOrder.referenceId,
      idempotencyKey: buildIdempotencyKey({
        scope: "order.refunded",
        referenceId: currentOrder.referenceId,
        requestId: event.providerEventId || event.providerPaymentId,
      }),
    });

    return {
      order: refunded.order,
      event,
      account: await billingService.getCreditAccount({
        accountId: currentOrder.accountId,
      }),
    };
  }

  async function ensurePurchaseGranted(order, paymentStatus, requestId, source) {
    const entries = await repository.listLedgerEntriesByAccount(order.accountId);
    const existingEntry = entries.find(
      (entry) =>
        entry.orderId === order.id &&
        entry.referenceId === order.referenceId &&
        entry.operation === "purchase",
    );

    if (existingEntry) {
      return {
        entry: existingEntry,
        account: await billingService.getCreditAccount({
          accountId: order.accountId,
        }),
      };
    }

    return billingService.purchaseCredits({
      accountId: order.accountId,
      orderId: order.id,
      referenceType: "order",
      referenceId: order.referenceId,
      operation: "purchase",
      credits: order.credits,
      idempotencyKey: buildIdempotencyKey({
        scope: "ledger.purchase",
        referenceId: order.referenceId,
        requestId,
      }),
      metadata: {
        provider: order.provider,
        providerPaymentId: paymentStatus.providerPaymentId || order.providerOrderId || null,
        providerEventId: paymentStatus.providerEventId || null,
        providerStatus: paymentStatus.providerStatus || paymentStatus.status,
        source,
      },
    });
  }

  return {
    createPaymentIntent,
    createRefundRequest,
    handlePaymentCallback,
    queryPaymentStatus,
    queryRefundStatus,
  };
}

function normalizePaymentProviders(value) {
  if (!value || typeof value !== "object") {
    throw new BillingError(
      "PAYMENT_PROVIDERS_REQUIRED",
      "Billing integration service requires a payment provider map.",
    );
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([name, provider]) => [
        name,
        assertPaymentProvider(provider),
      ]),
    ),
  );
}

function resolvePaymentProvider(providers, providerName) {
  const provider = providers[providerName];
  if (!provider) {
    throw new BillingError(
      "PAYMENT_PROVIDER_NOT_FOUND",
      `Payment provider "${providerName}" is not configured.`,
      404,
    );
  }
  return provider;
}

async function requireOrder(repository, orderId, referenceId) {
  const order = await repository.getOrder(requireString(orderId, "orderId"));
  if (!order) {
    throw new BillingError("ORDER_NOT_FOUND", `Order "${orderId}" was not found.`, 404);
  }
  const expectedReferenceId = requireReferenceId(referenceId);
  if (order.referenceId !== expectedReferenceId) {
    throw new BillingError(
      "ORDER_REFERENCE_MISMATCH",
      "referenceId must remain stable across payment orchestration.",
      409,
    );
  }
  return order;
}

function assertPaymentIntent(intent, order) {
  if (!intent || typeof intent !== "object") {
    throw new BillingError(
      "INVALID_PAYMENT_INTENT",
      `Payment provider "${order.provider}" returned an invalid payment intent.`,
      502,
    );
  }
  assertProviderMatchesOrder(intent.provider, order, "Payment intent provider does not match the order.");
  requireString(intent.providerPaymentId, "paymentIntent.providerPaymentId");
  assertReferenceMatchesOrder(
    intent.referenceId,
    order,
    "Payment intent referenceId does not match the order.",
  );
  requirePaymentStatus(intent.status, "paymentIntent.status");
  return intent;
}

function assertPaymentStatus(status, order, requestedProviderPaymentId) {
  if (!status || typeof status !== "object") {
    throw new BillingError(
      "INVALID_PAYMENT_STATUS",
      `Payment provider "${order.provider}" returned an invalid payment status.`,
      502,
    );
  }
  assertProviderMatchesOrder(status.provider, order, "Payment status provider does not match the order.");
  requireString(status.providerPaymentId, "paymentStatus.providerPaymentId");
  if (
    requestedProviderPaymentId &&
    status.providerPaymentId !== requestedProviderPaymentId
  ) {
    throw new BillingError(
      "PROVIDER_PAYMENT_MISMATCH",
      `Payment status belongs to "${status.providerPaymentId}", expected "${requestedProviderPaymentId}".`,
      409,
    );
  }
  assertProviderPaymentBinding(
    order,
    status.providerPaymentId,
    "Payment status does not match the bound provider payment id.",
  );
  assertReferenceMatchesOrder(
    status.referenceId,
    order,
    "Payment status referenceId does not match the order.",
  );
  requirePaymentStatus(status.status, "paymentStatus.status");
  return status;
}

function assertVerifiedPaymentEvent(event, providerName) {
  if (!event || typeof event !== "object") {
    throw new BillingError(
      "INVALID_PAYMENT_EVENT",
      `Payment provider "${providerName}" returned an invalid verified callback event.`,
      502,
    );
  }
  if (event.provider !== providerName) {
    throw new BillingError(
      "PAYMENT_PROVIDER_MISMATCH",
      `Verified event provider "${event.provider}" does not match "${providerName}".`,
      409,
    );
  }
  requireString(event.providerEventId, "verifiedEvent.providerEventId");
  requireString(event.providerPaymentId, "verifiedEvent.providerPaymentId");
  requireString(event.orderId, "verifiedEvent.orderId");
  requireReferenceId(event.referenceId);
  requireVerifiedEventType(event.eventType);
  return event;
}

function assertRefundResult(refund, order) {
  if (!refund || typeof refund !== "object") {
    throw new BillingError(
      "INVALID_REFUND_RESULT",
      `Payment provider "${order.provider}" returned an invalid refund result.`,
      502,
    );
  }
  assertProviderMatchesOrder(refund.provider, order, "Refund result provider does not match the order.");
  requireString(refund.providerRefundId, "refund.providerRefundId");
  assertReferenceMatchesOrder(
    refund.referenceId,
    order,
    "Refund result referenceId does not match the order.",
  );
  requireRefundStatus(refund.status, "refund.status");
  return refund;
}

function assertProviderMatchesOrder(providerName, order, message) {
  const provider = requireString(providerName, "provider");
  if (provider !== order.provider) {
    throw new BillingError("PAYMENT_PROVIDER_MISMATCH", message, 409);
  }
  return provider;
}

function assertReferenceMatchesOrder(referenceId, order, message) {
  const normalizedReferenceId = requireReferenceId(referenceId);
  if (normalizedReferenceId !== order.referenceId) {
    throw new BillingError("ORDER_REFERENCE_MISMATCH", message, 409);
  }
  return normalizedReferenceId;
}

function assertProviderPaymentBinding(order, providerPaymentId, message) {
  const normalizedProviderPaymentId = requireString(
    providerPaymentId,
    "providerPaymentId",
  );
  if (
    order.providerOrderId &&
    normalizedProviderPaymentId !== order.providerOrderId
  ) {
    throw new BillingError("PROVIDER_PAYMENT_MISMATCH", message, 409);
  }
  return normalizedProviderPaymentId;
}

function requireVerifiedEventType(value) {
  const eventType = requireString(value, "eventType");
  if (
    ![
      "payment.succeeded",
      "payment.failed",
      "payment.closed",
      "refund.pending",
      "refund.succeeded",
      "refund.failed",
    ].includes(eventType)
  ) {
    throw new BillingError("INVALID_INPUT", `Unsupported payment event "${eventType}".`);
  }
  return eventType;
}

function requirePaymentStatus(value, field) {
  const status = requireString(value, field);
  if (!["requires_action", "processing", "succeeded", "failed", "cancelled"].includes(status)) {
    throw new BillingError("INVALID_INPUT", `${field} must be a supported payment status.`);
  }
  return status;
}

function requireRefundStatus(value, field) {
  const status = requireString(value, field);
  if (!["pending", "succeeded", "failed"].includes(status)) {
    throw new BillingError("INVALID_INPUT", `${field} must be a supported refund status.`);
  }
  return status;
}

function normalizeHeaders(value) {
  const result = {};
  for (const [key, entry] of Object.entries(value || {})) {
    result[String(key).toLowerCase()] = Array.isArray(entry) ? entry.join(",") : String(entry);
  }
  return result;
}

function requireRawBody(value) {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value === "object" && typeof value.toString === "function") {
    const text = value.toString("utf8");
    if (text) return text;
  }
  throw new BillingError("INVALID_INPUT", "rawBody is required.");
}

function requireReferenceId(value) {
  const referenceId = requireString(value, "referenceId");
  if (!/^[a-z][a-z0-9_.-]*:[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(referenceId)) {
    throw new BillingError(
      "INVALID_INPUT",
      "referenceId must be namespaced as <scope>:<stable-id>, for example order:ord_123.",
    );
  }
  return referenceId;
}

function requireIdempotencyKey(value) {
  const key = requireString(value, "idempotencyKey");
  if (key.length > 160) {
    throw new BillingError("INVALID_INPUT", "idempotencyKey must be 160 chars or shorter.");
  }
  const segments = key.split(":");
  if (
    segments.length < 4 ||
    segments.some((segment) => !segment) ||
    !/^[a-z][a-z0-9_.-]*$/.test(segments[0])
  ) {
    throw new BillingError(
      "INVALID_INPUT",
      "idempotencyKey must follow <action-scope>:<reference-scope>:<reference-id>:<request-id>.",
    );
  }
  return key;
}

function requireUrl(value, field) {
  const url = requireString(value, field);
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Unsupported protocol.");
    }
    return parsed.toString();
  } catch {
    throw new BillingError("INVALID_INPUT", `${field} must be a valid http(s) URL.`);
  }
}

function optionalUrl(value, field) {
  if (value === undefined || value === null || value === "") return null;
  return requireUrl(value, field);
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new BillingError("INVALID_INPUT", `${field} must be a non-negative integer.`);
  }
  return value;
}

function optionalString(value) {
  if (value === undefined || value === null) return null;
  return requireString(value, "value");
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new BillingError("INVALID_INPUT", `${field} is required.`);
  }
  return value.trim();
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createBillingIntegrationService,
};
