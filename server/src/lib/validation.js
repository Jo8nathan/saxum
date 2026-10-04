'use strict';

/**
 * Input validation helpers. Every helper either returns a cleaned value
 * or throws a ValidationError (mapped to HTTP 400 by the error handler).
 */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(value, name, { min = 1, max = 2000, allowEmpty = false } = {}) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be a string`);
  }
  const v = value.trim();
  if (!allowEmpty && v.length === 0) {
    throw new ValidationError(`${name} must not be empty`);
  }
  if (v.length < min) {
    throw new ValidationError(`${name} must be at least ${min} characters`);
  }
  if (v.length > max) {
    throw new ValidationError(`${name} must be at most ${max} characters`);
  }
  return v;
}

function optionalStr(value, name, opts = {}) {
  if (value === undefined || value === null) return undefined;
  return str(value, name, opts);
}

function intInRange(value, name, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ValidationError(`${name} must be an integer between ${min} and ${max}`);
  }
  return n;
}

function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`${name} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function uuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new ValidationError(`${name} must be a valid UUID`);
  }
  return value;
}

/**
 * Validates a data-URL image and enforces a byte-size cap.
 * Returns the data URL unchanged.
 */
function dataUrl(value, name, maxBytes) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${name} must be a data URL string`);
  }
  if (!/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)) {
    throw new ValidationError(`${name} must be a base64 image data URL`);
  }
  // Approx byte size of the base64 payload.
  const payload = value.slice(value.indexOf(',') + 1);
  const bytes = Math.floor((payload.length * 3) / 4);
  if (bytes > maxBytes) {
    throw new ValidationError(`${name} exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit`);
  }
  return value;
}

function queryInt(value, name, { min, max, def }) {
  if (value === undefined) return def;
  return intInRange(value, name, min, max);
}

module.exports = {
  ValidationError,
  str,
  optionalStr,
  intInRange,
  oneOf,
  uuid,
  dataUrl,
  queryInt,
};
