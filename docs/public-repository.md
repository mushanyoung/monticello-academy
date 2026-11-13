# 公开仓库与配置边界

代码、模板、合成测试数据公开；个人邮箱、学校邮件列表地址、具体 Cloudflare 部署参数、凭据和真实邮件不进入源码、配置、文档或提交说明。三个班级的显示名称是产品内容，邮箱映射由 MAIL_CONFIG Secret 注入。Mushan 明确允许 Git 作者、提交者和标签创建者的身份字段使用公开个人邮箱，以便 GitHub 正确关联贡献。

`pnpm check:public` 检查当前受跟踪和待加入文件；`pnpm check:public --history` 检查所有可达历史对象及作者/提交者元数据。检测非示例邮箱、常见凭据、真实 UUID、具体 Workers 域名和意外跟踪的本地配置；它补充专业 secret scanner，不能代替限定范围的判断。CI 同时运行固定版本且验证下载校验和的 Gitleaks 8.30.1，扫描全部历史并保留脱敏报告。GitHub Secret Scanning 与 Push Protection 已启用。所有测试使用保留的 example 域名。

提交使用 Mushan 的正常 Git 身份，可从现有 Git 配置确认；如需设置，只修改当前仓库的 `user.name` / `user.email`，不修改全局身份，不再匿名化。扫描器仅允许真实 Git 对象头部合法 `author` / `committer` / `tagger` 字段内的邮箱；提交说明、其他头部以及所有文件仍检查非示例邮箱，凭据和部署参数检查也继续覆盖身份字段。这是用户明确授权的范围例外，不能扩展到运行配置。

不要跟踪 `.cloudflare/`、`.dev.vars*`、`.env*` 或生产构建产物。部署前从 Cloudflare 拉取绑定和路由；不要把真实值粘贴到 issue、commit message、测试快照或文档。

## 历史处理

公开前重写每个提交中的运行配置等私人信息，保留逻辑提交结构。GitHub 强推可能保留旧 SHA 缓存，因此原远端保持私有归档；干净的同名仓库仅接收脱敏后的历史，随后公开。旧 Actions 记录不迁入公开仓库。不使用公开前的旧 checkout 合并或强推，避免重新引入私人配置。

用户随后要求恢复真实 Git 身份：对公开历史只重写作者和提交者元数据，逐提交验证文件树、提交说明和日期不变；保留忽略的本地 bundle 备份，使用明确旧远端 SHA 的 `--force-with-lease` 更新主分支。SHA 会改变，旧 checkout 需要同步新的历史，不能合并旧提交。原先含运行参数的私有历史仍不公开。

公开前同时进行全历史自定义扫描、secret scanner 和干净 clone 验证；生产 secret 如曾进入 Git，必须先轮换。扫描与配置验证属于实现质量检查，不安排独立代码审查。
