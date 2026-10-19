# v0.3.0-preview.2 · Windows Web：关闭 Crew 后继续对话

**本版支持并验证 Windows DSH Web。Desktop 的可靠性尚未验证，本次 Web 验收不构成 Desktop 稳定性保证。** 本次不发布新的 Mac 安装包，原 Mac 0.3.0-preview.1 保留；其历史有限测试不等于完整可靠性验证。

## 功能和修复

- 内置基于 DSH Crew rc.14 的通信源码。网页关闭 Crew 总开关并重启后，仍可访问对话、派发任务并继续原会话。
- Web 页面默认使用 3080，独立本机通信使用 19387。同一真实 Codex 聊天 ID 和相同工作目录保持绑定，重启后恢复 DSH 原生持久历史。
- 固定 Flash / MAX，保留状态、结果读取、取消，以及独立目录和人工验收边界。
- 修复 Windows 编码与 NSIS 参数、初始化期间取消仍提交模型的竞态、配置迁移、Web 初始化校验、状态文件恢复、日志脱敏和卸载停止流程。
- 只迁移可验证归属的旧 Web MCP 注册，保留手工注册、其他 MCP、凭据与会话。当前注册名仍是 `dsh_desktop_crew`，实际运行面为 Web。

**部分 MCP 通信、任务执行和辅助功能集成自 [DSH Crew](https://github.com/ZSeven-W/dsh-crew) 0.1.0-rc.14，作者 ZSeven-W，MIT 许可。** 保留版权、固定原始归档、源码和完整许可，不将上游功能标为本项目原创。本项目没有重新实现 DSH Agent 引擎。

## 下载与使用

下载本页 Windows x64 EXE，核对 `SHA256SUMS.txt`。安装前结束任务并停止旧 Web，安装后重启 Codex，从开始菜单打开 DSH Web。首次使用在网页配置自己的模型凭据。

安装包包含 Node.js 24.19.0、DSH Web 0.2.1-alpha.3 和通信源码，无需另行启用 Crew。已有 Web 用户沿用原数据目录；Web 和 Desktop 的账号/历史不会自动合并。网页认证链接含本地令牌，请勿公开。

## 验证与边界

- 20 项自动测试通过。
- Windows Web 真实 MCP 通过：Crew 关闭、同会话回忆、MCP 重连、Web 重启恢复、文件写入/读取、取消及后续续聊。模型为 `deepseek-official/deepseek-flash` / max。
- 中文与空格路径的隔离静默安装、重复配置、认证访问和卸载通过，保留会话、用户偏好、其他 MCP 和 profile 内持久组件。
- 安装器使用 TESTMODE，未验证交互向导及真实快捷方式/注册表分支。未覆盖全新虚拟机、ARM64、多模态和大并发。EXE 未数字签名。
- **Desktop 可靠性尚未验证。** 源码保留接入能力，本次只以 Windows Web 为验收范围。
- 卸载保留 profile 内通信扩展，不自动恢复原 Crew 开关。手动回合和自行启动的后台工具应先结束，Windows 停止不是任意工具进程树回收机制。
- 聊天历史持久化，旧 Job 内存记录可能在重启后消失。自动分支摘要与主动唤醒 Codex仍未实现。

详情：[Web 验收记录](https://github.com/SeyanaA/Codex-to-DSH-Bridge/blob/main/docs/windows-web-test.md) · [第三方声明](https://github.com/SeyanaA/Codex-to-DSH-Bridge/blob/main/THIRD_PARTY_NOTICES.md)。
