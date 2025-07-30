# 技术设计文档 (DESIGN.md)

本文档详细描述了 `llmrpa` 项目的最终技术选型、组件设计和关键技术实现。

## 1. 系统架构

我们采用经典的前后端分离模式，将项目解耦为三个核心组件：

1.  **Frontend (React SPA):** 用户与之直接交互的 Web 界面，运行在 Electron 桌面应用容器中。
2.  **Backend (Flask API):** 连接前端和 RPA Worker 的中间层，负责业务逻辑编排和任务分发。
3.  **RPA Worker (Robocorp):** 实际执行自动化任务的无头进程，由后端通过子进程方式调用。

### 1.1 架构图

```mermaid
graph TD
    A[用户] -->|上传文件| B(React 前端应用);
    B -->|REST API 调用| C{Flask 后端 API};
    C -->|创建子进程调用| D(Robocorp RPA Worker);
    D -->|调用 AI 服务 (阶段一)| E[LLM (文档理解)];
    D -->|调用 AI 服务 (阶段二)| F[LLM (需求理解/映射生成)];
    D -->|调用 AI 服务 (阶段三)| G[Python (机械填表)];
    D -->|与业务系统交互| H[业务系统 (OA/ERP)];
    H -->|返回结果| D;
    D -->|更新状态/结果| C;
    C -->|返回状态/结果| B;
```

### 1.2 数据流 (AI 驱动的报销流程示例)

1.  用户在 React 前端界面中，批量上传多张票据凭证（图片或PDF）。
2.  前端将文件发送到 Flask 后端的 `POST /api/tasks` 端点。
3.  后端保存文件，并启动一个 Robocorp Worker (`workflow_executor.py`) 子进程，将所有文件路径作为输入传递。
4.  **RPA Worker 启动，执行 `ai_fill_reimbursement_excel` 动作：**
    a.  **阶段一 (文档理解):** Worker 调用 `ai_services.classify_document()` 和 `ai_services.extract_document_data()`，对所有上传的票据进行智能分类和结构化数据提取。
    b.  **阶段二 (需求理解/映射生成):** Worker 调用 `ai_services.generate_excel_mapping()` (新函数)，将提取出的结构化数据和预定义的 Excel 模板描述（自然语言）发送给 LLM。LLM 返回一个精确的“填表指令”JSON。
    c.  **阶段三 (机械填表):** Worker 调用 `ai_services.fill_excel_template()` (新函数)，根据 LLM 返回的填表指令，使用 `openpyxl` 库，将数据填入一个空白的 Excel 模板，并保存为新的 Excel 文件。
5.  **RPA Worker 继续执行 UI 自动化：**
    a.  登录 OA 系统。
    b.  导航到报销表单。
    c.  **第一次上传:** 点击“导入数据”，上传由 AI 填好的 Excel 明细文件。
    d.  **第二次上传:** 循环点击“附件”，批量上传所有原始的票据凭证文件。
    e.  提交报销单。
6.  任务完成后，RPA Worker 更新任务状态，子进程退出。

## 2. 核心组件设计

### 2.1 RPA 工作流执行器 (`robots/workflow_executor.py`)

这是整个 RPA 平台的核心。它是一个通用的、数据驱动的执行引擎，其设计目标是能够解析任何符合其规范的 YAML 文件，并执行相应的自动化操作。

*   **YAML 解析:** 使用 `PyYAML` 库加载和解析工作流文件。
*   **动态动作分发:** 通过一个主循环遍历 YAML 中的 `steps` 列表，并根据每个步骤的 `action` 字段，动态地调用相应的处理方法。
*   **丰富的动作库:** 内置了大量针对现代 Web 应用的原子操作，例如：
    *   **页面交互:** `browser_goto`, `browser_fill`, `browser_click`, `browser_js_click`, `browser_press`
    *   **等待机制:** `browser_wait_for_selector`, `browser_wait_for_url`, `browser_wait_for_load_state`
    *   **上下文切换:** `browser_switch_to_frame` (支持 `__main_page__` 特殊标识符)
    *   **文件处理:** `browser_upload_file`
    *   **高级动作:** `browser_login_human_like` (用于处理加密登录)
    *   **AI 驱动动作:** `ai_fill_reimbursement_excel` (新动作，封装了三阶段 AI 处理逻辑)
*   **变量替换:** 支持 `{{ a.b.c }}` 格式的变量语法，允许在工作流的不同步骤之间传递数据。
*   **错误处理与日志记录:** 内置了健壮的 `try...except` 机制，在任何步骤失败时，都能自动截取屏幕快照 (`_take_error_screenshot`) 并保存当时的页面源代码 (`_proactively_save_source`)，极大地提升了调试效率。

### 2.2 AI 服务层 (`src/ai_services.py`)

该模块是整个平台智能化的核心，负责封装与大模型 (LLM) 的所有交互，并实现三阶段智能文档处理逻辑。

*   **多模型支持:** 设计上支持本地 LLM (通过 `LOCAL_LLM_URL` 环境变量配置) 和云端 LLM API 的切换和回退。
*   **三阶段智能文档处理函数:**
    *   `classify_document(file_path: str) -> str`: **阶段一**。调用多模态 LLM 对文档进行智能分类，返回文档类型 ID (例如 `jipiao`, `vat_general_invoice`)。
    *   `extract_document_data(file_path: str, document_type: str) -> Dict`: **阶段一**。根据文档类型和 `config/invoice_configs.yaml` 中的模板，调用 LLM 提取结构化数据。
    *   `generate_excel_mapping(extracted_data: List[Dict], excel_description: str) -> List[Dict]`: **阶段二**。接收提取出的结构化数据和 Excel 模板的自然语言描述，调用 LLM 生成数据映射指令。
    *   `fill_excel_template(template_path: str, mapping_instructions: List[Dict]) -> str`: **阶段三**。接收空白 Excel 模板路径和映射指令，使用 `openpyxl` 库填充 Excel，并返回填充后的 Excel 路径。

## 3. 关键技术方案剖析

### 3.1 高安全强度登录解决方案 (OA 系统 DES 加密)

在与 `oa.topprismdata.com` 对接的过程中，我们遇到了一个非常典型的、高安全强度的登录挑战。标准的 RPA 登录方式（定位元素并填入凭据）完全失效。

*   **根本原因定位:** 通过抓取和分析登录页的 HTML 源代码，我们发现其登录表单在提交前，会通过前端的 `CryptoJS` 库，使用一个硬编码在页面中的种子 `_SecuritySeed` 对用户输入的明文密码进行 DES 加密。后端验证的是加密后的密文。

*   **最终解决方案:** 我们没有在 Python 端模仿复杂的加密算法，而是采用了更直接、更可靠的“釜底抽薪”策略：**让浏览器自己为我们加密**。我们创建了一个新的 `browser_login_human_like` 动作，其核心逻辑是：
    1.  机器人正常访问登录页，并填写明文用户名。
    2.  通过 `page.evaluate()` 函数，在浏览器中执行一小段我们精心构造的 JavaScript 代码。
    3.  这段 JS 代码调用页面上已经存在的 `CryptoJS.DES.encrypt()` 函数，传入我们的明文密码和页面上的 `_SecuritySeed`，从而得到一个与真实用户操作完全一致的加密后密码。
    4.  机器人将这个加密后的字符串注入到隐藏的密码输入框中，然后点击登录。

这个方案取得了圆满成功，是处理此类复杂前端加密场景的最佳实践。

### 3.2 桌面版工作流录制器 (Electron + Preload Script)

为了解决在复杂企业应用中录制用户操作的挑战，我们实现了一套基于 Electron 的桌面版录制器。

*   **核心架构:**
    *   **主进程 (`electron.js`):** 负责创建和管理录制窗口，处理来自前端的 IPC 命令（如开始/停止录制、保存工作流），并与文件系统交互。
    *   **预加载脚本 (`preload.js`):** 作为桥梁，被注入到录制窗口的渲染进程中。它负责监听浏览器窗口中的 DOM 事件，并将捕获到的步骤通过 `ipcRenderer` 发送回主进程。

*   **智能 iframe 处理:**
    *   **上下文识别:** `preload.js` 中的事件监听器通过检查事件的 `composedPath()`，能够准确地判断出事件源自哪个 iframe，并获取其选择器。
    *   **自动生成切换步骤:** `electron.js` 在保存工作流时，会根据录制步骤的上下文变化，自动在生成的 YAML 中插入 `browser_switch_to_frame` 步骤，包括切换到特定 iframe 和切换回主页面 (`__main_page__`)。

*   **可靠的回放机制:**
    *   当用户点击“回放”时，`electron.js` 会将录制的步骤动态生成一个临时的 YAML 文件。
    *   然后，它会通过 `child_process.exec` 执行一个经过精心构造的 `conda run` 命令，确保 `workflow_executor.py` 在正确的 Conda 环境中被激活并运行这个临时文件。
    *   所有的执行日志都被重定向到 `output/replay.log` 文件，为用户提供了稳定、可靠的调试信息来源。