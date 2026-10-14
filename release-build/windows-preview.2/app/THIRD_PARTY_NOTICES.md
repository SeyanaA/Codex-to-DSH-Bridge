# Third-party components

This Windows distribution bundles the following independently developed components. Their package manifests and available license/notice files are retained in the installed runtime. This bridge does not claim authorship of those projects.

- **Node.js 24.19.0**, Windows x64. License and bundled-library notices: `runtime/NODE-LICENSE.txt`. Project: https://nodejs.org/
- **DeepSeek Harness 0.2.1-alpha.3**, DeepSeek AI, MIT. Package: `runtime/dsh/node_modules/@deepseek-ai/dsh`. Project: https://github.com/deepseek-ai/deepseek-harness
- **DSH Crew 0.1.0-rc.14**, ZSeven-W, MIT. Original source and license: `payload/vendor/crew`, including `LICENSE`. Project: https://github.com/ZSeven-W/dsh-crew
- Other npm production dependencies are included under the DSH runtime and offline profile. See `SBOM.json` for package names, versions and declared licenses; license files shipped by those packages are retained.

Codex is installed and supplied independently by the user. No Codex executable, user login credentials, API key or private conversation is included in this installer.

The setup program is built using **NSIS 3.13**. NSIS source and license: https://nsis.sourceforge.io/

The bridge launcher remains licensed under the MIT text in `payload/LICENSE`.
