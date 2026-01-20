import { ApiError } from "../utils/ApiError.js";

const buckets = new Map();

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" && forwarded.split(",")[0]?.trim()) ||
    req.ip ||
    req.connection?.remoteAddress ||
    "unknown";
  return ip;
}

export function rateLimit({ windowMs = 60_000, max = 120, keyPrefix = "" } = {}) {
  return (req, _res, next) => {
    const now = Date.now();
    const key = `${keyPrefix}${getClientKey(req)}:${req.method}:${req.baseUrl}${req.path}`;

    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(key, { windowStart: now, count: 1 });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) {
      return next(new ApiError(429, "Too many requests"));
    }

    return next();
  };
}

