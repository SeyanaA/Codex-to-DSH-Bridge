# README 编写事实和边界

仓库：https://github.com/SeyanaA/Codex-to-DSH-Bridge
项目显示名：Codex-to-DSH Bridge
首版：0.1.0-preview.1，待用户实机测试。

这是 DSH Crew 的安装和启动包装，使用上游 @zseven-w/dsh-crew 0.1.0-rc.14，MIT 许可；上游 https://github.com/ZSeven-W/dsh-crew 。不是自行重写 DeepSeek Agent，也不是官方 DSH Desktop。

期望用途：用户向 Codex 提需求，Codex 可通过 MCP 把适合的独立任务交给 DeepSeek，用户在 DSH Web 的 Crew 面板查看任务，Codex 读取结果再审查。默认 Web 端口 3080。Crew 会话不等于 DSH Desktop 会话，换端口不能把 Web 会话搬到 Desktop。是否能在同一个原生聊天中继续对话取决于上游；不要承诺桌面同步、外部主动唤醒 Codex或本包装提供隔离沙箱。上游要求补充信息时停止为 needs_input，补充后重新派发。

封装计划：Mac 提供 DMG，应用内含安装/配置、启动、打开网页、停止自有服务、诊断入口；Windows 提供本地 EXE 安装器和快捷方式，本轮不发布 Windows 二进制。两种均需要 Node.js（24或更新）、DSH CLI 和 Codex；本程序不是包含全部依赖的离线安装包。缺少依赖时明确提示，不静默升级现有 DSH。无需向本程序填写或传输 API key，模型凭据由现有 DSH 配置管理。

安装配置会把已打包的 Crew 插件安装到 DSH 的 web profile，并为 Codex 增加 dsh-crew MCP 配置。原有 Codex 配置先备份，其他 MCP 保留；检测到已有冲突配置时停止并提示。安装仅执行在用户主动选择安装后。本轮不会启动或更改当前运行的 DSH 服务。

启动先检查 3080：如果有可确认的 Crew Web 则复用；其他服务占用就报错，不自动终止。Mac 服务由本启动器单独管理；停止只针对本启动器创建的服务。网页访问 127.0.0.1，只允许本机。日志必须过滤访问令牌。

与旧 codex-dsh-bridge 是不同项目，本仓库不包含旧桥接器、用户模型配置、凭据、会话或测试网站。不能承诺 Crew 自动创建 git-worktree；Codex 应先准备独立工作区再交给它，不自动合并改动。上游 MCP 提供 dsh_spawn_worker、dsh_worker_result、dsh_worker_status、dsh_worker_cancel。更完整工具以当前上游为准。

本轮用户明确不做 Agent/端到端测试。构建完成不代表功能验收通过。只可以写‘已封装，待用户实机测试’，不得编造测试通过。Windows 从 Mac 交叉打包，未在 Windows 上运行。

README 用通俗中文，面向不熟悉开发的人。先讲用途，然后准备条件、下载安装、日常使用、常见问题、限制和反馈。不要堆砌架构图/缩写表/实现术语；必要术语用一句人话解释。建议 800-1400 中文字左右。不编造下载文件名或未实现命令，使用 Releases 页面链接。支持问题反馈文件 support/problem-report-template.md。
