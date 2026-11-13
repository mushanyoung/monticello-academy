# 课程计划接入

现已收到三个班、五个月的 15 份课程 PDF，后续提取规则以实际版式为准。样本和中间产物仅保存在忽略的本地目录；公开文档仅记录结构规律与操作方法。

课程按班级、月份、具体校园日期组织，保留主题、活动、注意事项和来源。每天使用 America/Los_Angeles 日期查询，支持明天；无已整理数据需明确提示。

OpenAI key 使用 Workers 的 `OPENAI_API_KEY` Secret 管理，导入和轮换见 `docs/operations.md`。接入模型时按账户可用模型核实 GPT 6.1 Terra 的 API ID。提取结果须结构校验、来源追溯，处理重试、修订与不确定信息，样本到位后补全。

## 数据协议

`src/shared/plans.ts` 的 Zod schema 是导入协议：classId、month、title、theme、overview、objectives、sourceMessageId、status、days。每个 day 含 date、title、activities（area/description）、reminders、bring、note、noSchool。日期必须真实、属于月份且唯一。schema strict 拒绝未知字段。

POST `/api/plans` 需要 IMPORT_TOKEN，并验证来源邮件已关联同一班级；每班每月一份当前计划，重导入更新当前版本，所有不同文档的 revision 内容保留在 D1。草稿不展示内容，不生成每日提醒；published 代表已经确认。后续 AI 必须先生成 draft，校验来源后确认发布。

GET `/api/plans?class=&month=` 只列已发布计划；GET `/api/highlights?date=YYYY-MM-DD` 区分待计划、待确认、当天未列出、已准备四种状态。按请求日期读取，跨月明天自然查询下个月，无需 cron 预生成；缺数据不推断放假或无注意事项。

模型固定为 GPT 6.1 Terra（`gpt-6.1-terra`）；`GET /api/admin/ai` 使用 IMPORT_TOKEN 鉴权，由 Worker 用已有 OPENAI_API_KEY Secret 核实模型访问权限，只返回模型 ID 与可用状态。无需将密钥从 Cloudflare 导出。当前尚未启用 PDF 自动提取。
