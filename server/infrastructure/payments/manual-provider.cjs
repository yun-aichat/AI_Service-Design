const crypto = require("node:crypto");

const {
  PaymentProviderContractError,
  assertPaymentProvider,
} = require("./provider-interface.cjs");

class ManualPaymentProvider {
  constructor({
    provider = "manualpay",
    callbackSecret = process.env.PAYMENT_CALLBACK_SECRET || "manualpay-dev-secret",
    checkoutBaseUrl = "https://payments.example/manualpay",
    now = () => new Date().toISOString(),
  } = {}) {
    if (!callbackSecret) {
      throw new PaymentProviderContractError(
        "ManualPaymentProvider requires callbackSecret.",
      );
    }

    this.provider = provider;
    this.callbackSecret = callbackSecret;
    this.checkoutBaseUrl = checkoutBaseUrl.replace(/\/$/, "");
    this.now = now;
    this.paymentsByKey = new Map();
    this.paymentsById = new Map();
    this.refundsByKey = new Map();
    this.refundsById = new Map();

    assertPaymentProvider(this);
  }

  async createPayment({ order, referenceId, idempotencyKey, callbackUrl, returnUrl, metadata }) {
    if (this.paymentsByKey.has(idempotencyKey)) {
      return cloneJson(this.paymentsByKey.get(idempotencyKey));
    }

    const providerPaymentId = `${this.provider}_${order.id}`;
    const payment = {
      provider: this.provider,
      providerPaymentId,
      referenceId,
      status: "requires_action",
      providerStatus: "WAITING_FOR_PAYMENT",
      amountValue: order.amountValue,
      currency: order.currency,
      checkedAt: this.now(),
      clientAction: {
        type: "redirect",
        url: `${this.checkoutBaseUrl}/checkout/${providerPaymentId}`,
      },
      callbackUrl,
      returnUrl: returnUrl || null,
      metadata: cloneJson(metadata || null),
    };

    this.paymentsByKey.set(idempotencyKey, payment);
    this.paymentsById.set(providerPaymentId, payment);
    return cloneJson(payment);
  }

  async queryPayment({ providerPaymentId }) {
    const payment = this.paymentsById.get(providerPaymentId);
    if (!payment) {
      throw new PaymentProviderContractError(
        `Manual payment "${providerPaymentId}" was not found.`,
      );
    }
    return {
      ...cloneJson(payment),
      checkedAt: this.now(),
    };
  }

  async verifyCallback({ headers, rawBody }) {
    const signature = readHeader(headers, "x-manualpay-signature");
    const expectedSignature = signManualPaymentCallback({
      callbackSecret: this.callbackSecret,
      rawBody,
    });
    if (signature !== expectedSignature) {
      throw new PaymentProviderContractError("Manual payment callback signature is invalid.");
    }

    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new PaymentProviderContractError("Manual payment callback body must be JSON.");
    }

    return {
      provider: this.provider,
      eventType: requireString(payload?.eventType, "eventType"),
      providerEventId: requireString(payload?.providerEventId, "providerEventId"),
      providerPaymentId: requireString(payload?.providerPaymentId, "providerPaymentId"),
      orderId: requireString(payload?.orderId, "orderId"),
      referenceId: requireString(payload?.referenceId, "referenceId"),
      providerStatus: requireString(payload?.providerStatus, "providerStatus"),
      amountValue: requireNonNegativeInteger(payload?.amountValue, "amountValue"),
      currency: requireString(payload?.currency, "currency"),
      occurredAt: payload?.occurredAt || this.now(),
    };
  }

  async createRefund({ order, referenceId, idempotencyKey, reason, amountValue, metadata }) {
    if (this.refundsByKey.has(idempotencyKey)) {
      return cloneJson(this.refundsByKey.get(idempotencyKey));
    }

    const refund = {
      provider: this.provider,
      providerRefundId: `${this.provider}_refund_${order.id}`,
      referenceId,
      status: "pending",
      providerStatus: "REFUND_PENDING",
      amountValue,
      currency: order.currency,
      checkedAt: this.now(),
      reason: reason || null,
      metadata: cloneJson(metadata || null),
    };

    this.refundsByKey.set(idempotencyKey, refund);
    this.refundsById.set(refund.providerRefundId, refund);
    return cloneJson(refund);
  }

  async queryRefund({ providerRefundId }) {
    const refund = this.refundsById.get(providerRefundId);
    if (!refund) {
      throw new PaymentProviderContractError(
        `Manual refund "${providerRefundId}" was not found.`,
      );
    }
    return {
      ...cloneJson(refund),
      checkedAt: this.now(),
    };
  }
}

function signManualPaymentCallback({ callbackSecret, rawBody }) {
  return crypto
    .createHmac("sha256", callbackSecret)
    .update(String(rawBody), "utf8")
    .digest("hex");
}

function readHeader(headers, headerName) {
  const key = headerName.toLowerCase();
  const value = headers?.[key] ?? headers?.[headerName];
  return typeof value === "string" ? value : "";
}

function requireString(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PaymentProviderContractError(`${field} is required.`);
  }
  return value.trim();
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new PaymentProviderContractError(`${field} must be a non-negative integer.`);
  }
  return value;
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  ManualPaymentProvider,
  signManualPaymentCallback,
};
