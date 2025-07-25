# 变更日志 (Changelog)

本项目的所有重要代码变更都将记录在此文件中。

---

### [Unreleased]

### Added
- 在 `webapp/` 中新增了基于 Flask 的本地 Web 应用，用于模拟真实的报销审批系统，包含用户登录、表单提交和人工审核队列功能。

### Changed
- **核心业务流程重构**: 将 `robots/reimbursement.py` 中的 RPA 机器人目标，从与外部网站交互，变更为与本地 `webapp` 进行交互，以模拟更真实的企业内部系统操作。

---

### [0.1.0] - 2025-07-25

### Added
- **项目初始化**: 创建了完整的 Robocorp 项目结构、依赖管理 (`conda.yaml`, `requirements.txt`) 和核心 RPA 流程骨架。
- **AI 能力集成**: 集成了本地 Tesseract OCR 和多模态大语言模型（LM Studio），实现了对 PDF 和图片的智能文档处理能力。
- **安全与文档**: 引入了 Robocorp Vault 进行安全的凭证管理，并创建了 `README.md`, `WORKLOG.md`, 和 `CHANGELOG.md` 等核心项目文档。
