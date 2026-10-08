"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, Check, CheckCheck, Cloud, Copy, Download, Eye, EyeOff, FileText, History, Inbox, ListChecks, Loader2, LockKeyhole, Package, RefreshCw, Search, ShieldCheck, Trash2, Undo2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { Toaster } from "@/components/ui/sonner";
import { Progress } from "@/components/ui/progress";
import { Account, Backup, HistoryEvent, Preview, Status, parseImport, validateBackup } from "@/lib/records";

const labels: Record<string, string> = { import: "导入", sold: "标记已售", available: "恢复待售", update: "编辑", delete: "删除", export: "导出", restore: "恢复备份" };
const date = (value: string | null, full = false) => value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", ...(full ? { year: "numeric", second: "2-digit" } : {}) }) : "—";

async function api<T = unknown>(body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/inventory", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" } : { cache: "no-store" });
  let result;
  try { result = await response.json(); } catch { throw new Error("连接中断，请刷新页面或重新登录"); }
  if (!response.ok) throw new Error((result as { error?: string }).error || "保存失败，请稍后重试");
  return result as T;
}

export default function Inventory({ email }: { email: string }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [events, setEvents] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncedAt, setSyncedAt] = useState("");
  const [section, setSection] = useState("inventory");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [backup, setBackup] = useState<Backup | null>(null);
  const [fileName, setFileName] = useState("");
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("current");
  const [exportFormat, setExportFormat] = useState("txt");
  const [detail, setDetail] = useState<Account | null>(null);
  const [showSecrets, setShowSecrets] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const requestSeq = useRef(0);
  const lastETag = useRef("");
  const [importProblem, setImportProblem] = useState("");

  const refresh = useCallback(async () => {
    const sequence = ++requestSeq.current;
    try {
      const response = await fetch("/api/inventory", { cache: "no-store", headers: lastETag.current ? { "If-None-Match": lastETag.current } : {} });
      if (response.status === 304) {
        if (sequence === requestSeq.current) { setSyncedAt(new Date().toISOString()); setSyncError(""); }
        return;
      }
      const result = await response.json() as { accounts: Account[]; events: HistoryEvent[]; syncedAt: string; error?: string };
      if (!response.ok) throw new Error(result.error || "无法同步云端记录");
      if (sequence !== requestSeq.current) return;
      lastETag.current = response.headers.get("etag") || "";
      setAccounts(result.accounts); setEvents(result.events); setSyncedAt(result.syncedAt); setSyncError("");
      const ids = new Set<string>(result.accounts.map((a: Account) => a.id));
      setSelected(current => new Set([...current].filter(id => ids.has(id))));
    } catch (error) { if (sequence === requestSeq.current) setSyncError((error as Error).message); }
    finally { if (sequence === requestSeq.current) setLoading(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => { clearInterval(interval); window.removeEventListener("focus", focus); };
  }, [refresh]);

  useEffect(() => {
    if (!importOpen || backup) return;
    const timer = setTimeout(() => {
      if (!importText.trim()) { setPreview(null); setImportProblem(""); return; }
      try {
        const result = parseImport(importText, new Set(accounts.map(a => a.account.toLowerCase())));
        setPreview({ ...result.preview, rows: result.preview.rows.slice(0, 100) }); setImportProblem("");
      } catch (error) { setPreview(null); setImportProblem((error as Error).message); }
    }, 250);
    return () => clearTimeout(timer);
  }, [importText, accounts, importOpen, backup]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: unknown) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(context.registerTool({ name: "start_account_import", title: "打开账号导入", description: "打开批量账号导入窗口；只准备导入，不保存记录。", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute(input: unknown) {
        if (!input || typeof input !== "object" || Object.keys(input).length) throw new Error("不接受参数");
        setImportOpen(true); return { opened: true, saved: false };
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Browser may not implement the proposed API. */ }
    return () => lifecycle.abort();
  }, []);

  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await operation(); } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }

  const available = accounts.filter(a => a.status === "available").length;
  const sold = accounts.length - available;
  const filtered = useMemo(() => accounts.filter(a => (filter === "all" || a.status === filter) && (a.account + " " + a.note).toLowerCase().includes(search.toLowerCase().trim())), [accounts, filter, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 30, currentPage * 30);
  const chosen = accounts.filter(a => selected.has(a.id));
  const exportRows = exportScope === "selected" ? chosen : exportScope === "current" ? filtered : exportScope === "all" ? accounts : accounts.filter(a => a.status === exportScope);
  const allChecked = visible.length > 0 && visible.every(a => selected.has(a.id));

  function toggle(id: string) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function selectVisible() { setSelected(current => { const next = new Set(current); visible.forEach(a => allChecked ? next.delete(a.id) : next.add(a.id)); return next; }); }
  function openImport() { setImportOpen(true); }
  function openExport() { setExportScope(selected.size ? "selected" : "current"); setExportOpen(true); }
  function openDetail(a: Account) { setDetail({ ...a }); setShowSecrets(false); }

  async function status(records: Account[], value: Status) {
    await run(async () => {
      const targets = records.filter(a => a.status !== value);
      if (!targets.length) { toast.info("所选账号已经是这个状态"); return; }
      let changed = 0;
      try {
        for (let offset = 0; offset < targets.length; offset += 100) {
          const result = await api<{ changed: number }>({ action: "status", records: targets.slice(offset, offset + 100).map(a => ({ id: a.id, version: a.version })), status: value });
          changed += result.changed;
        }
      } catch (error) {
        await refresh();
        throw new Error(`${changed ? `已保存 ${changed} 条。` : ""}${(error as Error).message}`);
      }
      setSelected(new Set()); await refresh();
      toast.success(`${changed} 条账号已${value === "sold" ? "标记已售" : "恢复待售"}`);
    });
  }

  async function copy(text: string) { try { await navigator.clipboard.writeText(text); toast.success("已复制完整账号，可直接交付"); } catch { toast.error("复制失败，请使用 TXT 导出"); } }

  async function readFile(file: File) {
    await run(async () => {
      if (file.size > 8_000_000) throw new Error("文件最大支持 8 MB");
      const bytes = await file.arrayBuffer();
      let content = new TextDecoder().decode(bytes).replace(/^\uFEFF/, "");
      if (content.includes("\uFFFD")) content = new TextDecoder("gb18030").decode(bytes);
      setFileName(file.name); setPreview(null);
      if (file.name.toLowerCase().endsWith(".json")) {
        let parsed;
        try { parsed = JSON.parse(content); } catch { throw new Error("JSON 文件格式不正确"); }
        const rows = validateBackup(parsed);
        const existing = new Set(accounts.map(a => a.account.toLowerCase()));
        const duplicates = rows.filter(r => existing.has(r.raw.split("---")[0].trim().toLowerCase())).length;
        setBackup(parsed); setImportText(""); setPreview({ added: rows.length - duplicates, duplicates, invalid: 0, rows: [] });
      } else { setBackup(null); setImportText(content); }
    });
  }

  async function importAccounts() {
    await run(async () => {
      const rows = backup ? backup.accounts : parseImport(importText, new Set(accounts.map(a => a.account.toLowerCase()))).valid;
      const result = { added: 0, duplicates: backup ? 0 : (preview?.duplicates || 0), invalid: preview?.invalid || 0 };
      setImportProgress(0);
      try {
        for (let offset = 0; offset < rows.length; offset += 100) {
          const chunk = rows.slice(offset, offset + 100);
          const saved = await api<{ added: number; duplicates: number; invalid?: number }>(backup
            ? { action: "restore", backup: { ...backup, accounts: chunk } }
            : { action: "import", text: (chunk as { raw: string }[]).map(row => row.raw).join("\n") });
          result.added += saved.added;
          result.duplicates += saved.duplicates;
          result.invalid += saved.invalid || 0;
          setImportProgress(Math.min(100, Math.round((offset + chunk.length) / rows.length * 100)));
        }
      } catch (error) {
        await refresh();
        throw new Error(`已保存 ${result.added} 条。${(error as Error).message}；内容已保留，可再次检查后继续导入。`);
      } finally { setImportProgress(null); }
      setImportOpen(false); setImportText(""); setPreview(null); setBackup(null); setFileName("");
      setFilter("all"); setSearch(""); setPage(1); await refresh();
      toast.success(`已保存 ${result.added} 条，跳过 ${result.duplicates} 条重复${result.invalid ? `、${result.invalid} 条格式错误` : ""}`);
    });
  }

  async function exportAccounts(copyOnly = false) {
    await run(async () => {
      const result = await api<{ text: string; backup: Backup }>({ action: "export", ids: exportRows.map(a => a.id) });
      if (copyOnly) await copy(result.text);
      else {
        const content = exportFormat === "json" ? JSON.stringify(result.backup, null, 2) : result.text.replace(/\n/g, "\r\n");
        const blob = new Blob(["\uFEFF", content], { type: exportFormat === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob); const link = document.createElement("a");
        link.href = url; link.download = `账号-${exportScope}-${new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" })}.${exportFormat}`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); toast.success(`已导出 ${exportRows.length} 条账号`);
      }
      setExportOpen(false); await refresh();
    });
  }

  async function saveDetail() {
    if (!detail) return;
    await run(async () => {
      await api({ action: "update", id: detail.id, version: detail.version, raw: detail.raw, note: detail.note });
      setDetail(null); await refresh(); toast.success("账号和备注已保存到云端");
    });
  }

  const actions = (a: Account) => <div className="row-actions">
    <Button size="sm" variant={a.status === "sold" ? "ghost" : "outline"} className={a.status === "sold" ? "restore-button" : "sell-button"} disabled={busy} onClick={() => void status([a], a.status === "sold" ? "available" : "sold")}>{a.status === "sold" ? <Undo2 /> : <Check />}{a.status === "sold" ? "恢复待售" : "标记已售"}</Button>
    <Button size="icon" variant="ghost" aria-label={`复制 ${a.account}`} onClick={() => void copy(a.raw)}><Copy /></Button>
    <Button size="sm" variant="ghost" onClick={() => openDetail(a)}>详情</Button>
  </div>;
  const badge = (a: Account) => <span className={`status-badge ${a.status}`}><span />{a.status === "sold" ? "已售出" : "待出售"}</span>;

  return <div className="app-shell">
    <header className="topbar"><div className="topbar-inner"><a className="brand" href="/"><span className="brand-icon"><ListChecks /></span><span>账号管理<span className="brand-sub">库存工作台</span></span></a><div className="topbar-right"><span className="private-chip"><LockKeyhole />私有空间</span><a className="profile" href="/signout-with-chatgpt?return_to=/" title={`${email} · 点击退出登录`}><span>{email.slice(0, 1).toUpperCase()}</span><span className="profile-email">{email}</span></a></div></div></header>
    <main className="workspace">
      <div className="page-heading"><div><div className="eyebrow">INVENTORY / 账号库存</div><h1>账号库存与销售</h1><p>导入、标记、交付，手机和电脑共用一份记录。</p></div><div className="main-actions"><Button variant="outline" onClick={openExport} disabled={!accounts.length || busy}><Download />导出账号</Button><Button onClick={openImport} disabled={busy}><Upload />批量导入</Button></div></div>
      <div className="stats-grid"><div className="stat-card total"><div><span>全部账号</span><strong>{loading ? "—" : accounts.length.toLocaleString()}</strong><small>云端库存总数</small></div><span className="stat-icon"><Package /></span></div><div className="stat-card available-stat"><div><span>待出售</span><strong>{loading ? "—" : available.toLocaleString()}</strong><small>可选择并导出交付</small></div><span className="stat-icon"><Inbox /></span></div><div className="stat-card sold-stat"><div><span>已售出</span><strong>{loading ? "—" : sold.toLocaleString()}</strong><small>保留售出时间与记录</small></div><span className="stat-icon"><CheckCheck /></span></div></div>
      {syncError && <div className="sync-error" role="alert"><span>{syncError}。当前显示的是上次同步结果。</span><Button variant="outline" size="sm" onClick={() => void refresh()}>重试</Button><a href="/signin-with-chatgpt?return_to=/" target="_top">重新登录</a></div>}
      <Tabs value={section} onValueChange={setSection} className="section-tabs"><div className="section-heading"><TabsList variant="line"><TabsTrigger value="inventory"><Archive />账号库存</TabsTrigger><TabsTrigger value="history"><History />操作记录</TabsTrigger></TabsList><div className={`sync-state ${syncError ? "offline" : ""}`}><Cloud /><span>{loading ? "正在读取云端" : syncError ? "同步中断" : `已同步 ${date(syncedAt).split(" ").pop()}`}</span><Button variant="ghost" size="icon" aria-label="刷新云端记录" onClick={() => void refresh()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div></div>
        <TabsContent value="inventory" className="inventory-panel"><div className="inventory-toolbar"><Tabs value={filter} onValueChange={value => { setFilter(value); setPage(1); setSelected(new Set()); }}><TabsList><TabsTrigger value="all">全部 <span>{accounts.length}</span></TabsTrigger><TabsTrigger value="available">待售 <span>{available}</span></TabsTrigger><TabsTrigger value="sold">已售 <span>{sold}</span></TabsTrigger></TabsList></Tabs><div className="search-box"><Search /><Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="搜索账号或买家备注" aria-label="搜索账号或买家备注" />{search && <button aria-label="清空搜索" onClick={() => setSearch("")}><X /></button>}</div></div>
          {selected.size > 0 && <div className="selection-bar"><span>已选择 <strong>{selected.size}</strong> 条</span><div><Button size="sm" variant="ghost" disabled={busy} onClick={() => void status(chosen, "sold")}><Check />标记已售</Button><Button size="sm" variant="ghost" disabled={busy} onClick={() => void status(chosen, "available")}><Undo2 />恢复待售</Button><Button size="sm" variant="ghost" onClick={openExport}><Download />导出所选</Button><Button size="icon" variant="ghost" aria-label="取消选择" onClick={() => setSelected(new Set())}><X /></Button></div></div>}
          {loading ? <div className="loading-state"><Loader2 className="animate-spin" />正在读取账号库存…</div> : filtered.length ? <><div className="desktop-table"><Table><TableHeader><TableRow><TableHead className="check-cell"><Checkbox aria-label="选择本页全部账号" checked={allChecked ? true : visible.some(a => selected.has(a.id)) ? "indeterminate" : false} onCheckedChange={selectVisible} /></TableHead><TableHead>账号 / 邮箱</TableHead><TableHead>凭据</TableHead><TableHead>销售状态</TableHead><TableHead>买家 / 备注</TableHead><TableHead>时间</TableHead><TableHead className="actions-head">操作</TableHead></TableRow></TableHeader><TableBody>{visible.map(a => <TableRow key={a.id} data-state={selected.has(a.id) ? "selected" : undefined}><TableCell className="check-cell"><Checkbox aria-label={`选择 ${a.account}`} checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} /></TableCell><TableCell><button className="account-link" onClick={() => openDetail(a)}>{a.account}</button><span className="record-id">#{a.id.slice(-6).toUpperCase()}</span></TableCell><TableCell><span className="credential-mask">••••••••</span><span className="field-count">{a.fieldCount} 个字段</span></TableCell><TableCell>{badge(a)}</TableCell><TableCell><span className={`note-cell ${!a.note ? "blank" : ""}`}>{a.note || "未填写"}</span></TableCell><TableCell><span className="time-cell">{date(a.soldAt || a.createdAt)}<small>{a.status === "sold" ? "售出" : "导入"}</small></span></TableCell><TableCell>{actions(a)}</TableCell></TableRow>)}</TableBody></Table></div><div className="mobile-list"><div className="mobile-select"><Checkbox id="mobile-all" checked={allChecked} onCheckedChange={selectVisible} /><label htmlFor="mobile-all">选择本页全部</label></div>{visible.map(a => <article className={`mobile-account ${selected.has(a.id) ? "selected" : ""}`} key={a.id}><div className="mobile-account-top"><Checkbox aria-label={`选择 ${a.account}`} checked={selected.has(a.id)} onCheckedChange={() => toggle(a.id)} /><button className="account-link" onClick={() => openDetail(a)}>{a.account}</button>{badge(a)}</div><div className="mobile-account-meta"><span>{a.fieldCount} 个字段 · 凭据已隐藏</span><span>{date(a.soldAt || a.createdAt)}</span></div>{a.note && <div className="mobile-note">{a.note}</div>}{actions(a)}</article>)}</div></> : <Empty className="inventory-empty"><EmptyHeader><EmptyMedia variant="icon"><Inbox /></EmptyMedia><EmptyTitle>{accounts.length ? "没有符合条件的账号" : "先把你的第一批账号放进来"}</EmptyTitle><EmptyDescription>{accounts.length ? "试试其他状态，或清空搜索关键词。" : "粘贴 --- 分隔的账号，或直接拖入 TXT 文件。"}</EmptyDescription></EmptyHeader>{!accounts.length && <Button onClick={openImport}><Upload />批量导入</Button>}{!!accounts.length && <Button variant="outline" onClick={() => { setFilter("all"); setSearch(""); }}>显示全部账号</Button>}</Empty>}
          <div className="table-footer"><span>共 {filtered.length} 条{search ? "匹配记录" : "账号"} · 每页 30 条</span><Pagination aria-label="账号翻页"><PaginationContent><PaginationItem><PaginationLink href="#" aria-label="上一页" aria-disabled={currentPage <= 1} onClick={e => { e.preventDefault(); setPage(Math.max(1, currentPage - 1)); }}>‹</PaginationLink></PaginationItem><PaginationItem><span className="page-number">{currentPage} / {pages}</span></PaginationItem><PaginationItem><PaginationLink href="#" aria-label="下一页" aria-disabled={currentPage >= pages} onClick={e => { e.preventDefault(); setPage(Math.min(pages, currentPage + 1)); }}>›</PaginationLink></PaginationItem></PaginationContent></Pagination></div>
        </TabsContent>
        <TabsContent value="history" className="history-panel"><div className="history-heading"><h2>每一次操作，都有记录</h2><p>最近 300 条记录 · 时间按北京时间显示</p></div>{events.length ? <ol className="history-list">{events.map(event => <li key={event.id}><span className={`event-icon event-${event.action}`}>{event.action === "sold" ? <Check /> : event.action === "export" ? <Download /> : event.action === "import" || event.action === "restore" ? <Upload /> : <History />}</span><div><strong>{event.summary}</strong><span>{labels[event.action] || event.action} · {event.count} 条</span></div><time>{date(event.createdAt, true)}</time></li>)}</ol> : <Empty><EmptyHeader><EmptyMedia variant="icon"><History /></EmptyMedia><EmptyTitle>还没有操作记录</EmptyTitle><EmptyDescription>导入账号后，每次操作都会自动记在这里。</EmptyDescription></EmptyHeader></Empty>}</TabsContent>
      </Tabs>
      <footer className="workspace-footer"><span><ShieldCheck />仅登录后可访问 · 云端加密保存</span><span>自动同步每 15 秒 · 北京时间</span></footer>
    </main>
    <Dialog open={importOpen} onOpenChange={open => { if (!busy) setImportOpen(open); }}><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>批量导入账号</DialogTitle><DialogDescription>一行一条，保留原始字段顺序。新账号默认标记为待售。</DialogDescription></DialogHeader><div className="file-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && !busy) void readFile(file); }}><Upload /><div><strong>{fileName || "拖入 TXT 文件，或选择文件"}</strong><span>也支持本工具导出的 JSON 备份</span></div><Button variant="outline" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}>选择文件</Button><input hidden ref={fileInput} type="file" accept=".txt,.json,text/plain,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void readFile(file); e.target.value = ""; }} /></div>{backup ? <div className="backup-info"><Archive /><div><strong>正在恢复 {backup.accounts.length} 条备份记录</strong><p>保留备份中的销售状态、时间和备注。已存在的账号跳过，不覆盖当前记录。</p></div><Button variant="ghost" size="sm" onClick={() => { setBackup(null); setPreview(null); setFileName(""); }}>改为粘贴</Button></div> : <><label className="field-label" htmlFor="import-text">粘贴账号内容</label><Textarea id="import-text" className="import-text" value={importText} onChange={e => { setImportText(e.target.value); setPreview(null); setFileName(""); }} placeholder={"邮箱---密码---其他凭据\nexample@email.com---password---2FA---RT"} spellCheck={false} /><p className="format-hint"><FileText />支持两列或更多字段，包括空字段；重复账号会跳过。</p></>}{importProgress !== null && <div className="import-progress"><span>正在保存到云端 · {importProgress}%</span><Progress value={importProgress} /></div>}{importProblem && <p role="alert" className="import-problem">{importProblem}</p>}{preview && <div className="import-preview"><div className="preview-counts"><span className="new">可导入 <strong>{preview.added}</strong></span><span>重复 <strong>{preview.duplicates}</strong></span><span className={preview.invalid ? "invalid" : ""}>格式错误 <strong>{preview.invalid}</strong></span></div>{!!preview.rows.length && <div className="preview-rows">{preview.rows.map(row => <div key={row.line}><span>第 {row.line} 行</span><span>{row.account || row.reason}</span><span className={`preview-kind ${row.kind}`}>{row.kind === "new" ? `${row.fieldCount} 字段` : row.kind === "duplicate" ? "跳过重复" : "请修改"}</span></div>)}</div>}{!backup && (preview.duplicates > 0 || preview.invalid > 0) && <p>只导入有效的新账号，重复和错误行会跳过。</p>}</div>}<DialogFooter><Button variant="outline" disabled={busy} onClick={() => setImportOpen(false)}>取消</Button>{!backup && <Button variant="outline" disabled={busy || !importText.trim()} onClick={() => void run(async () => setPreview(await api<Preview>({ action: "preview", text: importText })))}>检查格式</Button>}<Button disabled={busy || !preview?.added} onClick={() => void importAccounts()}>{busy ? <Loader2 className="animate-spin" /> : <Upload />}{backup ? "恢复备份" : `确认导入${preview?.added ? ` ${preview.added} 条` : ""}`}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={exportOpen} onOpenChange={open => { if (!busy) setExportOpen(open); }}><DialogContent><DialogHeader><DialogTitle>导出账号</DialogTitle><DialogDescription>选择交付文件或完整备份。导出不会改变销售状态。</DialogDescription></DialogHeader><label className="field-label" htmlFor="export-scope">导出范围</label><Select value={exportScope} onValueChange={setExportScope}><SelectTrigger id="export-scope" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="selected" disabled={!selected.size}>已勾选账号（{selected.size}）</SelectItem><SelectItem value="current">当前筛选结果（{filtered.length}）</SelectItem><SelectItem value="available">全部待售（{available}）</SelectItem><SelectItem value="sold">全部已售（{sold}）</SelectItem><SelectItem value="all">全部账号（{accounts.length}）</SelectItem></SelectContent></Select><label className="field-label" htmlFor="export-format">文件格式</label><Select value={exportFormat} onValueChange={setExportFormat}><SelectTrigger id="export-format" className="full-select"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="txt">TXT · 原格式交付</SelectItem><SelectItem value="json">JSON · 完整数据备份</SelectItem></SelectContent></Select><div className="export-info"><FileText /><div><strong>即将导出 {exportRows.length} 条账号</strong><p>{exportFormat === "txt" ? "一行一条，保持 --- 分隔格式，包含完整凭据。" : "包含完整凭据、销售状态、售出时间和备注，可再次导入恢复。"}</p><small>导出文件含账号凭据，请妥善保管。</small></div></div><DialogFooter><Button variant="outline" disabled={busy || !exportRows.length} onClick={() => void exportAccounts(true)}><Copy />复制账号</Button><Button disabled={busy || !exportRows.length} onClick={() => void exportAccounts()}><Download />下载 {exportFormat.toUpperCase()}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!detail} onOpenChange={open => { if (!open && !busy) setDetail(null); }}><DialogContent className="wide-dialog"><DialogHeader><DialogTitle>账号详情</DialogTitle><DialogDescription>查看原始字段、填写买家备注，或更新账号内容。</DialogDescription></DialogHeader>{detail && <><div className="detail-top"><strong>{detail.account}</strong>{badge(detail)}</div><div className="detail-times"><span>导入：{date(detail.createdAt, true)}</span>{detail.soldAt && <span>售出：{date(detail.soldAt, true)}</span>}</div><div className="field-heading"><label className="field-label" htmlFor="detail-raw">原始账号内容</label><Button variant="ghost" size="sm" onClick={() => setShowSecrets(!showSecrets)}>{showSecrets ? <EyeOff /> : <Eye />}{showSecrets ? "隐藏凭据" : "显示凭据"}</Button></div>{showSecrets ? <Textarea id="detail-raw" className="raw-detail" value={detail.raw} spellCheck={false} onChange={e => setDetail({ ...detail, raw: e.target.value })} /> : <div className="hidden-secret"><LockKeyhole /><span>密码及后续凭据已隐藏</span><span>{detail.fieldCount} 个字段</span></div>}<label className="field-label" htmlFor="detail-note">买家 / 备注</label><Textarea id="detail-note" value={detail.note} maxLength={2000} onChange={e => setDetail({ ...detail, note: e.target.value })} placeholder="例如：买家昵称、订单号或交付说明" /><DialogFooter className="detail-footer"><Button variant="ghost" className="delete-button" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 />删除账号</Button><div><Button variant="outline" onClick={() => void copy(detail.raw)}><Copy />复制账号</Button><Button disabled={busy} onClick={() => void saveDetail()}>保存修改</Button></div></DialogFooter></>}</DialogContent></Dialog>
    <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除这条账号？</AlertDialogTitle><AlertDialogDescription>{detail?.account} 将从库存移除。操作记录会保留；如需恢复账号，请先导出 JSON 备份。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>取消</AlertDialogCancel><AlertDialogAction variant="destructive" disabled={busy} onClick={e => { e.preventDefault(); void run(async () => { if (!detail) return; await api({ action: "delete", id: detail.id, version: detail.version }); setDeleteOpen(false); setDetail(null); await refresh(); toast.success("账号已删除"); }); }}>删除此账号</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <Toaster richColors theme="light" position="bottom-right" />
  </div>;
}



