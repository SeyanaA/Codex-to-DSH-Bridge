# Codex-to-DSH Bridge

让 Codex 通过 MCP 将任务交给 DSH 执行，在 DSH Web 查看任务会话、工具过程和生成文件。Codex 负责派发、读取产物和验收。

这是第三方安装与启动封装。DSH 来自 DeepSeek，DSH Crew 是 ZSeven-W 开发的第三方插件。

## 下载

| 平台 | 版本 | 安装包 |
| --- | --- | --- |
| Windows x64 | 0.1.0-preview.2 | [下载 EXE 安装器](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases/tag/v0.1.0-preview.2) |
| macOS | 0.1.0-preview.1 | [下载 Mac 预览版](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases/tag/v0.1.0-preview.1) |

两个版本都是预览版。Windows 安装包尚未数字签名；Mac 应用尚未 Apple 公证。各版本的运行依赖和验证范围见下文。

## Windows：安装与使用

Windows 0.1.0-preview.2 安装包包含 Node.js 24.19.0、DSH 0.2.1-alpha.3 和原版 DSH Crew 0.1.0-rc.14。无需先装 Node/npm/pnpm；请自行安装 Codex，并准备模型账号或 API Key。

1. 下载 Release 中的 `windows-x64-setup.exe`，双击安装。默认装到当前用户目录，无需管理员权限。
2. 安装完成后重新打开 Codex。安装器会注册 `dsh-crew` MCP，并备份已有配置；遇到其他来源的同名配置会提示冲突。
3. 从开始菜单 **Codex-to-DSH Bridge → 2 启动 DSH Web** 打开网页，并配置自己的模型凭据。
4. 在 Codex 指定任务、独立工作目录、输出文件名和验收条件。例如：

> 请通过 DSH 在指定工作目录生成中文产品需求草案，保存为需求草案.md。使用标准模式，只新建这份文件。完成后读取并检查内容，我会在 DSH Web 查看过程。

DSH Web 默认地址为 <http://127.0.0.1:3080>。新版需要本地访问令牌，请通过快捷方式“启动 DSH Web”或“打开网页”进入。API Key 由 DSH 保存，不要提交到 GitHub。

更多说明：[Windows 使用指南](docs/windows-preview.2-usage.md) · [安装与真实 MCP 生成验证记录](docs/windows-preview.2-check.json) · [SHA256 校验值](docs/windows-preview.2-SHA256SUMS.txt)

### 已验证范围

在 Windows 本机隔离用户数据和包含中文、空格的安装路径下，完成了静默安装、MCP 注册与协议、DSH 真实任务生成文件、卸载保留凭据和会话、同名 MCP 冲突保护。此前也已通过 Codex 注册的 MCP 派发生成任务并在 DSH Web 查看会话。

安装器交互向导及快捷方式/注册表分支已编译，但隔离安装测试使用 TESTMODE，未执行这些分支。没有覆盖全新 Windows 虚拟机、ARM64、Pro 模型、大并发及全部插件。DSH 为 alpha；网页续聊旧模型会话可能需要重新选择模型。

### 从源码构建 Windows 安装器

Windows 版可重建源码位于 [release-build/windows-preview.2](release-build/windows-preview.2)，入口及固定版本依赖见 [构建说明](release-build/windows-preview.2/BUILDING.md)。二进制运行时与生成的安装器放在 Release 附件中。

## macOS：原有 0.1.0-preview.1

Mac 预览版使用仓库根目录的 `scripts` 和 `packaging`。需要预先安装 Node.js 24+、DSH CLI 和 pnpm，并先在 DSH 配好模型。Windows preview.2 的自带运行时方案不适用于此 Mac 包。

1. 打开 DMG，把应用拖进“应用程序”，再从“应用程序”打开。不要直接在 DMG 内配置。
2. 点“安装与配置”，等待终端提示完成；这一步联网下载插件依赖。
3. 完全退出并重新打开 Codex，再点“启动 DSH Web”。
4. 在 Codex 提供任务，也可明确说“把文档部分交给 DeepSeek”。

首次打开若提示来源不受信任，请在系统设置“隐私与安全性”检查来源并允许打开。应用操作会打开终端窗口。Mac 版本的历史发布说明和验证状态保留在 preview.1 Release 中；本次 Windows 验证不代表 Mac 回归测试。

## 协作边界

- Codex 使用 `dsh_spawn_worker` 派发，随后通过 `dsh_worker_status` 与 `dsh_worker_result` 读取结果。派发成功不代表任务完成，应检查实际产物。
- 先准备独立工作目录；Crew 不保证自动创建 git worktree，也不会自动合并改动。
- `needs_input` 表示任务需要补充信息；按上游约定补充后重新派发。
- DSH Web 与 DSH Desktop 会话不自动同步；Codex 的完整聊天历史也不会自动复制过去。
- 停止命令只控制此启动器管理的服务；端口被其他服务占用时会报告错误。

## 反馈与上游

通过“诊断”获取错误信息，参考[反馈模板](support/problem-report-template.md)提交 [Issue](https://github.com/SeyanaA/Codex-to-DSH-Bridge/issues)。请勿附 API Key、访问令牌或私人会话。

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [DSH Crew](https://github.com/ZSeven-W/dsh-crew)
- [第三方声明](THIRD_PARTY_NOTICES.md)

本项目不是官方 DSH Desktop，也未重写 DeepSeek Agent。原版 Crew 源码和许可证保留在 Windows 源码目录中。
