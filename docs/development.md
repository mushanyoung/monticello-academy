# 开发与提交

Node 26.13.1 和 pnpm 12.18.0 在 package.json、mise、版本文件和 CI 固定。先 `mise install`，再 `pnpm install --frozen-lockfile`。不安装 Wrangler；cf beta 和 Vite plugin v2 固定版本，升级需验证构建、类型生成与本地运行。

`pnpm dev` 启动真实 Workers 本地运行时；`pnpm types` 生成绑定类型；`pnpm typecheck` 独立检查前后端；`pnpm format` 格式化；`pnpm lint` 同时检查格式和 recommended lint，warning 也失败。

`pnpm check` 执行 lint、类型、unit、e2e、生产构建。初次运行 e2e 前 `pnpm exec playwright install chromium`（Linux CI 加 `--with-deps`）。

每个单元包含代码、相关测试和现行文档，通过适用检查后实际 commit。不安排独立代码审查。push/PR Quality workflow 按锁文件安装并执行全部检查，保留报告、失败截图与 trace。修复错误，禁止跳过用例或降低断言。

`.cloudflare/`、测试报告、真实邮件、密钥仅本地保存。

仓库公开，真实配置通过 Cloudflare 管理，操作参见 `docs/public-repository.md` 和 `docs/operations.md`。前端、Workers 和浏览器 e2e 分开类型检查。提交前运行 `pnpm check:public`，公开或历史变化时加 `--history`。
