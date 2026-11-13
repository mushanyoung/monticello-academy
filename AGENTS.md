# Monticello · Agent 入口

每次任务先读本文件，再仅按目标路径和当前任务需要读取适用规则与必要资料。默认用中文与 维护者 沟通。

## 项目与职责

Monroe campus 三班的邮件档案、月度课程计划与每日提醒。`src/worker/` 管接收、存储和 API，`src/web/` 管响应式网站，`src/shared/` 定义共享规则，`migrations/` 管 D1。

## 约束

- Cloudflare Workers + **cf CLI**；禁止使用或安装 Wrangler、生成 Wrangler 配置。
- TypeScript strict、Node.js **26.13.1**、pnpm **12.18.0**、Tailwind CSS。提交锁文件，安装用 `pnpm install --frozen-lockfile`。
- Biome recommended；处理所有警告和错误。禁止禁用规则、跳过测试或放宽断言来掩盖问题；必要例外限定范围并记录理由。
- 在已有授权内主动推进；小步完成可验证、可回退的单元，通过适用检查后立即实际 Git commit。行为、命令或架构变化同时更新文档。
- 禁止独立代码审查、reviewer agent、额外 code review 任务或 AI 自动审查工作流；实现调试和验证正常进行。
- 公开仓库：不提交任何真实邮箱、部署账户/资源 ID、部署网址、凭据、真实邮件或孩子信息；仅用保留域名示例。具体信息放 Cloudflare Secrets/Bindings/Routing，本地缓存必须被 Git 忽略。提交作者邮箱使用项目匿名地址。
- 测试数据不能作为实际课程展示；公开前扫描全部历史和提交元数据，禁止把旧历史合并回来。

## 命令与质量门槛

`pnpm dev` · `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm test:e2e` · `pnpm build` · `pnpm check`（全部检查）· `pnpm deploy`。
交付说明实现、commits、实际检查与阻塞；分别报告本地与 GitHub Actions 状态，未执行的明确标注。push / PR CI 执行全部检查。

## 按任务读取

- 环境、命令、提交、CI：`docs/development.md`
- 邮件、存储、去重、查询、安全：`docs/architecture.md`
- UI、颜色、布局、移动体验：`docs/design-system.md`
- 测试、边界、失败诊断：`docs/testing.md`
- 部署、转发入口、操作：`docs/operations.md`
- 配置模板、公开仓库、历史脱敏：`docs/public-repository.md`
- 课程结构、历史邮件分析、未来 AI：`docs/lesson-plans.md`
  现行文档放 `docs/`，历史放 `docs/archive/`；模块特有规则放对应目录 `AGENTS.md`。及时删除过时内容。
