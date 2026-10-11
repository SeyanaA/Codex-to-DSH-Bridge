# 开发和封装记录

版本：0.1.0-preview.1。

这是安装与启动包装，使用 DSH Crew 的官方发布内容；不替代上游 Agent Runtime。本轮按用户要求跳过应用启动、模型调用和端到端测试。README 由 DeepSeek 在独立工作区起草，Codex 核对并补齐安装步骤。文档委派不是安装器的功能验收。

## 从源码封装

在 Mac 上需要 Python 3.12+、Apple 命令行开发工具和 NSIS（`makensis`）。Node.js/npm 用于首次获取上游固定依赖。没有 `vendor/crew` 时先运行：

```sh
python3 packaging/prepare_vendor.py
python3 packaging/build.py
```

Releases 附带的 source.zip 已包含依赖；GitHub 源码仓库通过 prepare_vendor.py 获取同一个带 SHA-512 校验的 npm 包。打包脚本不会运行 npm 生命周期脚本，也不会启动 DSH。依赖当前固定为 0.1.0-rc.14，不随安装自动升级到 latest。

## 分发内容

- Mac：arm64 + x86_64 通用启动应用和 DMG，最低 macOS 12。仅本机临时签名，没有 Apple 公证。
- Windows：从 Mac 使用 NSIS 生成安装 EXE，按用户要求仅本地交付，不上传本轮 Release。程序需要 Windows 上的 Node.js、DSH CLI、pnpm 和 Codex。
- Windows 卸载保留 Codex/DSH 的配置和备份；先停止服务，再卸载。Mac 也应先停止本启动器的服务，然后按需恢复配置备份，再移除应用。
- 默认端口 3080。Mac 使用独立命名的 LaunchAgent；Windows 使用本启动器的后台 Node 进程。管理通道只监听本机，使用私有随机令牌；停止不依赖不明进程 PID。
- 令牌 URL 不进入日志，私有管理记录写在用户目录下 `.codex-to-dsh-bridge`，不会随程序发布。访问 Web 仍沿用 DSH 自己的登录机制。

## 仍需实机确认

依赖版本兼容性、插件在现有模型配置下运行、Codex 重启后的 MCP 加载、任务结果回传、Crew 面板显示、Mac 退出后的生命周期，以及 Windows 启停均未在本次验收。不得以安装包构建完成代表这些测试通过。

Crew 上游在 Web 不可用时可能回落到独立运行方式。本包装在 MCP 启动前要求确认 Crew Web 已就绪，但不能保证后续 Web 崩溃时上游永远不会回落；遇到页面任务消失应先诊断，不宣称完全透明或自动恢复。本包装没有额外构建 OS 沙箱，也没有自动建 worktree。

问题记录见 support/problem-report-template.md。
