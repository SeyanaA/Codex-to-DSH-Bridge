# Codex-to-DSH Bridge 0.2.0-preview.1：Desktop 同一会话续聊

说明初稿由 DSH Desktop Crew 使用 DeepSeek-V41-Flash、MAX 撰写，Codex 核对并修订。

## 这次改了什么

之前 Mac 的 v0.1.0-preview.1 和 Windows 的 v0.1.0-preview.2，主要面向 DSH Web。这次新版本提供 Mac DMG 和 Windows x64 EXE 两种安装包，两边共用同一套逻辑，并优先连接你已经装好的 DSH Desktop。

会话衔接也做了调整。一个 Codex 会话第一次委派时，会创建一个 DSH 会话；之后这个 Codex 会话继续用同一条 DSH 会话。不同的 Codex 会话彼此分开，不会因为共用目录就混在一起。每轮任务有独立编号，可以按编号读回结果。

模型方面锁定为你指定的 DeepSeek-V41-Flash 和 MAX，不会自动切成 Pro，也不会自动降低思考等级。

原 Crew 后台组件由续聊组件接替，Crew 安装与页面保留。插件页显示原组件关闭，不代表停止委派。新组件保存在 Desktop 的配置目录，不再引用开发者机器路径。

## 怎么用

安装会备份现有配置。Desktop 模式使用 Desktop 已有的模型配置，旧 Web 的账号和历史不会自动合并过去；不会自动合并代码。默认按串行方式跑任务，Codex 负责验收。

目前 Mac 上已经实测过续聊、MCP 重连，以及 DSH Desktop 重启后恢复。也验证了用户实际创建分支后，用 Codex 写 Markdown 摘要做交接，并能在分支中继续。

## 已知限制

自动识别任意未来分支并自动生成摘要，目前还没有完成。当前由 Codex 根据分支点整理 Markdown 摘要，再交给分支对应的新会话阅读；桥接器尚未自动读取任意分支元数据。

Windows 已同步同一套 Desktop 接入与续聊代码，并保留 preview.2 的离线 Web 环境作为显式选择的兼容入口。因为 Windows 无法在 Mac 上实机验收，Windows 的安装和会话端到端流程，还需要你在自己的机器上验证。Mac 通用包在 Intel 芯片上的执行，也还没有实机验证。

缓存按请求前缀匹配，不保证每轮都命中，所以这里不写固定的节省百分比。
