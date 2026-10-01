# 邮箱验证正文

在 Supabase 项目的 Authentication → Email Templates → Confirm signup 中：

- Subject：`验证您的 Review 邮箱`
- Body：粘贴同目录 `confirmation.html` 的完整内容并保存。

`{{ .ConfirmationURL }}` 是 Supabase 提供的用户专属验证链接，不要替换为固定网址。HTML 使用内联样式和表格布局，兼容常见邮箱客户端。

该文件仅是可应用的模板，网站发布不会自动修改 Supabase 邮件设置。需在控制台保存后，后续新注册邮件才使用新版正文。
