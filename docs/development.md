# 开发与提交

Node 26.13.1 和 pnpm 12.18.0 在 package.json、mise、版本文件和 CI 固定。先 `mise install`，再 `pnpm install --frozen-lockfile`。不安装 Wrangler；cf beta 和 Vite plugin v2 固定版本，升级需验证构建、类型生成与本地运行。

`pnpm dev` 启动真实 Workers 本地运行时；`pnpm types` 生成绑定类型；`pnpm typecheck` 独立检查前后端；`pnpm format` 格式化；`pnpm lint` 同时检查格式和 recommended lint，warning 也失败。

`pnpm check` 执行 lint、类型、unit、e2e、生产构建。初次运行 e2e 前 `pnpm exec playwright install chromium`（Linux CI 加 `--with-deps`）。

每个单元包含代码、相关测试和现行文档，通过适用检查后实际 commit。不安排独立代码审查。push/PR Quality workflow 按锁文件安装并执行全部检查，保留报告、失败截图与 trace。修复错误，禁止跳过用例或降低断言。

`.cloudflare/`、测试报告、真实邮件、密钥仅本地保存。

仓库公开，真实配置通过 Cloudflare 管理，操作参见 `docs/public-repository.md` 和 `docs/operations.md`。前端、Workers 和浏览器 e2e 分开类型检查。提交前运行 `pnpm check:public`，公开或历史变化时加 `--history`。

班级筛选由 `src/web/navigation.tsx` 管理客户端 URL 与 React transition。`useApi` 按当前导航和语言复用 Promise，由主内容的 Suspense 等待数据；每次导航创建独立请求集合，防止旧请求覆盖新班级或返回历史缓存。首次加载和失败重试仍显示本地化状态，修改筛选逻辑须保留原生链接的修饰键行为。

GitHub Actions 固定到具体提交 SHA，并使用受支持的 Actions 内部运行时；项目安装、类型检查、测试和构建始终使用 setup-node 指定的 Node 26.13.1 与 pnpm 12.18.0。升级 action 时核实 action.yml 的 runs 与输入契约，并实际运行远端检查。
