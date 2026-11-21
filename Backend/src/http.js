import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);

/** Parse req.query / req.body / req.params with a zod schema or throw a 400. */
export function parse(schema, data) {
  const r = schema.safeParse(data ?? {});
  if (!r.success) {
    throw new HttpError(
      400,
      'Invalid request',
      r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return r.data;
}

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const idParam = z.object({ id: z.coerce.number().int().positive() });

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function tokenFrom(req) {
  const h = req.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

export function isAdmin(req, config) {
  const token = tokenFrom(req);
  return Boolean(config.ADMIN_TOKEN) && Boolean(token) && safeEqual(token, config.ADMIN_TOKEN);
}

/** Middleware: require the reviewer/admin bearer token. */
export function requireAdmin(config) {
  return (req, _res, next) => {
    if (!config.ADMIN_TOKEN) {
      return next(new HttpError(503, 'Reviewer actions are disabled: set ADMIN_TOKEN on the API server.'));
    }
    if (!isAdmin(req, config)) return next(new HttpError(401, 'A valid reviewer token is required.'));
    req.actor = 'reviewer';
    next();
  };
}

export function errorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, _next) => {
    let status = err.status || err.statusCode || 500;
    if (err.code === 'LIMIT_FILE_SIZE') status = 413;
    if (err.type === 'entity.too.large') status = 413;
    if (err.type === 'entity.parse.failed') status = 400;
    const body = { error: status >= 500 ? 'Internal server error' : err.message };
    if (err.details) body.details = err.details;
    if (status >= 500) {
      console.error(`[api] ${req.method} ${req.originalUrl} failed:`, err);
      if (!config.isProd) body.debug = err.message;
    }
    res.status(status).json(body);
  };
}

export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'company';
}

/** Normalise a company name for duplicate detection ("Tata Steel Ltd." == "TATA STEEL LIMITED"). */
export function nameKey(name) {
  return slugify(name)
    .replace(/-(ltd|limited|inc|incorporated|corp|corporation|plc|llc|ag|sa|nv|co|company|group|holdings?)$/g, '')
    .replace(/-(ltd|limited|inc|corp|plc)$/g, '');
}
