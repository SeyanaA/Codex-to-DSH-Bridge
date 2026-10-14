# Windows 安装包检查记录

日期：2026-10-14。检查设备是 Mac，未发现可用的 Windows 虚拟机、Wine 或其他 Windows 执行环境。本记录不代表 Windows 实机验收。

## 检查的是哪一份包

文件：`Codex-to-DSH-Bridge-0.1.0-preview.1-windows-setup.exe`，大小 1,747,048 字节。本轮没有改动或重新封装这份 EXE，也没有把 Windows 二进制上传到 GitHub。

SHA-256：

```text
1c4f9d50ae8fd3cafdbea2002497af4f5b53cbccdddee04469704a56ae355e18
```

Windows 上可进入 EXE 所在文件夹，运行下面的只读命令核对文件。大小写不影响校验值对比。

```powershell
Get-FileHash -LiteralPath '.\Codex-to-DSH-Bridge-0.1.0-preview.1-windows-setup.exe' -Algorithm SHA256
```

命令依据：[微软 Get-FileHash 文档](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/get-filehash)。

## 今天实际做了什么

| 检查 | 实际结果 | 能证明什么 |
| --- | --- | --- |
| 用 7-Zip 检查真实 EXE | 成功，识别为 NSIS-3 Unicode / LZMA；101 个文件条目 | 安装包压缩数据可读，没有发现损坏 |
| 读取 Windows 可执行文件头 | 成功，PE32，机器类型 0x14c | 文件是 Windows 安装器格式，不是改扩展名的普通文件 |
| 把真实 EXE 解包到临时目录 | 成功 | 可以检查包里的真实程序内容 |
| 核对 15 个关键文件以及 Windows 启动脚本 | 全部存在，内容与源码逐字节一致 | 启动器、插件入口、原始依赖包、许可和反馈模板已装进 EXE |
| 对解包出的 4 个启动脚本做 Node 语法检查 | 全部通过 | 这些 JavaScript 文件在当前 Node 下可解析 |
| 用虚构凭据检查日志过滤 | 3 个示例通过 | 示例中的 URL token、Bearer 和假 API key 被隐藏；不代表覆盖所有凭据格式 |
| 尝试打开非本机网页地址 | 在打开浏览器前拒绝 | 这一入口不接受测试用的外部 URL |
| 实际运行本机诊断 | 找到 Node、DSH 和 pnpm，识别 3080 已被其他服务占用或身份无法确认 | 本机诊断能给出状态，没有停止已有服务 |
| 从 EXE 提取的 MCP 入口在未安装配置时启动 | 退出码 1，提示“请先在应用中选择‘安装与配置’” | 未配置时会明确报错；没有静默执行任务 |

包内容和语法部分有 21 项记录，全部通过，详见 [原始检查数据](windows-package-check.json)。以上 JavaScript 运行发生在 Mac 上；没有执行 Windows 的 EXE、CMD、PowerShell、安装页面或卸载程序。

首次在受限环境里运行诊断时，本机网络访问被阻断，误显示“未监听”。随后在允许访问本机网络的环境中重新运行，识别为“其他服务占用或身份无法确认”。这里记录后一次结果，并保留这个限制说明。

## Windows 上还没有做的事

- EXE 安装页面、安装目录和卸载入口是否正常。
- 桌面与开始菜单快捷方式能否启动。
- Windows 的 Node/DSH 路径识别、插件安装和 Codex 配置加载。
- 后台运行、关闭终端后继续运行、重复启动、停止与再次启动。
- Codex → DeepSeek → Codex 的真实结果回传，以及 Crew 面板显示同一个任务。

下一步请按 [Windows 使用与测试指南](windows-usage-test.md)操作。先做一句话联通测试，通过后再考虑文件修改和长任务。
