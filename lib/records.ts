export const BACKUP_APP = "zhanghao-inventory";
export type Status = "available" | "sold";
export type Parsed = { raw: string; account: string; fieldCount: number };
export type Account = Parsed & { id: string; note: string; status: Status; createdAt: string; soldAt: string | null; version: number };
export type HistoryEvent = { id: string; action: string; count: number; summary: string; createdAt: string };
export type PreviewRow = { line: number; account?: string; fieldCount?: number; kind: "new" | "duplicate" | "invalid"; reason?: string };
export type Preview = { added: number; duplicates: number; invalid: number; rows: PreviewRow[] };
export type Backup = { app: string; version: number; exportedAt: string; accounts: Pick<Account, "raw" | "note" | "status" | "createdAt" | "soldAt">[] };

export class InputError extends Error {}

export function maskEmail(account: string): string {
  const at = account.lastIndexOf("@");
  if (at <= 0 || at === account.length - 1) return account;
  const name = Array.from(account.slice(0, at));
  const masked = name.length === 1 ? "***" : `${name[0]}***${name.length > 2 ? name.at(-1) : ""}`;
  return masked + account.slice(at);
}

export function parseLine(value: unknown): Parsed {
  if (typeof value !== "string") throw new InputError("账号内容必须是文本");
  const raw = value.replace(/^\uFEFF/, "").trim();
  if (!raw || /[\r\n\0]/.test(raw)) throw new InputError("一行只能放一条账号记录");
  if (raw.length > 65536) throw new InputError("单条记录过长");
  const fields = raw.split("---");
  if (fields.length < 2) throw new InputError("缺少 --- 分隔符");
  const account = fields[0].trim();
  if (!account || /\s/.test(account)) throw new InputError("账号为空或包含空格");
  return { raw, account, fieldCount: fields.length };
}

export function parseImport(text: unknown, existing: Set<string> = new Set()) {
  if (typeof text !== "string" || text.length > 4_000_000 || new TextEncoder().encode(text).byteLength > 4_000_000) throw new InputError("一次最多导入 4 MB 文本");
  const rows: PreviewRow[] = [];
  const valid: Parsed[] = [];
  const seen = new Set(existing);
  let added = 0, duplicates = 0, invalid = 0;
  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    try {
      const parsed = parseLine(line);
      const key = parsed.account.toLowerCase();
      const duplicate = seen.has(key);
      if (duplicate) duplicates++; else { added++; valid.push(parsed); }
      seen.add(key);
      rows.push({ line: index + 1, account: parsed.account, fieldCount: parsed.fieldCount, kind: duplicate ? "duplicate" : "new" });
    } catch (error) {
      invalid++;
      rows.push({ line: index + 1, kind: "invalid", reason: (error as Error).message });
    }
  });
  if (rows.length > 2000) throw new InputError("一次最多导入 2000 条，请分批导入");
  return { preview: { added, duplicates, invalid, rows }, valid };
}

export function validateBackup(input: unknown): Backup["accounts"] {
  const backup = input as Backup;
  if (!backup || backup.app !== BACKUP_APP || backup.version !== 1 || !Array.isArray(backup.accounts)) throw new InputError("请选择本工具导出的 JSON 备份");
  if (!backup.accounts.length || backup.accounts.length > 2000) throw new InputError("备份需包含 1–2000 条记录，请分批导出备份");
  const seen = new Set<string>();
  return backup.accounts.map((record, index) => {
    if (!record || typeof record !== "object") throw new InputError(`备份第 ${index + 1} 条记录无效`);
    const { raw, account } = parseLine(record.raw);
    if (seen.has(account.toLowerCase())) throw new InputError(`备份第 ${index + 1} 条账号重复`);
    seen.add(account.toLowerCase());
    if (!["available", "sold"].includes(record.status) || typeof record.note !== "string" || record.note.length > 2000) throw new InputError(`备份第 ${index + 1} 条状态或备注无效`);
    if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt)) ||
      (record.soldAt !== null && (typeof record.soldAt !== "string" || !Number.isFinite(Date.parse(record.soldAt))))) throw new InputError(`备份第 ${index + 1} 条时间无效`);
    return { raw, note: record.note, status: record.status, createdAt: record.createdAt, soldAt: record.status === "sold" ? (record.soldAt || record.createdAt) : null };
  });
}
