# 智能 RPA 平台 (发票报销)

本项目是一个基于 Robocorp 开源 RPA 框架的企业级智能自动化平台。它结合了本地化的 OCR 和多模态大语言模型（LLM）技术，旨在实现各类业务流程（尤其是发票报销）的高度自动化和智能化。

核心能力是将非结构化的文档（如 PDF 和图片格式的发票）转换为结构化的数据，并利用这些数据驱动 RPA 机器人与业务系统（如 OA、ERP）进行交互。

## 项目结构

```
.
├── config/               # 存放非敏感的配置文件 (如服务URL)
├── devdata/              # 存放本地开发所需的数据 (输入的工作项, 模拟密钥文件)
├── notebooks/            # 用于数据探索和模型实验的 Jupyter Notebooks
├── output/               # Robocorp 运行后生成的日志、截图等输出文件 (已被 .gitignore 忽略)
├── robots/               # 存放机器人核心任务代码 (e.g., reimbursement.py)
├── src/                  # 存放可重用的 Python 模块 (e.g., AI服务抽象层)
├── tests/                # 存放单元测试和集成测试
├── .gitignore            # Git 忽略文件列表
├── conda.yaml            # 定义 Conda 环境
├── prd.md                # 产品需求文档
├── README.md             # 本文档
├── requirements.txt      # Python 依赖包列表
├── robot.yaml            # Robocorp 机器人配置文件
├── secrets.json          # (本地开发用) 存放敏感密钥，需自行创建，已加入 .gitignore
└── WORKLOG.md            # 项目工作日志
```

## 环境搭建 (Setup)

在开始之前，请确保您的 macOS 系统上已经安装了 [Homebrew](https://brew.sh/)。

1.  **安装系统依赖:**
    本项目需要 Tesseract OCR 引擎和 Poppler (用于处理PDF) 来支持本地文档识别。打开终端，运行以下命令：
    ```bash
    brew install tesseract tesseract-lang poppler
    ```

2.  **安装 Python 依赖:**
    项目使用 `pip` 管理 Python 包。建议在虚拟环境中进行操作。运行以下命令安装所有必需的库：
    ```bash
    pip install -r requirements.txt
    ```

3.  **安装 Playwright 浏览器:**
    RPA 的浏览器操作依赖于 Playwright。运行以下命令安装其所需的浏览器驱动：
    ```bash
    playwright install
    ```

4.  **配置本地密钥:**
    为了安全地管理 API 密钥等敏感信息，项目使用 `robocorp-vault`。在本地开发时，它会读取项目根目录下的 `secrets.json` 文件。

    请在项目根目录手动创建 `secrets.json` 文件，并填入以下内容。**注意：此文件已被 `.gitignore` 忽略，不会被提交到版本库。**

    *secrets.json 模板:*
    ```json
    {
        "AIServiceCredentials": {
            "ocr_api_key": "YOUR_OCR_API_KEY_HERE",
            "llm_api_key": "lm-studio-key"
        }
    }
    ```
    - `ocr_api_key`: 如果您要接入云端 OCR 服务，请填入其 API Key。对于当前的本地 Tesseract 实现，此项为占位符。
    - `llm_api_key`: 您本地 LM Studio 的 API Key。如果您的服务不需要密钥，可以保留 `lm-studio-key` 这个占位符。

5.  **启动本地大模型服务:**
    本项目配置为连接本地运行的 LLM 服务 (如 [LM Studio](https://lmstudio.ai/))。
    - **启动 LM Studio:** 打开应用，加载 `google/gemma-3-27b` (或您选择的其他多模态模型)。
    - **启动服务:** 导航到 Local Server 标签页，点击 "Start Server"。
    - **确认地址:** 确保服务地址为 `http://127.0.0.1:1234`，与 `config/config.yaml` 中的配置一致。

## 如何运行

### 运行单元测试

在对代码进行任何修改后，建议先运行单元测试，以确保核心功能未被破坏。

```bash
python -m unittest discover tests
```

### 运行完整的机器人流程

本项目通过环境变量来配置本地运行。以下命令将启动一个完整的端到端测试流程：

```bash
RC_WORKITEM_INPUT_PATH="devdata/work-items-in/work-items.json" \
RC_VAULT_SECRET_MANAGER=FileSecrets \
python -m robocorp.tasks run robots/reimbursement.py
```

- **`RC_WORKITEM_INPUT_PATH`**: 指定了输入给机器人的工作项定义文件。您可以修改此 JSON 文件来测试不同的输入。
- **`RC_VAULT_SECRET_MANAGER=FileSecrets`**: 强制 `robocorp-vault` 从本地的 `secrets.json` 文件读取密钥。

机器人运行成功后，详细的 HTML 日志会保存在 `output/log.html` 文件中，您可以打开它查看每个步骤的详细执行情况。

### 启动本地业务系统 (Web App)

本项目包含一个基于 Flask 的模拟业务系统，用于 RPA 交互和人工审核。要启动它，请运行：

```bash
python webapp/app.py
```

应用启动后，您可以在浏览器中访问 `http://127.0.0.1:5001` 来查看登录页面和审核队列。
