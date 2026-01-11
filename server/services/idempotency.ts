import { logInfo } from "./logger";
import { db } from "../db";
import { idempotencyRecords } from "@shared/schema";
import { eq, lt } from "drizzle-orm";

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface IdempotencyResult {
  response: any;
  statusCode: number;
}

export async function getIdempotencyRecord(key: string): Promise<IdempotencyResult | null> {
  try {
    const records = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.key, key))
      .limit(1);
    
    const record = records[0];
    
    if (!record) {
      return null;
    }
    
    if (new Date() > record.expiresAt) {
      await db.delete(idempotencyRecords).where(eq(idempotencyRecords.key, key));
      return null;
    }
    
    logInfo("Idempotency cache hit", { key });
    return {
      response: JSON.parse(record.response),
      statusCode: record.statusCode,
    };
  } catch (error) {
    return null;
  }
}

export async function setIdempotencyRecord(
  key: string,
  response: any,
  statusCode: number
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
    
    await db.insert(idempotencyRecords).values({
      key,
      response: JSON.stringify(response),
      statusCode,
      createdAt: now,
      expiresAt,
    }).onConflictDoNothing();
    
    logInfo("Idempotency record stored", { key });
  } catch (error) {
    // Ignore errors - idempotency is best-effort
  }
}

export async function clearExpiredRecords(): Promise<void> {
  try {
    const result = await db
      .delete(idempotencyRecords)
      .where(lt(idempotencyRecords.expiresAt, new Date()));
    
    logInfo("Cleared expired idempotency records");
  } catch (error) {
    // Ignore errors
  }
}

setInterval(clearExpiredRecords, 60 * 60 * 1000);

export function generateIdempotencyKey(
  userId: string | undefined,
  method: string,
  path: string,
  body: any
): string {
  const crypto = require("crypto");
  const payload = JSON.stringify({ userId, method, path, body });
  return crypto.createHash("sha256").update(payload).digest("hex");
}
