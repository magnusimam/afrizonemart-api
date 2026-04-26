import winston from 'winston';
import { env, isProduction } from '@/config/env';

/**
 * Structured JSON logger (Principle #10 — Observability by Default).
 *
 * Every meaningful action calls `logger.info('event.name', { ... })` with
 * a structured payload. In production the output is JSON ready for log
 * aggregation (Railway → Logtail / Datadog / Better Stack).
 *
 * In development we use a colorized human-readable format.
 */
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

const developmentFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level} ${message}${metaStr}`;
  }),
);

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: isProduction ? productionFormat : developmentFormat,
  transports: [new winston.transports.Console()],
});
