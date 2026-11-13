# 验证策略

Unit tests 验证班级识别、跨列表去重、日期与课程等业务边界。存储/API 测试使用真实本地 Workers 的 D1 / R2，不以 mock 返回值代替入库结果。

Playwright 在桌面和手机尺寸验证实际用户流程；测试邮件仅为构造数据，不能写入生产。日期固定或由校园时区计算。

统一命令 `pnpm check`。失败诊断见 `test-results/` 与 `playwright-report/`，CI 上传保留 14 天。分别说明本地与远端 Actions 结果。
