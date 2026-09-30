# Codex 内嵌 UI 首版测试

测试日期：2026-09-29。基于上游 0.2.2。Codex CLI：0.159.0。

## 实现范围

- 沿用上游 `.codex-plugin/plugin.json`、`.mcp.json` 和 `hooks/hooks.json` 打包结构，额外包含 `ui/dashboard.html`。
- `open_learning_dashboard` 注册 global/thread 入口并关联 MCP Apps HTML resource；该 tool 是 UI 的声明与调用入口，需要保留。
- Dashboard 使用单文件 HTML，通过 MCP Apps bridge 获取数据、分页、修改语言设置和删除笔记。
- Codex 打包 skill 优先打开内嵌 UI；独立网页继续承担登录和同步账户管理。
- 内嵌页面跟随宿主主题，支持窄面板；网页入口保留。

## 已验证

`pnpm check`、`pnpm test`（29 项）、`pnpm build:plugin` 和 `git diff --check` 通过。

`node scripts/test-codex-ui.mjs` 启动真实 Codex app-server，验证插件读取、工具元数据、HTML resource、数据读取、设置修改和测试笔记保存/删除。测试显式为 MCP 子进程配置临时 SQLite 和同步配置文件，不启动模型回合。

`node scripts/test-codex-ui.mjs --serve` 提供 MCP Apps 测试宿主。通过 Codex 内置浏览器验证页面连接、卡片展示、设置保存、深色主题和窄面板。测试宿主通过真实 Codex app-server 转发工具调用，但它不是 Codex 的原生插件 UI 宿主。

首次测试发现 Codex 未转发父进程环境变量，误用了实际本地数据库；已恢复 Chinese → English 设置并删除该测试笔记。后续测试在任何写入前断言临时数据库为空且同步关闭。

## 尚未验证

原生 global/thread 入口的显示和点击尚未验证：当前会话仍加载旧工具目录，且桌面 UI 自动化无法访问 Codex 原生窗口。安装新版后，在 Codex 新会话中请求“打开 Language Coach 学习面板”，确认调用 `open_learning_dashboard` 并显示内嵌页面；必要时重启应用刷新插件。

本次只更新本机插件，没有发布、提交或部署。构建产物位于 `dist/language-coach`；机器可读协议测试结果位于 `dist/codex-ui-test.json`。

开发版已通过 `hooks/list` 验证：仅注册启用的 `UserPromptSubmit`，没有 Language Coach Stop hook。
