# Windows 0.2.0-preview.1 使用与验收

此版本在 Mac 构建，Windows 实机项目前均待验证。旧离线环境来自已发布的 0.1.0-preview.2，保留原压缩包校验和。

## 安装

1. 下载 EXE 与 `SHA256SUMS.txt`。用 PowerShell `Get-FileHash .\Codex-to-DSH-Bridge-0.2.0-preview.1-windows-x64-setup.exe -Algorithm SHA256` 核对。
2. 安装并打开一次 DSH Desktop，配置模型 `deepseek-official/deepseek-flash`，从托盘菜单完全退出。
3. 运行 EXE，安装到原目录或空目录。开始菜单运行“1 安装与配置”。自动安装 Crew 失败时，先在 Desktop 插件页安装并启用 `@zseven-w/dsh-crew@0.1.0-rc.14`，退出后重试。
4. 重新打开 Codex 与 Desktop。找不到 Desktop 时，用安装目录的 `run.cmd install --desktop-path "实际 DeepSeek Harness.exe 路径"` 配置。
5. 运行“诊断”；未通过的项目要处理，不能当成任务成功。

默认无需管理员权限。Desktop 与旧 Web 的账号不自动合并。Desktop 默认使用本机 19387；已有端口配置请用 `--desktop-url http://127.0.0.1:实际端口` 保持一致。程序不会杀掉占用端口的进程。

## 测试表

| 项目 | 操作与预期 | 记录 |
| --- | --- | --- |
| 首次委派 | Codex A 让 DSH 记住短暗号，Desktop 出现独立会话，Codex 取回回复 | 待填写 |
| 续聊 | A 不重发暗号，DSH 在同一会话正确回忆 | 待填写 |
| A/B 隔离 | Codex B 委派后出现另一条 Desktop 会话，A 不被替换 | 待填写 |
| 分支交接 | Codex 整理分支点摘要；分支新会话读取，父会话不被追加 | 待填写 |
| MCP 重连 | 重新打开 Codex，在原对话继续，编号与工作目录保持一致 | 待填写 |
| Desktop 重启 | 等任务结束再退出重开，继续后仍保留原会话历史 | 待填写 |
| 文件任务 | 只允许修改临时测试文件，Codex 能核对实际文件和 diff | 待填写 |
| 模型 | 任务结果是 deepseek-flash / max，无自动 Pro 升级 | 待填写 |
| 端口冲突 | 提示可读错误，不终止占用进程 | 待填写 |
| 升级/卸载 | 其他 MCP 与插件、凭据、会话保留 | 待填写 |
| 旧 Web | 显式选择兼容入口后使用旧 3080 环境，Desktop 失败不自动切换 | 待填写 |

分支摘要当前由 Codex 生成，桥接器尚未自动读取任意分支元数据。不要把此测试当成全自动分支同步验收。

遇到问题，请记录 Windows/DSH Desktop 版本、安装路径、模式、首次失败步骤、诊断和预期/实际结果，写成 Markdown；遮掉凭据。先测试短文本，再测试文件操作。不要清空 `.dsh`、`.dsh-codex-bridge` 或 `.codex` 来排故。

旧版参考：[preview.2 使用说明](windows-preview.2-usage.md)。
