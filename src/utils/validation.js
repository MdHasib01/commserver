import mongoose from "mongoose";
import { ApiError } from "./ApiError.js";

export function sanitizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function requireString(value, fieldName) {
  const sanitized = sanitizeString(value);
  if (!sanitized) throw new ApiError(400, `${fieldName} is required`);
  return sanitized;
}

export function requireNumber(value, fieldName) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ApiError(400, `${fieldName} must be a number`);
  }
  return value;
}

export function requireNonNegativeNumber(value, fieldName) {
  const num = requireNumber(value, fieldName);
  if (num < 0) throw new ApiError(400, `${fieldName} must be >= 0`);
  return num;
}

export function requireObjectId(value, fieldName) {
  if (!mongoose.isValidObjectId(value)) {
    throw new ApiError(400, `Invalid ${fieldName}`);
  }
  return value;
}

export function pickDefined(source, allowedKeys) {
  const out = {};
  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const value = source[key];
      if (value !== undefined) out[key] = value;
    }
  }
  return out;
}

