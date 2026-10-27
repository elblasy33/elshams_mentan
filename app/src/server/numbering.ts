import type { Tx } from "./db";

/** ترقيم ذري: INSERT ... ON CONFLICT DO UPDATE يقفل الصف فلا يتكرر الرقم تحت التزامن. */
export async function nextSeq(tx: Tx, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Sequence" ("key","value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Sequence"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}

export async function nextNumber(tx: Tx, prefix: string, withYear = true, pad = 5): Promise<string> {
  const year = new Date().getFullYear();
  const key = withYear ? `${prefix}-${year}` : prefix;
  const n = await nextSeq(tx, key);
  return `${prefix}${withYear ? `-${year}` : ""}-${String(n).padStart(pad, "0")}`;
}
