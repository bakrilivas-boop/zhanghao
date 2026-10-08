# 账号管理

手机和电脑共用的账号库存与销售记录。面向个人账号交付流程，支持原始 `---` 分隔格式。

## 使用

1. 打开网站即可进入，无需 ChatGPT 登录。手机和电脑共用原网址及同一份云端库存。
2. 点击 **批量导入**：直接粘贴，或选择/拖入 TXT 文件，一行一个账号。
3. 页面自动显示有效、重复、格式错误数量，确认后保存到云端。重复账号不会覆盖已有凭据和销售状态。
4. 点击 **标记已售**；误操作可点击 **恢复待售**。可勾选多条批量处理。
5. 点击 **导出账号**，选择勾选项、当前筛选结果、全部待售、全部已售或全部账号。
6. TXT 保持原始字段内容与顺序，可以直接交付；JSON 保存凭据、销售状态、时间和备注，可以再次导入恢复。

示例使用虚构内容：

```text
example@email.com---password---2FA---RT
another@email.com---password---other-token
```

不强制固定列数：第一列为账号，其余字段原样保存，空字段不会被补写或错位。TXT 使用 UTF-8，可读取常见 GB18030 中文文本。不是图片识别工具，请粘贴原始文本。

JSON 恢复采用合并：补回缺失账号，已存在的账号保持当前状态。账号备份不包含操作历史。操作历史保存于云端，界面显示最近 300 条。

## 体验与数据

- 待售、已售数量及状态标签；按账号或买家备注搜索。
- 桌面表格、手机卡片，列表每页 30 条。
- 库存搜索栏旁的 **邮箱脱敏** 按钮隐藏邮箱用户名中间字符，再点 **显示邮箱** 恢复显示。单字符用户名全部隐藏，短用户名也保留遮挡；非邮箱账号不变。搜索、复制和 TXT/JSON 导出仍使用原始账号。
- 导入自动预览，大批次分为每批 100 条保存并显示进度。每次导入或导出最多 2000 条；文本解析上限 4 MB。
- 云端记录每 15 秒同步一次，切回页面时刷新；未变化时使用 ETag 确认版本，减少重复传输。
- 销售状态、售出时间、备注在两端共享。旧版本修改会被拒绝，避免覆盖另一端的新记录。
- 导入、卖出、恢复待售、编辑、导出、删除、备份恢复都记入操作历史。
- 云端用 AES-GCM 加密账号原文及备注；密钥是 Sites 运行环境 Secret。不会将真实账号、密码或数据文件提交到 GitHub。
- 网站按用户要求取消登录验证。任何拿到网址的人都能查看、导出和修改库存；云端加密不限制网站访问，请不要公开分享网址。
- 导出文件是含凭据的明文文件，请自行妥善保管。

## 开发

Node.js 22.13+，使用已提交的 npm 锁文件：

```powershell
npm ci
Copy-Item .env.example .env.local
# 生成 32 字节 Base64 随机密钥，填入 .env.local 的 ACCOUNT_ENCRYPTION_KEY
npm run db:generate
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_swift_pestilence.sql
npm run dev
```

本地和正式网站均无需登录。生产访问模式设为 public；D1 数据库和密钥由 Sites 配置。不要随意替换生产加密密钥，否则已有密文无法读取。

验证：

```powershell
node --test tests/records.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build
```

源码和迁移保存在 GitHub；数据库及密钥保存在网站运行环境。GitHub Pages 的静态托管不能直接提供本项目的云端记录功能。

## 参考的交互思路

只借鉴工作流程，业务代码自行实现：

- [Snipe-IT](https://github.com/grokability/snipe-it)：通过网页导入、识别重复记录及批量处理。参考 [导入说明](https://snipe-it.readme.io/docs/importing)。
- [Grocy](https://github.com/grocy/grocy)：先显示库存、筛选状态，再直接执行库存操作。
- [Vaultwarden](https://github.com/dani-garcia/vaultwarden)：凭据管理，以及备份与交付格式分别设计。

具体验证范围见 `tests/QA.md`。
