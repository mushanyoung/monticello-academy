# 课程计划接入

现已收到三个班、五个月的 15 份课程 PDF，后续提取规则以实际版式为准。样本和中间产物仅保存在忽略的本地目录；公开文档仅记录结构规律与操作方法。

课程按班级、月份、具体校园日期组织，保留主题、活动、注意事项和来源。每天使用 America/Los_Angeles 日期查询，支持明天；无已整理数据需明确提示。

OpenAI key 使用 Workers 的 `OPENAI_API_KEY` Secret 管理，导入和轮换见 `docs/operations.md`。接入模型时按账户可用模型核实 GPT 6.1 Terra 的 API ID。提取结果须结构校验、来源追溯，处理重试、修订与不确定信息，样本到位后补全。

## 数据协议

`src/shared/plans.ts` 的 Zod schema 是导入协议：classId、month、title、theme、overview、objectives、sourceMessageId、status、days。每个 day 含 date、title、activities（area/description）、reminders、bring、note、noSchool。日期必须真实、属于月份且唯一。schema strict 拒绝未知字段。

POST `/api/plans` 需要 IMPORT_TOKEN，并验证来源邮件已关联同一班级；每班每月一份当前计划，所有不同文档的 revision 内容保留在 D1。本项目没有人工审批状态：技术校验成功即发布，原文矛盾的各个说法与来源一起展示。draft 输入被拒绝，数据库触发器也禁止审批状态。

GET `/api/plans?class=&month=` 只列已发布计划；GET `/api/highlights?date=YYYY-MM-DD` 区分未收到计划、当天未列出、已准备三种状态。按请求日期读取，跨月明天自然查询下个月，无需 cron 预生成；缺数据不推断放假或无注意事项。

模型固定为 GPT 6.1 Terra（`gpt-6.1-terra`）；`GET /api/admin/ai` 使用 IMPORT_TOKEN 鉴权，由 Worker 用已有 OPENAI_API_KEY Secret 核实模型访问权限，只返回模型 ID 与可用状态。无需将密钥从 Cloudflare 导出。当前尚未启用 PDF 自动提取。

## 实际 PDF 的结构规律

三个班都以月度日历列特殊活动、穿戴或携带提醒，再以周一至周五的表格展开每天课程。每周主题与字母、数字、颜色、形状等目标需要分别保存，不能用一段摘要替代每日明细。Two’s Town 还有自理能力；Guppy 包含语言、数学、科学及拓展活动；Sunshine 还有词族、常见词、教材课次和页码。月度能力目标较长，协议最多保留 60 项。

日期必须结合页图、周标题和月度日历读取：部分标题或分类是图片，单纯提取文字会丢失信息；日历常跨相邻月份，不能将整页都强制归入标题月份。月度概览和周表有原始矛盾时，完整保留各方说法并在 sourceNotes 展示，不等待人工确认。空白日期不代表停课；停课需要原文依据。整月通用提醒与只适用于某一天的携带要求分开保存，不收录儿童个人生日或姓名。

扩展协议包含 monthlyReminders、weeks（日期区间／主题／分类目标）、sources（原始 PDF 与邮件）及每日 sourceAttachmentId/sourcePages。跨月日期分开生成对应月份，carryover 标明仅来自相邻月；专属月份计划的重叠日期优先显示，相邻月的不同条目保存在 alternateDays 并在月计划和每日卡片一起展示。提醒、目标、每周重点合并保留，来源 PDF 始终可访问。单份 PDF 最多 60 个目标，跨来源合并最多 300 项。

`lesson_jobs` 按 PDF 内容地址和解析版本去重，保留处理状态、模型响应引用、候选结果和问题；`lesson_alerts` 保存待发送与已发送通知。它们在 D1 中持久化，后续后台重试不能依赖单次 HTTP 或 email 请求的生命周期。
