# 运行与接入

## 配置分工

公开源码和配置不含真实账户、邮箱、资源 ID 或部署网址；经用户授权公开的 Git 身份元数据见 `docs/public-repository.md`。

- `config/deployment.example.json`：Worker 名称、D1 ID、R2 bucket、收件路由地址的模板。
- `config/mail.example.json`：统一收件地址、允许转发人、允许的发件域名、三个班邮箱映射模板。
- 生产 `MAIL_CONFIG` Secret：邮件配置的完整 JSON；`IMPORT_TOKEN` Secret：管理写入密钥；`OPENAI_API_KEY` Secret：预留给课程提取的 OpenAI API 凭据。具体值通过 Cloudflare 管理，不进入 Git 或网页 bundle。
- Cloudflare Bindings / Email Routing：部署资源和路由的事实来源。`pnpm config:pull <worker-name>` 读取已部署 Worker 的绑定和匹配的收件规则，写到忽略的 `.cloudflare/deployment.json`（0600），不打印具体配置。认证账户由 cf profile 选择。

网页通过 `/api/site` 读取公开收件入口；这个入口会在已选择公开的网站上展示。允许转发人、学校邮箱映射和导入密钥不会通过配置 API 暴露。

## 本地与 CI

`pnpm db:migrate:local` 使用模板数据库；`pnpm dev` 使用模板邮件配置。需要本地管理导入时把 IMPORT_TOKEN 写入忽略的 `.dev.vars`。e2e 单独使用 `.cloudflare/test-state` 和明确的本地测试令牌，不读取生产配置。

`pnpm check` 在没有 Cloudflare 登录和本地生产配置时也能执行。生产模式构建可用模板产物；生产部署入口检查真实本地部署配置是否存在，缺失即拒绝。

`OPENAI_API_KEY` 在 development/test 模式绑定为空字符串，本地检查和 CI 不需要真实 OpenAI 凭据，也不调用模型。

## 部署

已有部署：先 `pnpm config:pull <worker-name>`，再 `pnpm db:migrate`、`pnpm check`、`pnpm run deploy`。部署脚本强制 production mode，始终重新构建当前配置。不要用测试模式产物部署。

首次部署：从两个 JSON 模板准备忽略的 `.cloudflare/deployment.json` 和 `.dev.vars.deploy.json`。后者形如 `{"IMPORT_TOKEN":"<random-value>","MAIL_CONFIG":"<serialized-mail-config-json>"}`；使用 `pnpm run deploy --secrets-file .dev.vars.deploy.json`。后续部署保留 Cloudflare 上已有 secret，不需要重新上传。cf dashboard 可更新具体邮件配置，更新后重新部署对应版本。

导入或轮换 OpenAI key：在权限为 0700 的临时目录中创建 0600 的 JSON 文件，内容形如 `{"OPENAI_API_KEY":"<key>"}`，通过 `pnpm run deploy --secrets-file <temporary-json-path>` 上传并部署。用程序从密钥文件读取内容，不能将密钥放入命令参数、日志或 Git；操作完成后删除临时 JSON。只传入本次需要更新的 secret，其余值由 Cloudflare 保留。验证部署版本中的 `OPENAI_API_KEY` 类型为 `secret_text`，只检查绑定名称和类型。配置密钥本身不会启用课程提取；模型接入条件见 `docs/lesson-plans.md`。

添加 Email Routing 时先检查原有规则和 MX，不修改学校域名 MX、不替换其他收件人。部署只管理属于本 Worker 的精确收件规则。Workers 默认网址包含 Worker 与账户子域名，可用 `cf workers get --worker <name>` 查询。

## 导入和故障

历史邮件优先以原始 `.eml` 附件转发，保留 Message-ID 和 To/Cc。Gmail 电脑版可在邮件列表勾选多封，点击顶部“更多 → 作为附件转发”，发到网站显示的收件入口；参见 [Gmail 官方说明](https://support.google.com/mail/answer/9261412?hl=zh-Hans)。接收端将每个 `.eml` 分别归档，跨班和重复批次会去重，日期取原始邮件日期。网站默认展示原始 HTML 排版和内嵌图片，可切换纯文本；外部图片需手动加载。完整 MIME、HTML 和内嵌附件仍保存在可下载的原始 `.eml` 中，已入库邮件无需重新转发即可使用新视图。

建议先发 2–3 封核对班级、日期和附件，再每批 5–10 封；每批 `.eml` 附件合计尽量不超过 10 MB，为 MIME 编码留余量。硬限制为整封入站邮件 20 MiB、每封最多 40 个附件、拆分后最多 20 封归档记录、最多三层转发嵌套。若外层还附有普通文件，也会额外保存外层邮件并计入批次限制。Gmail 超过附件上限会改用 Google Drive 链接，接收端不会自动下载这些链接，应改为更小批次。遇到退信按原因缩小批次或修复原件后重发。

普通转发仍会归档，未识别的班级显示在 All classrooms。学校邮件列表或个人邮箱的自动转发仍需在原邮件服务中启用；不能通过 Worker 控制外部邮箱。

Gmail filter 的转发动作只作用于创建后的新邮件；“同时应用于匹配的会话”不会补转旧邮件，历史邮件仍需 `.eml` 导入，参见 [Google filter 说明](https://support.google.com/mail/answer/6579?hl=zh-Hans)。仅自动转发三个班的匹配邮件，不开启全邮箱转发。Gmail 新增转发地址前会发送验证邮件；默认学校/家长白名单并不包含 Google 验证发件人，验证收信需单独安排私密路径，不能把确认链接或验证码归档到公开网站。

POST `/api/import` 使用 Bearer IMPORT_TOKEN，body 为原始 .eml；`?class=sunshine|guppy|twos` 可补充班级。POST `/api/plans` 使用同一管理密钥与课程 JSON。密钥不要放到浏览器或命令行参数里。

`/api/import` 也支持带有多封 `.eml` 的批量转发原件。拆分后为一封时保持 `{id,classIds}` 响应，多封时返回 `{messages:[{id,classIds},...]}`，每个条目对应一次原件处理；重复原件可返回相同 id。格式错误的批次整体拒绝且不写入，存储失败可重试整批。

`/api/health` 检查 Worker 可用；`/api/stats`、`/api/mail` 验证 D1；附件通过 Worker 从私有 R2 读取。运行日志只记录事件、内部 ID 和错误类型。失败投递可重试，去重规则保证幂等。迁移按编号应用；已有数据回滚须先备份 D1/R2。

`GET /api/admin/ai` 需要 Bearer IMPORT_TOKEN，可检查 Cloudflare 内的 API key 是否能访问配置的课程解析模型。该端点不返回密钥或账户模型列表，不产生模型推理费用；本地与 CI 没有 key 时返回 503。
