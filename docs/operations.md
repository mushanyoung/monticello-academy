# 运行与接入

部署使用 `pnpm deploy`（cf CLI）。账户已具备 example.org Email Routing，配置前读取现有规则；不修改学校域名 MX、不替换已有收件规则。

Workers 标准地址格式为 `<worker>.<account-subdomain>.workers.dev`，用户期望的 `monticello.workers.dev` 需核实平台可用形式。部署后记录实际地址。

历史邮件在网站和收件通路准备后再转发。优先以 `.eml` 附件转发，保留原始 Message-ID 和收件人。

## 资源与操作

- D1 `family-notebook`：`00000000-0000-4000-8000-000000000001`
- 私有 R2 bucket：`family-notebook-files`（文件通过 Worker 公开读取）
- 统一入口：`notebook@example.com`，cf config 的 email trigger 管理专属规则，保留已有 example.org 规则。
- 允许转发者：`parent@example.com`、`parent@example.org`，以及学校域名发件人；需要其他转发人时更新配置。

本地建表 `pnpm db:migrate:local`；生产 `pnpm db:migrate`，按编号幂等执行。`pnpm dev` 使用 `.cloudflare/state`；e2e 使用独立 `.cloudflare/test-state` 和仅 test mode 的测试令牌。

管理导入：POST `/api/import`，Authorization: Bearer IMPORT_TOKEN，body 为原始 .eml。可传 `?class=sunshine|guppy|twos` 补充班级关联。无可用密钥时拒绝写入。密钥通过 `cf deploy --secrets-file <本地JSON>` 设置，文件不提交；禁止放入网页。
