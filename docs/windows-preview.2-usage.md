# Codex-to-DSH Bridge — Windows 0.1.0-preview.2

让 Codex 通过 MCP 将任务交给 DSH 执行，并在 DSH Web 查看任务会话、工具过程和生成文件。

## 包含什么

- Node.js 24.19.0（Windows x64）
- DeepSeek Harness 0.2.1-alpha.3
- 第三方插件 DSH Crew 0.1.0-rc.14（ZSeven-W，MIT）
- MCP 启动器、离线 Crew Web profile、桌面和开始菜单快捷方式

依赖已包含在安装包中。安装和 MCP 注册无需 npm/pnpm 下载；实际模型任务需要网络和你自己的模型账号或 API Key。Codex 应由用户独立安装。

## 安装与使用

1. 双击 setup.exe，选择一个空目录或本程序原安装目录。默认安装在当前用户的 LocalAppData\Programs 下，无需管理员权限。
2. 安装器会备份并注册当前用户的 `~/.codex/config.toml` 中的 `dsh-crew` MCP，并追加本程序标记的协作说明。已有其他来源的同名 MCP 配置时会报告冲突，不覆盖它。
3. 重新打开 Codex，在开始菜单 **Codex-to-DSH Bridge → 2 启动 DSH Web** 打开网页。
4. 在 DSH 网页配置自己的模型凭据，或者使用该 DSH 版本支持的模型账号登录。API 请求的费用和配额来自你配置的模型服务。
5. 在 Codex 提供工作目录、任务要求、输出文件名和验收条件。例如：

> 请通过 DSH 在指定工作目录生成一份中文产品需求草案，保存为需求草案.md。使用标准模式，只新建这份文件。完成后由 Codex 读取并检查内容，我会在 DSH Web 查看过程。

Codex 调用 `dsh_spawn_worker` 后，通过 `dsh_worker_status` 和 `dsh_worker_result` 读取结果。也可调用 `dsh_run_worker` 等待短任务。任务派发响应只表示启动；Codex 应检查最终状态与实际生成文件。

## 查看与控制

日常端口是 `http://127.0.0.1:3080`。新版网页要求本地认证令牌，请通过 **启动 DSH Web** 或 **打开网页** 获取正常访问链接。网页侧栏按工作区显示任务会话。

开始菜单还提供 **安装与配置**、**停止服务**、**诊断** 和 **使用说明**。端口已被其他服务占用时会报告错误。停止命令只控制本启动器管理的服务。

默认数据位置：

- `~/.codex-to-dsh-bridge`：桥接配置及脱敏日志。
- `~/.dsh-codex-bridge`：DSH 模型凭据、profile 和会话。
- `~/.codex/config.toml`：Codex MCP 注册。

## 卸载与升级

从 Windows“已安装的应用”或安装目录的 `Uninstall.exe` 卸载。卸载会备份并移除此位置管理的 MCP 和协作说明，保留模型凭据与历史会话。

更新安装到原目录时，安装器先请求停止旧服务，再更新文件和 MCP 路径。安装到不同目录也可迁移本程序标记的 MCP 配置。已有配置始终保留时间戳备份。

## 预览版限制

- DSH 为 alpha 预览版；本包验证的是核心 MCP 任务、文件生成和网页会话链路。
- Crew 是第三方插件，来源和许可证见 THIRD_PARTY_NOTICES.md。
- Crew 默认仍使用 DeepSeek V4 的模型名称；网页菜单更新到 V4.1 后，在网页续聊旧模型会话时可能需要重新选模型。
- 原版 Crew 会把此包装进程的来源显示成 node.exe；主控仍是调用 MCP 的 Codex。
- 每次派发创建一个新的 DSH 会话。Codex 的完整聊天历史不会自动复制过去。
- 模型回复和自检可能出错，复杂写入任务应使用独立目录，由 Codex 读取产物验收。
- 本安装包未进行数字签名。是否信任发布来源由安装者判断；可使用发布页 SHA256 校验文件完整性。

上游：https://github.com/deepseek-ai/deepseek-harness

Crew：https://github.com/ZSeven-W/dsh-crew
