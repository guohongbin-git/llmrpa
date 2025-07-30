[![Awesome AI SDLC](https://img.shields.io/badge/AI%20SDLC-Awesome-blue.svg)](https://github.com/guohongbin-git/awsome-ai-sdlc)

# 企业级智能 RPA 平台

本项目是一个基于 Robocorp 开源 RPA 框架的企业级智能自动化平台。它结合了本地化的 OCR 和多模态大语言模型（LLM）技术，旨在实现各类业务流程（尤其是发票报销和复杂OA系统操作）的高度自动化和智能化。

核心能力包括：
- 将非结构化的文档（如 PDF 和图片）转换为结构化的数据。
- 驱动 RPA 机器人与现代、复杂的 Web 业务系统（如高安全性的 OA、ERP）进行交互。
- 通过一个通用的、由 YAML 定义的结构化工作流引擎来执行任务。

## 项目结构

```
.
├── config/               # 存放各类票据提取的YAML配置文件
├── devdata/              # 存放本地开发所需的数据 (输入的工作项)
├── frontend/             # 平台化的 React 前端应用
├── output/               # Robocorp 运行后生成的日志、截图等输出文件 (已被 .gitignore 忽略)
├── robots/               # 存放机器人核心任务代码 (通用的工作流执行器)
├── src/                  # 存放可重用的 Python 模块 (AI服务、工具类)
├── tests/                # 存放单元测试和集成测试
├── webapp/               # 后端 Flask API 服务
├── workflows/            # 存放可重用的、结构化的 RPA 工作流 YAML 文件
├── .gitignore            # Git 忽略文件列表
├── conda.yaml            # 定义 Conda 环境
├── DESIGN.md             # 系统设计文档
├── prd.md                # 产品需求文档
├── README.md             # 本文档
├── replay.yaml           # 用于快速调试和回放的核心工作流文件
├── requirements.txt      # Python 依赖包列表
├── robot.yaml            # Robocorp 机器人配置文件
├── SESSION_LOG.md        # 详细的调试会话日志
└── WORKLOG.md            # 项目高级工作日志
```

## 功能特性

- **结构化工作流引擎**: 项目的核心是一个通用的工作流执行器 (`robots/workflow_executor.py`)，它能解析并执行 YAML 文件中定义的、包含复杂逻辑（如分支、循环、错误处理）的自动化流程。
- **智能登录模块**: 内置了一个强大的 `browser_login_human_like` 动作，已成功攻克真实 OA 系统中基于 `CryptoJS` 的 DES 加密登录，能够自动分析并执行复杂的前端 JavaScript 加密逻辑。
- **复杂的 Web 交互能力**: 
  - **智能 iframe 处理**: 能够可靠地处理多层嵌套的、动态生成的 `iframe`，这是与现代 Web 应用交互的关键能力。
  - **异步操作处理**: 通过等待网络空闲 (`networkidle`)、等待特定元素出现/消失等策略，能够稳定地处理由 JavaScript 异步加载的页面内容和加载动画。
  - **健壮的点击机制**: 同时支持物理点击 (`browser_click`) 和 JavaScript 事件触发 (`browser_js_click`)，以应对不同前端框架的事件处理机制。
- **智能文档处理 (IDP)**: 利用本地大模型，实现了从多种票据（增值税发票、行程单、机票等）的图片/PDF中提取结构化数据的能力，配置见 `config/invoice_configs.yaml`。
- **平台化架构**: 采用前后端分离的设计，通过 React 前端、Flask 后端 API 和 Robocorp 执行引擎的组合，构建了一个现代化的 Web 应用平台。

## 环境搭建 (Setup)

1.  **安装系统依赖:**
    本项目需要 Tesseract OCR 引擎和 Poppler (用于处理PDF)。
    ```bash
    # macOS
    brew install tesseract tesseract-lang poppler
    # Debian/Ubuntu
    # sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim poppler-utils
    ```

2.  **安装 Python 依赖:**
    项目使用 `pip` 管理 Python 包。建议在虚拟环境中进行操作。
    ```bash
    pip install -r requirements.txt
    ```

3.  **安装 Playwright 浏览器:**
    RPA 的浏览器操作依赖于 Playwright。
    ```bash
    playwright install
    ```

4.  **配置本地大模型服务:**
    本项目配置为优先连接本地运行的 LLM 服务 (如 [LM Studio](https://lmstudio.ai/), [Ollama](https://ollama.com/) 等)。
    - **启动模型服务:** 打开您的 LLM 服务应用，加载 `google/gemma-3-4b` (或您选择的其他模型)。
    - **启动 HTTP 服务:** 启动模型的本地 HTTP 服务。
    - **配置环境变量 (可选):** 代码默认连接 `http://127.0.0.1:1234/v1/chat/completions`。如果您的服务地址或模型名称不同，可以通过设置以下环境变量来覆盖默认值：
      ```bash
      export LOCAL_LLM_URL="http://your-llm-host:port/v1/chat/completions"
      export LOCAL_LLM_MODEL="your-model-name"
      ```

## 如何运行

### 运行核心的端到端 OA 报销流程 (命令行)

这是验证项目核心能力的最直接方式。该流程会自动登录一个高安全性的 OA 系统，并完成一个包含两次文件上传的复杂报销流程。

```bash
# 设置输入文件，其中定义了要执行的 workflow 文件 (replay.yaml)
export RC_WORKITEM_INPUT_PATH="/Users/guohongbin/projects/llmrpa/replay_input.json"
# 强制 robocorp-vault 从本地文件读取（如果需要的话，当前项目不依赖）
export RC_VAULT_SECRET_MANAGER=FileSecrets

# 执行机器人
python -m robocorp.tasks run robots/workflow_executor.py
```

- **`replay_input.json`**: 这个文件定义了工作流的输入参数，最重要的是 `workflow_file` 字段，它指向我们要执行的 `replay.yaml`。
- 机器人运行成功后，详细的 HTML 日志会保存在 `output/log.html` 文件中，您可以打开它查看每个步骤的详细执行情况。

### 运行平台化的 Web 应用

1.  **启动后端 API 服务:**
    ```bash
    python webapp/app.py
    ```

2.  **启动前端应用:**
    ```bash
    cd frontend
    npm start
    ```
    应用启动后，您可以在浏览器中访问 `http://localhost:4000`。

### 运行单元测试

在对代码进行任何修改后，建议先运行单元测试。

```bash
python -m unittest discover tests
```