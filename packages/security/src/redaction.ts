/**
 * Webhook & Log Sensitive Data Redaction / Minimization
 * Specification: Prompt 18 & Section 15, 43 of 01_ENGINEERING_SPEC.md
 */

// Keys whose values should always be completely redacted
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /client[_-]?secret/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /authorization/i,
  /private[_-]?key/i,
  /cvv/i,
  /cvc/i,
  /card[_-]?code/i,
  /security[_-]?code/i,
  /ssn/i,
  /tax[_-]?id/i,
];

// Regex to detect credit card numbers (13-19 digits, Luhn pattern)
const CREDIT_CARD_REGEX = /\b(?:\d[ -]*?){13,19}\b/g;

/**
 * Mask a credit card number to show only the last 4 digits
 */
export function maskCreditCard(cardNumber: string): string {
  const digitsOnly = cardNumber.replace(/\D/g, "");
  if (digitsOnly.length < 13 || digitsOnly.length > 19) {
    return cardNumber;
  }
  const last4 = digitsOnly.slice(-4);
  return `****-****-****-${last4}`;
}

/**
 * Recursively redacts sensitive values (passwords, tokens, CVV, credit cards)
 * from arbitrary JavaScript objects or arrays, returning a clean clone.
 */
export function redactSensitiveData<T>(input: T): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    // Redact credit cards in string content
    return input.replace(CREDIT_CARD_REGEX, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19) {
        return maskCreditCard(match);
      }
      return match;
    }) as unknown as T;
  }

  if (typeof input === "number" || typeof input === "boolean") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      const isSensitiveKey = SENSITIVE_KEY_PATTERNS.some((pattern) =>
        pattern.test(key)
      );

      if (isSensitiveKey) {
        result[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        result[key] = redactSensitiveData(value);
      } else if (typeof value === "object" && value !== null) {
        result[key] = redactSensitiveData(value);
      } else {
        result[key] = value;
      }
    }
    return result as T;
  }

  return input;
}

/**
 * Redacts a raw JSON string or string payload, returning the sanitized JSON string.
 */
export function redactRawPayloadString(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const sanitized = redactSensitiveData(parsed);
    return JSON.stringify(sanitized);
  } catch {
    // Fallback regex string replacement for non-JSON string
    return raw.replace(CREDIT_CARD_REGEX, (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19) {
        return maskCreditCard(match);
      }
      return match;
    });
  }
}
