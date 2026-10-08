import { env } from "cloudflare:workers";
import { Account, parseLine } from "@/lib/records";

type Stored = { id: string; account_key: string; payload: string; status: "available" | "sold"; created_at: string; sold_at: string | null; version: number };

export function database() {
  if (!env.DB) throw new Error("Database unavailable");
  return env.DB;
}

const encode = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join(""));
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

let cachedKey: Promise<CryptoKey> | undefined;
async function encryptionKey() {
  if (!env.ACCOUNT_ENCRYPTION_KEY) throw new Error("Encryption key unavailable");
  return cachedKey ??= crypto.subtle.importKey("raw", decode(env.ACCOUNT_ENCRYPTION_KEY), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function pack(raw: string, note = "") {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ raw, note }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), plain);
  return `${encode(iv)}.${encode(new Uint8Array(encrypted))}`;
}

export async function unpack(row: Stored): Promise<Account> {
  const [iv, encrypted] = row.payload.split(".");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(iv) }, await encryptionKey(), decode(encrypted));
  const payload = JSON.parse(new TextDecoder().decode(plain));
  return { ...parseLine(payload.raw), note: payload.note, id: row.id, status: row.status,
    createdAt: row.created_at, soldAt: row.sold_at, version: row.version };
}

export async function accountKey(account: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(account.toLowerCase()));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, "0")).join("");
}

export async function listAccounts() {
  const rows = await database().prepare("SELECT * FROM accounts ORDER BY created_at DESC, id DESC").all<Stored>();
  return Promise.all(rows.results.map(unpack));
}

export function eventStatement(action: string, count: number, summary: string) {
  return database().prepare("INSERT INTO events(id, action, count, summary, created_at) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(), action, count, summary, new Date().toISOString());
}
