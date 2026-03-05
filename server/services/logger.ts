import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import path from "path";
import fs from "fs";

const LOG_DIR = process.env.LOG_DIR || "./logs";

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const combinedTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, "combined-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d",
  format: jsonFormat,
});

const errorTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, "error-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "30d",
  level: "error",
  format: jsonFormat,
});

const auditTransport = new DailyRotateFile({
  filename: path.join(LOG_DIR, "audit-%DATE%.log"),
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "50m",
  maxFiles: "90d",
  format: jsonFormat,
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    combinedTransport,
    errorTransport,
    new winston.transports.Console({
      format: logFormat,
    }),
  ],
});

const auditLogger = winston.createLogger({
  level: "info",
  transports: [
    auditTransport,
    new winston.transports.Console({
      format: logFormat,
    }),
  ],
});

export function logInfo(message: string, metadata?: Record<string, any>) {
  logger.info(message, metadata);
}

export function logError(message: string, error?: Error | unknown, metadata?: Record<string, any>) {
  const errorMeta = error instanceof Error 
    ? { error: error.message, stack: error.stack } 
    : { error: String(error) };
  logger.error(message, { ...errorMeta, ...metadata });

  persistSystemLog("error", message, error, metadata);
}

export function logWarnPersist(message: string, metadata?: Record<string, any>) {
  logger.warn(message, metadata);
  persistSystemLog("warn", message, undefined, metadata);
}

function persistSystemLog(level: string, message: string, error?: Error | unknown, metadata?: Record<string, any>) {
  try {
    const { storage: storageInstance } = require("../storage");
    if (!storageInstance) return;
    const stack = error instanceof Error ? error.stack : undefined;
    const errorCode = error instanceof Error ? error.name : undefined;
    const metaStr = metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined;
    const source = metadata?.source || metadata?.service || extractSource(message);
    const endpoint = metadata?.endpoint || metadata?.path || undefined;
    const userId = metadata?.userId || undefined;
    const ipAddress = metadata?.ipAddress || metadata?.ip || undefined;

    storageInstance.createSystemLog({
      level,
      message,
      source,
      errorCode,
      stack,
      metadata: metaStr,
      endpoint,
      userId,
      ipAddress,
    }).catch(() => {});
  } catch {}
}

function extractSource(message: string): string {
  if (message.includes("FedEx") || message.includes("FEDEX") || message.includes("fedex")) return "fedex";
  if (message.includes("Zoho") || message.includes("ZOHO") || message.includes("zoho")) return "zoho";
  if (message.includes("Moyasar") || message.includes("moyasar")) return "moyasar";
  if (message.includes("Stripe") || message.includes("stripe")) return "stripe";
  if (message.includes("SMTP") || message.includes("email") || message.includes("Email")) return "email";
  if (message.includes("carrier")) return "carrier";
  if (message.includes("database") || message.includes("Database") || message.includes("SQL")) return "database";
  if (message.includes("auth") || message.includes("login") || message.includes("session")) return "auth";
  return "system";
}

export function logWarn(message: string, metadata?: Record<string, any>) {
  logger.warn(message, metadata);
}

export function logDebug(message: string, metadata?: Record<string, any>) {
  logger.debug(message, metadata);
}

export interface AuditLogData {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export function logAuditToFile(data: AuditLogData) {
  auditLogger.info("AUDIT", {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

export function logApiRequest(
  method: string,
  path: string,
  statusCode: number,
  duration: number,
  metadata?: Record<string, any>
) {
  logger.info(`${method} ${path} ${statusCode} in ${duration}ms`, metadata);
}

export function logWebhook(
  source: string,
  eventType: string,
  status: "received" | "processed" | "failed",
  metadata?: Record<string, any>
) {
  logger.info(`WEBHOOK [${source}] ${eventType} - ${status}`, metadata);
}

export function logIntegration(
  service: string,
  operation: string,
  status: "success" | "error",
  metadata?: Record<string, any>
) {
  if (status === "error") {
    logger.error(`INTEGRATION [${service}] ${operation} failed`, metadata);
  } else {
    logger.info(`INTEGRATION [${service}] ${operation} success`, metadata);
  }
}

export function logPricingChange(
  adminId: string,
  profileType: string,
  oldMargin: number,
  newMargin: number,
  metadata?: Record<string, any>
) {
  auditLogger.info("PRICING_CHANGE", {
    adminId,
    profileType,
    oldMargin,
    newMargin,
    ...metadata,
    timestamp: new Date().toISOString(),
  });
}

export function logProfileChange(
  adminId: string,
  clientId: string,
  oldProfile: string,
  newProfile: string,
  metadata?: Record<string, any>
) {
  auditLogger.info("PROFILE_CHANGE", {
    adminId,
    clientId,
    oldProfile,
    newProfile,
    ...metadata,
    timestamp: new Date().toISOString(),
  });
}

export default logger;
