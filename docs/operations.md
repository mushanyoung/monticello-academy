# 运行与接入

部署使用 `pnpm deploy`（cf CLI）。账户已具备 example.org Email Routing，配置前读取现有规则；不修改学校域名 MX、不替换已有收件规则。

Workers 标准地址格式为 `<worker>.<account-subdomain>.workers.dev`，用户期望的 `monticello.workers.dev` 需核实平台可用形式。部署后记录实际地址。

历史邮件在网站和收件通路准备后再转发。优先以 `.eml` 附件转发，保留原始 Message-ID 和收件人。
