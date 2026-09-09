import { describe, expect, it } from "vitest";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { clientAccounts } from "../shared/schema";
import { sql } from "drizzle-orm";

/**
 * Account numbers are generated, not sequenced by the database, so the generator has to find
 * the current maximum itself. It used to do that with `ORDER BY account_number DESC`, which is
 * a TEXT sort: once EZ10000 existed the query still answered EZ9999, because '9' sorts above
 * '1'. The generator then proposed EZ10000 forever — every insert conflicted, all five retries
 * produced the same number, and no client account could be created again.
 *
 * Zero-padding to four digits hid this precisely until the 10,000th account, and nothing about
 * it self-heals: it is a permanent onboarding outage that arrives without warning.
 */
async function numericMax(): Promise<number> {
  const [row] = await db
    .select({ maxNumber: sql<number | null>`max(substring(${clientAccounts.accountNumber} from 3)::bigint)` })
    .from(clientAccounts)
    .where(sql`${clientAccounts.accountNumber} ~ '^EZ[0-9]+$'`);
  return Number(row?.maxNumber ?? 0);
}

async function createAccount(label: string) {
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return storage.createClientAccount({
    name: `${label} ${unique}`,
    email: `acctnum_${unique}@test.com`,
    phone: "5551234567",
    country: "Saudi Arabia",
    profile: "regular",
    accountType: "company",
    isActive: true,
  } as any);
}

describe("client account numbering", () => {
  it("keeps counting past the four-digit boundary", async () => {
    // Plant a number wider than the padding. Under the text sort this is invisible to the
    // generator, which then reissues a number that already exists.
    const planted = `EZ${await numericMax() + 5000}`;
    await db.insert(clientAccounts).values({
      name: `Numbering Fixture ${planted}`,
      email: `fixture_${planted.toLowerCase()}@test.com`,
      phone: "5551234567",
      country: "Saudi Arabia",
      profile: "regular",
      accountType: "company",
      isActive: true,
      accountNumber: planted,
    } as any);

    const before = await numericMax();
    const created = await createAccount("Numbering");

    // Greater-than rather than exactly `before + 1`: test files run in parallel, and another
    // one creating an account in between is legitimate. What must hold is that the generator
    // counted past the planted wide number instead of reissuing beneath it.
    expect(Number(created.accountNumber.slice(2))).toBeGreaterThan(before);
    expect(created.accountNumber).toMatch(/^EZ[0-9]+$/);
  });

  it("issues distinct numbers for accounts created back to back", async () => {
    const first = await createAccount("Sequential A");
    const second = await createAccount("Sequential B");
    expect(first.accountNumber).not.toBe(second.accountNumber);
    expect(Number(second.accountNumber.slice(2))).toBe(Number(first.accountNumber.slice(2)) + 1);
  });

  it("issues distinct numbers when accounts are created concurrently", async () => {
    // The generator reads `max(...) + 1` and then inserts, so simultaneous callers all propose
    // the same number and all but one hit the unique constraint. A retry loop exists for
    // exactly this — but its conflict check read `code`/`constraint` off the error Drizzle
    // throws, while the Postgres fields live on `error.cause`. The check never matched, the
    // retry never ran, and the loser got a 500 with no account.
    //
    // Self-serve signup makes this ordinary rather than rare: guests register whenever they
    // finish a shipment, with no admin serialising the work.
    const created = await Promise.all([
      createAccount("Concurrent A"),
      createAccount("Concurrent B"),
      createAccount("Concurrent C"),
      createAccount("Concurrent D"),
    ]);

    const numbers = created.map((account) => account.accountNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    for (const number of numbers) {
      expect(number).toMatch(/^EZ[0-9]+$/);
    }
  });
});
