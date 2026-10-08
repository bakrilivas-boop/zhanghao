import { getChatGPTUser } from "@/app/chatgpt-auth";
import { accountKey, database, eventStatement, listAccounts, pack } from "@/db/store";
import { BACKUP_APP, InputError, parseImport, parseLine, validateBackup } from "@/lib/records";

export const dynamic = "force-dynamic";
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });

export async function GET(request: Request) {
  if (!await getChatGPTUser()) return reply({ error: "登录已过期，请重新登录", signIn: true }, 401);
  try {
    const latest = await database().prepare("SELECT id FROM events ORDER BY rowid DESC LIMIT 1").first<{ id: string }>();
    const etag = `"${latest?.id || "empty"}"`;
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": "no-store" } });
    const [accounts, events] = await Promise.all([
      listAccounts(), database().prepare("SELECT id, action, count, summary, created_at AS createdAt FROM events ORDER BY rowid DESC LIMIT 300").all(),
    ]);
    const response = reply({ accounts, events: events.results, syncedAt: new Date().toISOString() });
    response.headers.set("ETag", etag);
    return response;
  } catch {
    console.error("inventory_load_failed");
    return reply({ error: "暂时无法读取云端记录，请稍后刷新" }, 503);
  }
}

export async function POST(request: Request) {
  if (!await getChatGPTUser()) return reply({ error: "登录已过期，请重新登录", signIn: true }, 401);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return reply({ error: "请求来源无效" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "请求格式无效" }, 415);
  try {
    const text = await request.text();
    if (text.length > 8_000_000) throw new InputError("文件过大，请分批导入");
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new InputError("请求格式不正确");
    const db = database();
    const accounts = await listAccounts();
    const existingNames = new Set(accounts.map(a => a.account.toLowerCase()));
    const indexed = new Map(accounts.map(a => [a.id, a]));
    const stamp = new Date().toISOString();
    if (data.action === "preview" || data.action === "import") {
      const { preview, valid } = parseImport(data.text, existingNames);
      if (data.action === "preview") return reply({ ...preview, rows: preview.rows.slice(0, 100) });
      if (!valid.length) return reply({ added: 0, duplicates: preview.duplicates, invalid: preview.invalid });
      const batchId = crypto.randomUUID();
      const inserts = await Promise.all(valid.map(async a => db.prepare(
        "INSERT OR IGNORE INTO accounts(id,account_key,payload,created_at) VALUES(?,?,?,?)"
      ).bind(`${batchId}.${crypto.randomUUID()}`, await accountKey(a.account), await pack(a.raw), stamp)));
      const audit = db.prepare("INSERT INTO events(id,action,count,summary,created_at) SELECT ?,'import',COUNT(*),'导入 '||COUNT(*)||' 条账号',? FROM accounts WHERE id LIKE ? HAVING COUNT(*)>0").bind(crypto.randomUUID(), stamp, `${batchId}.%`);
      const result = await db.batch([...inserts, audit]);
      const added = result.slice(0, -1).reduce((n, r) => n + r.meta.changes, 0);
      return reply({ added, duplicates: preview.duplicates + valid.length - added, invalid: preview.invalid });
    }
    if (data.action === "restore") {
      const records = validateBackup(data.backup);
      const fresh = records.filter(r => !existingNames.has(parseLine(r.raw).account.toLowerCase()));
      if (!fresh.length) return reply({ added: 0, duplicates: records.length });
      const batchId = crypto.randomUUID();
      const inserts = await Promise.all(fresh.map(async r => db.prepare(
        "INSERT OR IGNORE INTO accounts(id,account_key,payload,status,created_at,sold_at) VALUES(?,?,?,?,?,?)"
      ).bind(`${batchId}.${crypto.randomUUID()}`, await accountKey(parseLine(r.raw).account), await pack(r.raw, r.note), r.status, r.createdAt, r.soldAt)));
      const audit = db.prepare("INSERT INTO events(id,action,count,summary,created_at) SELECT ?,'restore',COUNT(*),'恢复 '||COUNT(*)||' 条备份记录',? FROM accounts WHERE id LIKE ? HAVING COUNT(*)>0").bind(crypto.randomUUID(), stamp, `${batchId}.%`);
      const result = await db.batch([...inserts, audit]);
      const added = result.slice(0, -1).reduce((n, r) => n + r.meta.changes, 0);
      return reply({ added, duplicates: records.length - added });
    }
    if (data.action === "status") {
      if (!["available", "sold"].includes(data.status) || !Array.isArray(data.records) || !data.records.length || data.records.length > 2000) throw new InputError("请选择账号和有效的销售状态");
      const seen = new Set<string>();
      const chosen = data.records.map((r: { id: string; version: number }) => {
        const a = indexed.get(r.id);
        if (!a || a.version !== r.version || seen.has(r.id)) throw new InputError("记录已在另一端变更，请刷新后重试");
        seen.add(r.id);
        return a;
      }).filter((a: { status: string }) => a.status !== data.status);
      if (!chosen.length) return reply({ changed: 0 });
      // Guard and version update run atomically. A stale version rolls back the entire batch.
      const statements = chosen.flatMap((a: { id: string; version: number }) => [
        db.prepare("INSERT INTO events(id,action,count,summary,created_at) SELECT ?,NULL,0,'','' WHERE NOT EXISTS(SELECT 1 FROM accounts WHERE id=? AND version=?)").bind(crypto.randomUUID(), a.id, a.version),
        db.prepare("UPDATE accounts SET status=?,sold_at=?,version=version+1 WHERE id=? AND version=?").bind(data.status, data.status === "sold" ? stamp : null, a.id, a.version),
      ]);
      const names = chosen.slice(0, 3).map((a: { account: string }) => a.account).join("、");
      await db.batch([...statements, eventStatement(data.status === "sold" ? "sold" : "available", chosen.length, `${data.status === "sold" ? "标记已售" : "恢复待售"} ${chosen.length} 条：${names}${chosen.length > 3 ? " 等" : ""}`)]);
      return reply({ changed: chosen.length });
    }
    if (data.action === "update" || data.action === "delete") {
      const a = indexed.get(data.id);
      if (!a || a.version !== data.version) throw new InputError("记录已在另一端变更，请刷新后重试");
      const guard = db.prepare("INSERT INTO events(id,action,count,summary,created_at) SELECT ?,NULL,0,'','' WHERE NOT EXISTS(SELECT 1 FROM accounts WHERE id=? AND version=?)").bind(crypto.randomUUID(), a.id, a.version);
      if (data.action === "delete") {
        await db.batch([guard, db.prepare("DELETE FROM accounts WHERE id=? AND version=?").bind(a.id, a.version), eventStatement("delete", 1, `删除账号 ${a.account}`)]);
      } else {
        const parsed = parseLine(data.raw);
        if (typeof data.note !== "string" || data.note.length > 2000) throw new InputError("备注最多 2000 字");
        if (accounts.some(other => other.id !== a.id && other.account.toLowerCase() === parsed.account.toLowerCase())) throw new InputError("这个账号已经存在");
        await db.batch([guard, db.prepare("UPDATE accounts SET account_key=?,payload=?,version=version+1 WHERE id=? AND version=?")
          .bind(await accountKey(parsed.account), await pack(parsed.raw, data.note), a.id, a.version), eventStatement("update", 1, `编辑账号 ${parsed.account}`)]);
      }
      return reply({ saved: true });
    }
    if (data.action === "export") {
      if (!Array.isArray(data.ids) || !data.ids.length || data.ids.length > 2000 || new Set(data.ids).size !== data.ids.length) throw new InputError("每次请选择 1–2000 条记录导出");
      const chosen = data.ids.map((id: string) => {
        const a = indexed.get(id);
        if (!a) throw new InputError("部分记录已变更，请刷新后导出");
        return a;
      });
      await eventStatement("export", chosen.length, `导出 ${chosen.length} 条账号`).run();
      return reply({ text: chosen.map((a: { raw: string }) => a.raw).join("\n"), backup: {
        app: BACKUP_APP, version: 1, exportedAt: stamp,
        accounts: chosen.map(({ raw, note, status, createdAt, soldAt }: typeof accounts[number]) => ({ raw, note, status, createdAt, soldAt })),
      } });
    }
    throw new InputError("操作无效");
  } catch (error) {
    if (error instanceof InputError) return reply({ error: error.message }, 400);
    if (error instanceof SyntaxError) return reply({ error: "JSON 文件格式不正确" }, 400);
    if ((error as Error).message?.includes("NOT NULL") || (error as Error).message?.includes("UNIQUE constraint")) return reply({ error: "记录已在另一端变更，请刷新后重试" }, 409);
    console.error("inventory_write_failed");
    return reply({ error: "云端保存失败，请稍后重试；当前输入已保留" }, 503);
  }
}
