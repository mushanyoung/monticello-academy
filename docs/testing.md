# 验证策略

Unit tests 验证班级识别、跨列表去重、日期与课程等业务边界。存储/API 测试使用真实本地 Workers 的 D1 / R2，不以 mock 返回值代替入库结果。

Playwright 在桌面和手机尺寸验证实际用户流程；测试邮件仅为构造数据，不能写入生产。日期固定或由校园时区计算。

统一命令 `pnpm check`。失败诊断见 `test-results/` 与 `playwright-report/`，CI 上传保留 14 天。分别说明本地与远端 Actions 结果。

已覆盖原始 ID 与无 ID 去重、嵌套 .eml、精确列表识别、HTML 转文本、输入上限、并发三班投递、实际附件下载、文本附件搜索、字面百分号查询、排序、无效筛选与导入鉴权。API 测试通过 cf dev 运行，使用生产相同的 D1 SQL 和 R2 binding。

当前包含 16 个 unit cases 和桌面／手机各 11 个 e2e cases：今天／明天提醒、月计划与原始邮件跳转、实际下载、筛选搜索、空结果、加载失败重试、无横向溢出；以及通过 `/cdn-cgi/local/email` 调用真实 email handler 的接收／拒收路径。批量转发覆盖原始 MIME 字节和日期保留、base64 与 7bit、独立班级识别、重复投递去重、嵌套/数量边界、额外附件保留、无效批次不发生部分写入。e2e 开始仅清理 `.cloudflare/test-state`，不会清理开发或远端数据库。转发模拟的 To 与信封地址不同为正常现象，拒收用例的运行时日志为预期诊断。

配置测试验证 test/development 不读取生产缓存、不完整邮件映射被拒绝；公共配置 API 只暴露收件入口，不返回允许转发人和班级邮箱。

Unit XML 保存在 `test-results/unit.xml`，Playwright 产物在 `test-results/e2e/`，避免浏览器测试清理输出时覆盖 unit 报告。
