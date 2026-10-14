# Codex-to-DSH Bridge 0.1.0-preview.2 — Windows x64

此版本提供可直接安装的 Windows `.exe`，把 Codex MCP 的任务派发、DSH 执行、Web 会话查看和产物验收连接起来。

包含 Node.js 24.19.0、官方 DSH 0.2.1-alpha.3、原版第三方 DSH Crew 0.1.0-rc.14 及离线插件依赖。安装不需要预先安装 Node/npm/pnpm，模型任务需要用户配置自己的凭据。

安装后自动注册当前用户的 Codex MCP，创建桌面与开始菜单快捷方式，提供停止服务、诊断和卸载。已有配置有备份；凭据和会话数据独立保存在用户目录。

使用方法：安装 → 重新打开 Codex → 启动 DSH Web → 配置模型 → 在 Codex 下达带工作目录和验收条件的任务 → 在 Web 查看会话。

发布资产：

- `Codex-to-DSH-Bridge-0.1.0-preview.2-windows-x64-setup.exe`
- `SHA256SUMS.txt`
- `Windows-usage.md`
- `windows-installer-check.json`
- `Codex-to-DSH-Bridge-0.1.0-preview.2-sources.zip`

这是预览版，安装包未签名。DSH 和 Crew 是各自上游项目的组件，见随包第三方声明。核心任务链路的测试范围及结果见 `windows-installer-check.json`；未宣称全部插件、模型和并发功能都已验证。

DSH：https://github.com/deepseek-ai/deepseek-harness

Crew：https://github.com/ZSeven-W/dsh-crew


Mac 版继续使用 [v0.1.0-preview.1](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases/tag/v0.1.0-preview.1) 中的 DMG。本次发布仅新增 Windows x64 预览版。
