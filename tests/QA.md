# Verification inventory

Use fictional `example.com` records only. Production inventory starts empty.

- Import: paste and TXT file, automatic preview, duplicates, errors, empty positions, repeated import.
- Inventory: status counts, available/sold filters, search/clear, single and page selection, single/bulk sold and undo.
- Detail: hidden/revealed credentials, edit/save note, stale edit conflict, delete/cancel, JSON restoration.
- Export: selected/current/available/sold/all scopes; TXT round trip; JSON statuses/notes/times; clipboard delivery.
- Shared state: separate desktop/mobile browser sessions; writes visible after refresh/automatic sync; reload persistence.
- History: import/status/undo/edit/export/delete/restore records. No password or token in history.
- Errors/security: unsigned API rejects; cross-origin writes reject; malformed JSON and backups preserve existing data; stale version rejects.
- Layout: 1440px desktop, 390px phone, populated and empty inventory, import/detail/export overlays; no horizontal page overflow.
- Performance: paginate visible rows, debounce import parsing, conditional sync returns 304 when unchanged.
- Build/type checking and parser tests pass before source publication.

WebMCP is optional and feature detected. Its UI staging tool can be validated only when supported by the browser.

## Verified on 2026-10-08

- Chromium desktop (1440 × 1000) and a separate phone browser context (390 × 844): shared state, reload persistence, status/search/selection, import and detail flows, exports and backup restoration passed. No page errors or horizontal overflow observed. A physical phone was not used.
- 300 fictional records imported through the UI in three batches; the inventory contained 302 records and rendered 30 per page.
- TXT and JSON downloads, duplicate skip, malformed input, clipboard copy, notes and sold-time restoration passed. Export range counts matched selected/current/available/sold/all inventory counts.
- Unsigned reads returned 401, cross-origin writes returned 403, unchanged conditional reads returned 304. Competing edits preserved the newer record; concurrent status writes returned one success and one conflict, with one history entry.
- Parser tests and TypeScript checking passed. The final production build is run by the publication workflow.
- This browser did not expose WebMCP; validation of that optional staging interface was unavailable.

Only fictional local records were used. Local database files, test outputs and encryption secrets are excluded from source publication.
