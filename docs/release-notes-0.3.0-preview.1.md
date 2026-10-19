# Codex-to-DSH Bridge v0.3.0-preview.1：Mac 内置通信版

说明初稿由 DSH Desktop 中的 DeepSeek-V41-Flash / MAX 撰写，Codex 核对并修订。

## 这次改了什么

**本项目的部分 MCP 通信、任务执行和辅助功能集成自 [DSH Crew](https://github.com/ZSeven-W/dsh-crew) 0.1.0-rc.14，原作者 ZSeven-W，使用 MIT 许可。保留其版权、源码和完整许可；不将上游功能标为本项目原创。** 这是基于 Crew 的开源改造与封装。

本版把所需通信代码随安装包提供，安装到桥接器自己管理的目录。无需另外安装或启用 Desktop 的 Crew 插件。新增的本机通信入口独立于 Desktop 的 Web 服务；Codex 下发任务后，仍由 DSH Desktop 执行并显示真实对话。

每个 Codex 对话继续绑定自己的 Desktop 会话，后续任务接着聊。保留 Flash / MAX 模型限制、任务编号、结果回传和配置备份。

## 已验证

Mac Apple Silicon / DSH Desktop 0.2.1-rc.2：关闭整个 Crew 插件并重启后，两轮短文本任务沿用同一个历史会话，第二轮未重发暗号仍能正确回忆，结果可回传，Desktop 界面可见，两轮工具调用均为 0。16 项自动测试通过。Mac 通用 DMG 的镜像校验、临时签名和双架构检查通过。

详见 [实施与验证记录](docs/bundled-desktop-runtime.md)。

## 怎么安装

先安装并初始化 DSH Desktop，准备 Node.js 24+。从本页下载 `mac-universal.dmg`，把应用拖到“应用程序”。完全退出 Desktop，打开桥接器，运行“安装与配置”，完成后重新打开 Desktop 和 Codex。旧手工 MCP 注册若提示冲突，可按文档使用 `install --adopt-existing`；配置变更前会备份。

应用使用临时签名，未经过 Apple 公证。请按 macOS 正常应用授权流程处理系统提示。

## 发布范围与限制

本次仅提供 **Mac 通用 DMG、源码包、许可说明、测试记录和校验文件**，不发布新 Windows 安装包。Windows 仍使用 [0.2.0-preview.1](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases/tag/v0.2.0-preview.1)，该旧包尚不包含本轮内置通信改造。Windows 源码与封装入口已调整，实机测试仍待完成；Intel Mac 未实机验证。

自动识别任意分支并生成摘要、从外部主动唤醒 Codex仍未实现。聊天历史由 Desktop 保存，重启后旧 Job 的内存记录可能消失。未来 DSH 服务接口变更仍需兼容性验证；本项目没有重新实现 DSH Agent 引擎。

上游与许可见 [第三方声明](THIRD_PARTY_NOTICES.md)。上一版发布说明保存在 [0.2 历史记录](docs/release-notes-0.2.0-preview.1.md)。
