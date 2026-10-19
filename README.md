# Codex-to-DSH Bridge

让 Codex 将任务交给 DSH，在 Web 界面查看过程，并在同一条对话中继续工作。Codex 负责取回结果、检查文件和整合改动。

**当前 Windows 版本支持 DSH Web。Desktop 的可靠性尚未验证，本次发布不保证 Desktop 稳定性。** 历史 Mac 版本有有限的 Desktop 短文本测试，不能替代完整可靠性验证。

| 平台 / 模式 | 版本 | 下载 |
| --- | --- | --- |
| Windows x64 / DSH Web | 0.3.0-preview.2 | [Windows Web 发布页](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases/tag/v0.3.0-preview.2) |
| macOS / 历史 Desktop 预览 | 0.3.0-preview.1 | [原 Mac 发布页](https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases/tag/v0.3.0-preview.1) |

**部分 MCP 通信、任务执行和辅助功能集成自 [DSH Crew](https://github.com/ZSeven-W/dsh-crew) 0.1.0-rc.14，作者 ZSeven-W，MIT 许可。** 保留其版权、源码和完整许可；本项目增加内置安装、独立本机通信、同会话绑定与恢复等功能，不将上游功能标为原创。本项目不是 DeepSeek 官方产品，也不包含 DSH Desktop 应用。

## Windows Web 安装和使用

1. 下载发布页的 `Codex-to-DSH-Bridge-0.3.0-preview.2-windows-x64-setup.exe`，用同页 `SHA256SUMS.txt` 核对。安装包自带 Node.js 24.19.0、DSH Web 0.2.1-alpha.3 及固定版本的 Crew 衍生通信源码。
2. 升级前结束当前任务并停止旧启动器管理的 Web。安装到原受管目录或空目录；安装会备份配置，保留模型凭据、会话和其他 MCP。
3. 从开始菜单打开 **2 打开 DSH Web**，首次使用在网页配置模型。新建 Web profile 默认不启用 Crew 插件；已有 profile 不会被重新开启 Crew。
4. 重新打开 Codex，使用 `dsh_desktop_crew` 通信入口。这里保留历史注册名，实际配置为 `surface=web`，任务在 Web 中运行。

Web 界面默认位于 [127.0.0.1:3080](http://127.0.0.1:3080)，独立 MCP 通信端口为 19387。网页需要本地令牌，请使用启动/打开入口取得认证访问，不要公开带令牌的链接。

同一 Codex 对话使用真实 `CODEX_THREAD_ID` 和相同工作目录续聊；不同对话分别绑定。每轮任务有独立 Job ID。固定使用 **DeepSeek-V41-Flash / MAX**，实际模型为 `deepseek-official/deepseek-flash`，不自动切换到 Pro。

写入任务前准备独立目录或 Git worktree，串行派发，等待最终结果并核对实际文件。桥接器不会自动创建 worktree 或合并修改。手动 Web 消息不会主动唤醒已结束的 Codex 会话。

## 已验证范围

Windows 本机已通过：网页关闭 Crew 总开关后重启、真实 MCP 记忆与回忆、同会话续聊、MCP 重连、Web 重启后恢复、实际文件写入与读取、取消及取消后续聊。20 项自动测试通过。

安装器在中文与空格路径下通过隔离静默安装、重复配置、认证访问、卸载、保留会话/用户偏好/其他 MCP，以及移除运行时检查。使用 TESTMODE，**未验证交互向导及真实快捷方式/注册表分支**。

详见 [Web 验收记录](docs/windows-web-test.md)、[真实任务记录](docs/windows-web-task-check.json)、[安装器记录](docs/windows-web-installer-check.json) 和 [发布说明](RELEASE_NOTES.md)。

## 停止、卸载和限制

- “停止服务”仅停止自己管理的 Web；已知桥接任务运行时拒绝停止。先完成或取消任务，也应结束手动回合和自行启动的后台工具。
- 卸载保留 profile 内持久通信组件、凭据、会话与备份；完全移除通信入口需另行处理 profile 插入项，不自动恢复原 Crew 开关。
- Web 重启后聊天历史可以恢复，旧 Job 内存记录可能丢失，应及时保存结果。
- 仅支持本机访问。端口冲突会报错，不终止占用者，不自动改用 Desktop、旧 Crew 或独立 Agent。
- 自动分支识别和摘要生成尚未实现，须显式交接上下文。缓存命中不保证固定节省比例。
- **Desktop 可靠性尚未验证，本次不提供新的 Mac 安装包。** 未覆盖全新 Windows 虚拟机、ARM64、多模态及大并发。EXE 未数字签名。

Mac 历史安装和有限验证见 [原 Desktop 实施记录](docs/bundled-desktop-runtime.md) 及 [Mac 0.3 发布说明](docs/release-notes-0.3.0-preview.1.md)。源码保留 Desktop 接入能力，不代表已通过可靠性验收。

## 构建、协作与许可

Windows Web 构建需要 Python、NSIS 和已校验的 Windows 离线运行时，参数见 [构建和测试说明](docs/windows-web-test.md)。Windows 离线脚本已随源码包提供。

项目由 [SeyanaA](https://github.com/SeyanaA) 发起维护；[OpenAI Codex](https://github.com/codex) 参与设计、开发、适配、测试、审核和发布，DeepSeek / DSH Crew 执行独立子任务，成果由 Codex 检查和整合。

感谢 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 和 [DSH Crew](https://github.com/ZSeven-W/dsh-crew)。见 [第三方声明](THIRD_PARTY_NOTICES.md) 和 [反馈模板](support/problem-report-template.md)，请勿附带 API Key、令牌或私人会话。
