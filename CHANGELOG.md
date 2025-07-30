# 变更日志 (Changelog)

本项目的所有重要代码变更都将记录在此文件中。

---

### [0.2.0] - 2025-07-25

### Added
- **智能登录模块**: 新增了 `browser_login_human_like` 动作，通过直接调用浏览器自身的JS引擎来执行前端加密，成功解决了高安全强度网站的登录难题。
- **配置管理界面**: 在前端新增了可视化的工作流配置管理界面，允许用户查看、编辑、创建和删除RPA工作流。
- **删除功能**: 为配置管理界面实现了完整的前后端删除逻辑。

### Changed
- **RPA执行器重构**: 对 `robots/workflow_executor.py` 进行了多次重构，使其能够支持更复杂的浏览器操作和人机协作模式。
- **文档完善**: 大幅更新了 `README.md` 和 `DESIGN.md`，详细记录了新功能和核心技术挑战的解决方案。

---

### [Unreleased]

### Fixed
- **桌面版录制器回放功能**: 彻底修复了桌面版录制器回放不触发的严重问题。通过对 `electron.js` 和 `robots/workflow_executor.py` 的联合重构，解决了包括 `async/await` 语法错误、Python子进程调用环境路径问题、录制步骤与执行动作不匹配的核心逻辑缺陷，以及 `conda` 命令在Electron环境中路径不固定的问题，确保了回放流程的稳定执行。
- **录制数据健壮性**: 修复了 `preload.js` 中 `textContent` 捕获过长的问题，通过截断文本，增强了生成选择器的稳定性和录制数据的简洁性。
- 修复了OCR文本未正确传递给LLM的问题，确保LLM能够接收到完整的OCR信息。
- 优化了LLM提示，以提高含税金额（total_amount_nett_incl_tax）的提取准确性。
- 修复了前端创建发票模板时，后端保存逻辑的错误，现在新模板能正确保存到 `invoice_configs.yaml`。
- 修复了前端删除发票配置时，后端404错误，现在可以正确删除 `invoice_configs.yaml` 中的配置。
- 修复了机票模板城市信息提取不准确的问题，现在可以正确提取纯城市名称。

### Changed
- 将 `ocr_provider_2` 的实现从Tesseract切换到EasyOCR，以提供更准确的OCR识别能力。
- 优化了智能生成模板的LLM提示，强调以OCR文本为准，并明确包含双OCR占位符。

### Added
### Added
- **桌面版工作流录制器改进**:
  - 增强了对同源 iframe 内部操作的录制能力，自动插入 `browser_switch_to_frame` 步骤。
  - 新增“获取源代码”功能，允许用户在录制过程中获取当前页面或指定元素的 HTML 源代码。
- 新增了对行程单模板的数据提取支持。
- 新增了对机票模板的数据提取支持。

---

### [0.1.0] - 2025-07-25

### Added
- **项目初始化**: 创建了完整的 Robocorp 项目结构、依赖管理 (`conda.yaml`, `requirements.txt`) 和核心 RPA 流程骨架。
- **AI 能力集成**: 集成了本地 Tesseract OCR 和多模态大语言模型（LM Studio），实现了对 PDF 和图片的智能文档处理能力。
- **安全与文档**: 引入了 Robocorp Vault 进行安全的凭证管理，并创建了 `README.md`, `WORKLOG.md`, 和 `CHANGELOG.md` 等核心项目文档。
