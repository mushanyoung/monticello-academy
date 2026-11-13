# 架构

单个 Workers 模块提供网页 API 和 email handler；Vite 构建 React 与 Tailwind 静态资源。D1 保存关系和可检索文本，R2 保存 MIME 原件及附件。单体适合三班低流量邮件档案。

生产不导入测试样例。邮件身份、收件关联、索引和安全约定随实现同步补全。
