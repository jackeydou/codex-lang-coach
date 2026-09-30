# 独立本地开发插件

构建：`pnpm build:plugin:dev`。
安装：`pnpm install:plugin:dev`。

- 插件：`language-coach-dev`；本地 marketplace：`language-coach-dev-local`，不使用 Git 远端更新源。
- MCP server：`languageCoachDev`；入口：`Language Coach Dev`。
- 数据库：项目 `.dev/language-coach/learning.sqlite`。
- 凭据配置：项目 `.dev/language-coach/remote-sync.json`，不读取正式版配置。
- 本地后端端口：43128；正式版默认端口：43127。
- MCP 和两个 hooks 均注入独立环境变量，并使用绝对 Node 路径。
- 开发版忽略已有同步凭据，拒绝配置远端同步，不连接正式版后端。登录与云同步需要另行设计开发后端后再启用。

不会复制正式版学习数据或凭据。`.dev/` 不提交到 Git。
正式版和开发版 hooks 同时启用会重复辅导；测试时在 Codex 中只启用所需版本。
