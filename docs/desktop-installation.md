# 配置、构建和回退

## 配置位置

- `~/.codex-to-dsh-bridge/desktop.json`：安装位置、Desktop 地址和工作目录。
- `$DSH_HOME/profiles/desktop/codex-bridge/crew-session-hub.mjs`：持久续聊组件，默认 DSH_HOME 是 `~/.dsh`。
- `~/.codex/config.toml`：带 `BEGIN/END codex-desktop-bridge` 标记的 MCP 配置。
- `~/.codex/AGENTS.md`：本程序标记的委派说明；其他规则保留。

修改前备份。原 Crew 包不被改写；先校验固定版本 Hub 源文件 SHA-256，再生成适配。上游改变时拒绝盲目套用。

## 自定义与迁移

在 payload 目录运行，Mac 用系统 Node，Windows 用包内 runtime/node.exe：

```text
node scripts/desktop-launcher.mjs install --workspace "现有工作目录" --desktop-url http://127.0.0.1:19387
node scripts/desktop-launcher.mjs install --desktop-path "Desktop 应用实际路径"
node scripts/desktop-launcher.mjs install --adopt-existing
node scripts/desktop-launcher.mjs doctor
```

迁移参数只用于你确认要接管的旧手工同名 MCP。已有无关连接不删除。旧本地实验请用 `--workspace` 指向原工作目录以保留绑定；已安装版本的 desktop.json 会沿用此前选择。

本版把经 SHA-256 校验的随包归档展开到 `codex-bridge/crew-rc14-<摘要>`；Crew 总开关可关闭，甚至未安装该插件也能完成隔离安装测试。不会通过 Desktop CLI 自动重新启用原插件。通信端口由本程序组件管理，不修改 Desktop 的 Web 服务端口。

## 源码构建

需要 Node.js 24+、Python 3、macOS 开发工具、NSIS 和 7-Zip。

```bash
npm test
gh release download v0.1.0-preview.2 --repo SeyanaA/Codex-to-DSH-Bridge --pattern '*windows-x64-setup.exe' --pattern SHA256SUMS.txt --dir dist/previous
# 先按校验清单核对 EXE，再提取它的离线运行环境。
7zz x -y -odist/previous/extracted dist/previous/Codex-to-DSH-Bridge-0.1.0-preview.2-windows-x64-setup.exe bridge-runtime.tar.gz runtime/node.exe runtime/NODE-LICENSE.txt runtime/DSH-LICENSE.txt build-manifest.json SBOM.json
python3 packaging/build-release.py
```

构建脚本再次校验旧离线压缩包的 SHA-256，并逐文件比对 Mac/Windows 的 Desktop 代码。输出 DMG、EXE、源码 ZIP、校验清单和构建报告。Mac 通用启动器与 DMG 必须在 Mac 构建；Windows EXE 可单独用 `--platform windows` 构建。

旧离线环境保持 Node.js 24.19.0、DSH 0.2.1-alpha.3、Crew 0.1.0-rc.14。它服务于显式选择的旧 Web 模式，不冒充 DSH Desktop。

## 回退与卸载

等任务结束并完全退出 Desktop，再检查备份。仅移除新增 `codex-desktop-session-hub` 插入项、恢复原 `dsh-crew-hub` 状态，并恢复对应 MCP。不要覆盖备份之后其他人的修改。

卸载保留 Desktop 组件、凭据、会话和备份。组件不依赖应用安装位置，不会留下指向已删除安装器的插件入口。Windows 卸载仍校验安装目录标记，清理本安装位置拥有的程序文件。
