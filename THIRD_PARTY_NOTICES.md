# 第三方内容

本项目是第三方安装与启动封装，不声明下列上游组件为原创。桥接启动器自身使用仓库 LICENSE 中的 MIT 许可。

## Windows 0.1.0-preview.2

安装包包含 Node.js 24.19.0（Windows x64）、DeepSeek Harness 0.2.1-alpha.3 和 DSH Crew 0.1.0-rc.14，以及各自 npm 生产依赖。

完整说明见 [Windows 分发声明](release-build/windows-preview.2/app/THIRD_PARTY_NOTICES.md)，依赖清单见 [SBOM](release-build/windows-preview.2/app/SBOM.json)。运行时依赖未作为 Git 二进制提交，安装包保留上游随包提供的许可和声明。

Crew 的原版源码与 MIT 许可保存在 `release-build/windows-preview.2/app/payload/vendor/crew`。Windows 构建使用 NSIS 3.13；Codex 由用户独立安装。

## macOS 0.1.0-preview.1（原有封装）

- 上游：https://github.com/ZSeven-W/dsh-crew
- 固定版本：@zseven-w/dsh-crew 0.1.0-rc.14
- 原始 npm 包：vendor/zseven-w-dsh-crew-0.1.0-rc.14.tgz
- 原始许可：vendor/crew/LICENSE（原安装包完整保留）
- npm SHA-1：63867061c5beca31e9663e8cce0a1a44043f0115

Mac preview.1 要求用户分别安装 DSH、Codex、Node.js 和 pnpm，不包含这些运行时。

## Local Desktop session adaptation

The session Hub template is derived from @zseven-w/dsh-crew 0.1.0-rc.14 (ZSeven-W, MIT). Changes add persistent conversation mapping, resume/adoption, scoped event collection, cache usage and fixed V41 Flash/MAX delegation. The installed upstream package is not overwritten.

## yaml

The bundled yaml JavaScript package is MIT licensed, copyright Eemeli Aro. Its license is included at vendor/yaml/LICENSE. It is used to preserve Desktop plugin configuration values during installation.
