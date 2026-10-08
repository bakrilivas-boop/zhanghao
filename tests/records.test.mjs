import assert from "node:assert/strict";
import test from "node:test";
import { BACKUP_APP, maskEmail, parseLine, parseImport, validateBackup } from "../lib/records.ts";

test("delivery format preserves empty positions and token dashes", () => {
  const raw = "demo@example.com---pw------token-with-dashes---13800000000---https://example.com/sms";
  assert.equal(parseLine(raw).raw, raw);
  assert.equal(parseLine(raw).fieldCount, 6);
});
test("BOM, CRLF, blanks, duplicate and malformed lines", () => {
  const parsed = parseImport("\ufeffone@example.com---pw\r\n\r\nONE@example.com---changed\r\ninvalid\r\ntwo@example.com---pw");
  assert.equal(parsed.preview.added, 2);
  assert.equal(parsed.preview.duplicates, 1);
  assert.equal(parsed.preview.invalid, 1);
  assert.equal(parsed.valid[0].raw, "one@example.com---pw");
});
test("existing accounts are skipped without changing their credentials", () => {
  const parsed = parseImport("sold@example.com---changed", new Set(["sold@example.com"]));
  assert.equal(parsed.preview.added, 0);
  assert.equal(parsed.preview.duplicates, 1);
});
test("reject multi-line edits and records without an account", () => {
  assert.throws(() => parseLine("demo---pw\nother---pw"));
  assert.throws(() => parseLine("---pw"));
});
test("backup round trip preserves sales metadata", () => {
  const row = { raw: "demo@example.com---pw", note: "订单测试", status: "sold", createdAt: "2026-10-08T00:00:00Z", soldAt: "2026-10-08T01:00:00Z" };
  assert.deepEqual(validateBackup({ app: BACKUP_APP, version: 1, accounts: [row] }), [row]);
  assert.throws(() => validateBackup({ app: BACKUP_APP, version: 1, accounts: [row, row] }));
});
test("malformed backup rejects the entire batch", () => {
  assert.throws(() => validateBackup({ app: BACKUP_APP, version: 1, accounts: [{ raw: "demo---pw", note: "", status: "unknown", createdAt: "invalid", soldAt: null }] }));
});
test("import limits use UTF-8 bytes and record count", () => {
  assert.throws(() => parseImport("中".repeat(1_333_334)), /4 MB/);
  assert.throws(() => parseImport(Array.from({ length: 2001 }, (_, i) => `user${i}---pw`).join("\n")), /2000/);
});
test("email masking conceals short names and preserves domain and non-email accounts", () => {
  assert.equal(maskEmail("demo@example.com"), "d***o@example.com");
  assert.equal(maskEmail("a@example.com"), "***@example.com");
  assert.equal(maskEmail("ab@example.com"), "a***@example.com");
  assert.equal(maskEmail("测试邮箱@example.com"), "测***箱@example.com");
  assert.equal(maskEmail("plain-account"), "plain-account");
});
