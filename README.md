# Codex-to-DSH Bridge

让 Codex 把合适的子任务交给 DeepSeek，**直接在 DSH Desktop 里看到过程，并在同一条对话里继续工作**。Codex 取回结果后负责检查和整合。

当前版本：**0.2.0-preview.1**。提供 Mac 通用 DMG 和 Windows x64 EXE。这是 DSH Crew 的本地适配与启动器，不是 DeepSeek 官方产品，也不包含 DSH Desktop 应用本身。

## 这次最重要的变化

- 同一个 Codex 会话首次委派时创建一个 DSH 会话，后续任务接着聊。
- 不同 Codex 会话各自对应不同 DSH 会话，使用同一个目录也不会混在一起。
- 每轮任务有独立编号，Codex 可以查状态、取结果和取消。
- 固定使用 **DeepSeek-V41-Flash，MAX**，实际编号为 `deepseek-official/deepseek-flash`，不会自动切到 V4 或 Pro。
- Mac 和 Windows 共用同一套 Desktop 接入与续聊代码。旧 Windows 离线 Web 环境保留为单独的兼容入口。

完整变化见 [发布说明](RELEASE_NOTES.md)，初稿由 DSH 编写，Codex 审核。

## 安装前

1. 安装 Codex 和 [DeepSeek Harness Desktop](https://github.com/deepseek-ai/deepseek-harness)。先打开一次 Desktop，完成模型配置和初始化，再从应用菜单完全退出。
2. Mac 需要 Node.js 24 或更新版本；Windows 包内已带 Node.js。
3. 配置时若 Desktop 尚未安装 Crew，会尝试通过 Desktop 自带的官方命令安装固定的 `@zseven-w/dsh-crew@0.1.0-rc.14`，首次可能联网。若该版本没有对应命令，请先在 Desktop 插件页安装并启用 Crew，完全退出后重试。

安装前会备份配置，保留其他插件和 MCP。Desktop 使用自己已有的模型配置，旧 Web 的账号和历史不会自动合并到 Desktop。

## Mac

从 [Releases](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases) 下载 DMG，把应用拖进“应用程序”，从应用程序打开，点击 **安装与配置**。完成后重新打开 Desktop 和 Codex。

以后使用 **打开 DSH Desktop**。应用未经 Apple 公证，使用本机临时签名；若系统阻止打开，请按 macOS 正常应用授权流程操作。启动器含 arm64 与 x86_64，Intel Mac 未实机验证。

## Windows

下载 `windows-x64-setup.exe`，安装到原目录或空目录。它保留旧包带的 Node.js 和 Web 离线环境；Desktop 功能仍需要你自己安装 DSH Desktop。

开始菜单 **1 安装与配置 → 2 打开 DSH Desktop**。旧网页用户可用 **旧 Web 兼容入口**；首次注册旧 Web 时运行 `run.cmd web-install`。这是明确选择，不会在 Desktop 连接失败时自动切换。旧 Web 保持原版每任务新会话的行为；需要同一会话续聊请使用 Desktop。两种入口均锁定 V41 Flash / MAX。

Windows 安装包在 Mac 上构建并检查内容，**新版安装、升级、卸载和模型任务仍待 Windows 实机验收**。见 [Windows 使用与测试](docs/windows-desktop-test.md)。

## 日常使用

直接在 Codex 提任务，例如：

> 把文档部分交给 DSH，在当前会话对应的 Desktop 对话中继续，完成后你检查再整合。

Codex 使用 `dsh_desktop_crew`，把当前 `CODEX_THREAD_ID` 原样作为 `conversation_id`，并保持相同工作目录。用户无需手工填编号或复制消息。

默认目录是 `~/.codex-to-dsh-bridge/desktop-smoke-workspace`。这是项目分组，不是所有 Codex 对话共用的一条聊天。安装时用 `--workspace` 可沿用已有目录；同一个会话换目录会产生新的绑定。

任务串行执行。写代码前应准备独立目录或 Git worktree；Codex 负责验收和整合，程序不会自动创建 worktree 或合并修改。你也能在 Desktop 直接发消息，但请避免同时给同一会话下冲突指令。

## 为什么原 Crew 组件显示关闭

原版 Crew 每次派发都会新建会话。为了支持续聊，本程序保留 Crew 安装与页面，关闭原后台组件，换成 `codex-desktop-session-hub`。**这是替换后台实现，不是卸载 Crew 或停止委派。**新组件保存在 Desktop 的配置目录中，不引用开发者机器上的路径。

## 诊断、停止和回退

- “诊断”检查路径、配置、Crew 和接口；不会调用模型，也不会把失败项目显示为成功。
- 本程序不会替你退出 Desktop。退出请用 Desktop 菜单；关闭窗口可能只是隐藏。
- 卸载保留 Desktop 组件、模型凭据、会话和备份。Windows 卸载仍校验安装目录归属。
- 手工接入过同名 MCP 时会保留并提示冲突；确认迁移后使用 `install --adopt-existing`。

高级路径设置、源码构建和回退见 [安装说明](docs/desktop-installation.md)。

## 当前限制

Mac 已实测续聊、MCP 重连、Desktop 重启后恢复，以及用户实际分支中的 Markdown 摘要交接。摘要由 Codex 根据分支点生成；**任意未来分支的自动识别和摘要自动生成尚未完成**。

Desktop 的消息不会主动唤醒已结束的 Codex 会话。Desktop 重启后能恢复聊天历史，但旧任务编号的内存记录可能丢失，应及时保存结果。缓存取决于请求前缀和服务端状态，不保证每次命中或固定节省比例。

## 协作署名

本项目由 [SeyanaA](https://github.com/SeyanaA) 发起并维护，使用 AI 协作完成开发：

- **OpenAI Codex**：参与方案设计、桥接功能开发、Mac 与 Windows 打包适配、测试验证、代码审核和发布。
- **DeepSeek / DSH Crew**：执行委派的独立子任务，参与文档与发布说明初稿；成果由 Codex 检查和整合。

感谢上游：[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) · [DSH Crew](https://github.com/ZSeven-W/dsh-crew)。第三方代码与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

问题反馈见 [模板](support/problem-report-template.md)，请勿附带 API Key 或登录令牌。
