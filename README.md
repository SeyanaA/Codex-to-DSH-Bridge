# Codex-to-DSH Bridge

一个"安装和启动小助手"：把 DeepSeek 的 Crew 功能打包好，装进你已有的 DSH 环境，并帮 Codex 和它接上线。当前版本 0.1.0-preview.1，属于预览版。

## 它能帮你做什么

你照常向 Codex 提需求。碰到适合单独做的任务时，Codex 可以通过 MCP（两个工具之间约定好的传话方式）把它交给 DeepSeek 去做。你在 DSH 的网页界面里，从 Crew 面板看到这些任务的进展；Codex 之后取回结果再检查一遍。网页默认地址是 <http://127.0.0.1:3080>，只允许在自己这台电脑上打开。

如果某个任务需要你补充信息，它会停下来等你（状态显示为 needs_input），你补完再重新派发即可。

## 开始前需要准备什么

这个程序只是封装，本身不带全部依赖，请先装好：

- Node.js 24 或更新版本
- DSH CLI（DeepSeek 的命令行工具）
- pnpm（DSH 安装插件时用到的下载工具）
- Codex

还没安装依赖的话，可从 [Node.js 官网](https://nodejs.org/en/download)下载安装，再参考 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness)和 [pnpm 安装说明](https://pnpm.io/installation)。先在 DSH 中配好你的 DeepSeek 模型，再使用本启动器。

缺少什么它会直接告诉你，不会偷偷升级你现有的 DSH。你不需要往这个程序里填 API key，模型凭据仍然由你现有的 DSH 配置管理。

## 下载和安装

到 Releases 页面下载：<https://github.com/SeyanaA/Codex-to-DSH-Bridge/releases>

- Mac：提供 DMG 安装包，内含安装/配置、启动、打开网页、停止本程序自己的服务、诊断这几个入口。
- Windows：提供本地 EXE 安装器和快捷方式，但这一轮不发布 Windows 二进制。

Mac 安装顺序：

1. 打开 DMG，把应用拖进“应用程序”，然后从“应用程序”打开它。不要直接在 DMG 内配置，否则 Codex 会记住临时位置。
2. 点“安装与配置”，等待终端窗口提示完成。这一步会联网下载插件依赖。
3. 完全退出并重新打开 Codex，再点“启动 DSH Web”。
4. 照常在 Codex 中提任务，也可以明确说“把文档部分交给 DeepSeek”。

Mac 首次打开如果提示来源不受信任，请到系统设置的“隐私与安全性”里检查并允许打开。当前应用没有 Apple 公证。应用里点操作会打开终端窗口，完成后可以关掉窗口。

Windows 实机测试：运行本地 EXE，安装到默认位置；从开始菜单打开“1 安装与配置”，完成后重启 Codex，再打开“2 启动 DSH Web”。桌面快捷方式用于之后的启动。停止服务和诊断也在开始菜单里。

详细步骤和可填写的结果表见 [Windows 使用与测试指南](docs/windows-usage-test.md)；已有的封装检查结果见 [Windows 检查记录](docs/windows-package-check.md)。

安装会把 Crew 插件装到 DSH 的 web 配置里，给 Codex 增加连接配置和委派规则。改配置前会备份，其他连接保留；发现冲突就提示你处理。已有 DSH Web 运行时，安装插件不会替它重启；需要你自行在合适时机重启，插件才会生效。

## 日常怎么用

启动时会先看 3080 端口：如果能确认是 Crew 的网页，就直接复用；被别的服务占用，它会报错，不会自动去关掉别人的服务。Mac 上由这个启动器单独管理它拉起的服务，停止也只针对它自己创建的那个。日志会过滤掉访问令牌。

有几点要留意：

- Crew 里的会话和 DSH Desktop 的会话是两回事，换端口也不能把网页会话搬到桌面端。
- 能不能在同一个原生聊天里接着聊，取决于上游怎么实现，这里不做承诺。
- 它不会自动创建 git worktree（独立的工作目录副本）。交给 DeepSeek 的任务，最好先由 Codex 准备好单独的工作区；改动也不会自动合并。

## 还没验证的部分

说实话：目前只是完成了封装，功能验收还没做，构建成功不等于用起来一定没问题。Windows 版本是从 Mac 上交叉打包的，没有在 Windows 机器上真正运行过。请把它当作"已封装、待你实机测试"的预览版，不要当成测过的稳定版。

## 遇到问题怎么反馈

点应用中的“诊断”，把错误信息写进[问题反馈模板](support/problem-report-template.md)，再到 [Issues](https://github.com/SeyanaA/Codex-to-DSH-Bridge/issues) 提交。不要附上 API key 或登录链接。

## 关于这个项目和上游

这是第三方封装，不是官方 DSH Desktop，也没有自行重写 DeepSeek Agent。底层用的是上游项目 @zseven-w/dsh-crew 0.1.0-rc.14（MIT 许可）：<https://github.com/ZSeven-W/dsh-crew>。本项目与旧的 codex-dsh-bridge 是两个不同项目，仓库里不包含旧桥接器，也不包含你的模型配置、凭据、会话或测试网站。
