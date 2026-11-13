# 运行与接入

## 配置分工

公开仓库不含真实账户、邮箱、资源 ID 或部署网址。

- `config/deployment.example.json`：Worker 名称、D1 ID、R2 bucket、收件路由地址的模板。
- `config/mail.example.json`：统一收件地址、允许转发人、允许的发件域名、三个班邮箱映射模板。
- 生产 `MAIL_CONFIG` Secret：邮件配置的完整 JSON；`IMPORT_TOKEN` Secret：管理写入密钥。具体值通过 Cloudflare 管理，不进入 Git 或网页 bundle。
- Cloudflare Bindings / Email Routing：部署资源和路由的事实来源。`pnpm config:pull <worker-name>` 读取已部署 Worker 的绑定和匹配的收件规则，写到忽略的 `.cloudflare/deployment.json`（0600），不打印具体配置。认证账户由 cf profile 选择。

网页通过 `/api/site` 读取公开收件入口；这个入口会在已选择公开的网站上展示。允许转发人、学校邮箱映射和导入密钥不会通过配置 API 暴露。

## 本地与 CI

`pnpm db:migrate:local` 使用模板数据库；`pnpm dev` 使用模板邮件配置。需要本地管理导入时把 IMPORT_TOKEN 写入忽略的 `.dev.vars`。e2e 单独使用 `.cloudflare/test-state` 和明确的本地测试令牌，不读取生产配置。

`pnpm check` 在没有 Cloudflare 登录和本地生产配置时也能执行。生产模式构建可用模板产物；生产部署入口检查真实本地部署配置是否存在，缺失即拒绝。

## 部署

已有部署：先 `pnpm config:pull <worker-name>`，再 `pnpm db:migrate`、`pnpm check`、`pnpm deploy`。部署脚本强制 production mode，始终重新构建当前配置。不要用测试模式产物部署。

首次部署：从两个 JSON 模板准备忽略的 `.cloudflare/deployment.json` 和 `.dev.vars.deploy.json`。后者形如 `{"IMPORT_TOKEN":"<random-value>","MAIL_CONFIG":"<serialized-mail-config-json>"}`；使用 `pnpm deploy --secrets-file .dev.vars.deploy.json`。后续部署保留 Cloudflare 上已有 secret，不需要重新上传。cf dashboard 可更新具体邮件配置，更新后重新部署对应版本。

添加 Email Routing 时先检查原有规则和 MX，不修改学校域名 MX、不替换其他收件人。部署只管理属于本 Worker 的精确收件规则。Workers 默认网址包含 Worker 与账户子域名，可用 `cf workers get --worker <name>` 查询。

## 导入和故障

历史邮件优先以原始 `.eml` 附件转发，保留 Message-ID 和 To/Cc。普通转发仍会归档，未识别的班级显示在 All classrooms。最多 20 MiB / 40 附件。学校邮件列表或个人邮箱的自动转发仍需在原邮件服务中启用；不能通过 Worker 控制外部邮箱。

POST `/api/import` 使用 Bearer IMPORT_TOKEN，body 为原始 .eml；`?class=sunshine|guppy|twos` 可补充班级。POST `/api/plans` 使用同一管理密钥与课程 JSON。密钥不要放到浏览器或命令行参数里。

`/api/health` 检查 Worker 可用；`/api/stats`、`/api/mail` 验证 D1；附件通过 Worker 从私有 R2 读取。运行日志只记录事件、内部 ID 和错误类型。失败投递可重试，去重规则保证幂等。迁移按编号应用；已有数据回滚须先备份 D1/R2。
