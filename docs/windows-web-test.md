# Windows Web：关闭 Crew 后的会话连续性验收

本轮日期：2026-10-19（Asia/Shanghai）。基线：仓库 `210b89a`，本地分支 `codex/windows-crew-history`。本轮验证 DSH **Web**，没有安装或验证 DSH Desktop。

## 实现

将 Mac 0.3 的内置 Crew 衍生通信组件用于现有 Web profile。Web 界面使用 3080，独立 MCP 通信使用 19387。组件直接使用 DSH 原生 Agent 和持久会话，不依赖 Crew 插件开关。沿用上游固定源码、MIT 许可与 Flash/MAX 模型限制。

新增 `web-host.mjs` 与 `web-runtime.mjs` 管理 Web 生命周期、私有控制接口、日志脱敏与失效锁恢复。`install --surface web` 显式选择 Web，保留 Desktop 默认入口。安装包可从离线模板初始化 Web，新 profile 不启用 Crew；已有 profile 的插件开关由用户管理。

修复 Windows GBK 默认编码导致构建/Python MCP 客户端失败、Windows NSIS 参数格式、冗余复制整个已归档依赖树、初始化期间取消仍提交模型的竞态，以及 Web 卸载前未等待宿主退出的问题。

## 本机真实任务

环境：Windows x64、Node.js 24.19.0、DSH Web 0.2.1-alpha.3、Crew 固定归档 rc.14。测试工作区为独立的 `windows-web-smoke`。

在 Web 插件页关闭 `@zseven-w/dsh-crew` 总开关，随后停止旧启动器管理的 Web 并重启。profile 的启用 bundles 不含 Crew；网页显示开关关闭。原插件安装文件保留。网页仍能读取升级前的旧聊天。

使用本次 Codex 聊天的真实 `CODEX_THREAD_ID` 经标准 MCP 派发；每次 Python 助手调用都重新建立 MCP 连接，未使用虚构聊天编号绕过绑定。

| 验收项 | 实际结果 |
| --- | --- |
| 首次记忆任务 | `hub-1-mvf6a6hb`，done，回复“已记住” |
| 不重发暗号的续聊 | `hub-2-mvf6blzs`，done，回复“青瓷-8036” |
| 完整停止并重新启动 Web 后恢复 | `hub-1-mvf6e8by`，done，仍回复“青瓷-8036”，continued=true |
| 文件任务 | `hub-2-mvf6grr6`，done，4 次工具调用；实际新建并读取 UTF-8 JSON，Codex 独立解析通过 |
| 最终代码再次重启 | `hub-1-mvf704n1`，done，原会话再次正确回忆 |
| MCP 取消 | `hub-1-mvf6ldzt`，cancelled；toolCalls=0，input/output=0 |

上述任务均绑定 `session-ccf3e585-30f9-240c-f776-20e6a854abb5`，模型为 `deepseek-official/deepseek-flash`、effort=max。文件产物有 windows、web、false 及正确暗号，106 字节。用量原字段不用于推算固定节省比例。

任务 Job 记录只保存在宿主内存中，重启后旧 Job ID 可能不可查询；聊天历史由 DSH 持久化并按同一聊天 ID/cwd 恢复。这两者不能混为一谈。

## 复现与构建

已有 Web 环境先停止服务，再执行（路径替换为实际位置）：

```powershell
node scripts/desktop-launcher.mjs install --surface web --dsh-home 'C:\Users\admin\.dsh-codex-bridge' --workspace 'C:\path\isolated-workspace'
node scripts/desktop-launcher.mjs serve
node scripts/desktop-launcher.mjs doctor
```

网页使用 `start`/`open` 入口取得认证链接；不在终端或日志输出带令牌的链接。当前版本保留 MCP 注册名 `dsh_desktop_crew`，实际运行面由配置中的 `surface=web` 决定。Web 安装会迁移旧启动器可验证归属的 `dsh-crew` 注册，保留手工注册及其他 MCP。Crew 关闭后应使用新通信入口，不能把旧入口当作新实现的测试结果。

```powershell
node scripts/prepare-tests.mjs
node --test tests/*.test.mjs
python packaging/build-release.py --platform windows --windows-surface web --windows-compression zlib --previous-runtime 'C:\path\previous\app' --makensis 'C:\path\NSIS\makensis.exe'
```

自动测试已通过 20 项，覆盖安装/重复安装/卸载、Web profile、同聊天续聊、不同编号隔离、模拟宿主持久化恢复、手动回合忙碌保护、初始化取消、端口冲突、浏览器来源拒绝、控制认证、日志脱敏及失效锁恢复。

## 验证边界

Windows 安装包隔离验收结果另见 `windows-web-installer-check.json`；真实任务和回归测试摘要见 `windows-web-task-check.json`。TESTMODE 不写真实快捷方式与卸载注册表；不把它称为交互向导测试。真实模型任务运行于已有 Web profile，隔离安装不复制真实凭据。

不同真实 Codex 聊天及分支的现场交接未新建聊天测试；编号隔离由自动测试覆盖。分支摘要仍须显式交接。未验证 Desktop、全新 Windows 虚拟机、ARM64、多模态和大并发。手动 Web 消息不会自动唤醒 Codex。

发布版本：`v0.3.0-preview.2`，提供 Windows Web 安装包和源码。**Desktop 的可靠性尚未验证；本次 Web 验收不代表 Desktop 验收通过。** Mac 用户仍可使用历史 `v0.3.0-preview.1`，其有限测试不能作为本版 Desktop 可靠性保证。

## 独立审查与补强

DSH 在隔离目录对中间版本进行了静态审查。Codex 核实并修复了配置标记顺序与相邻注释、损坏 Web profile 校验、状态文件丢失后的控制恢复、启动日志与脱敏、活动桥接任务拒绝停止，以及可验证归属的旧 MCP 迁移。审查报告中的其他推演不代表已复现实测缺陷。

停止/卸载前仍应结束手动 Web 回合与自行启动的后台工具。Windows 进程终止并非通用的工具进程树回收机制；不要以此管理任意后台程序。保留 profile 内通信扩展是本版的明确卸载行为，未恢复原 Crew 开关；完全移除时须单独处理 profile 插入项。
