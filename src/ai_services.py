from typing import List, Dict, Optional
import yaml
import requests
import json
import os
import re
import openpyxl # Added for Excel manipulation
import shutil # Added for file operations

class LLMService:
    def __init__(self):
        self.api_key = os.getenv('TENCENT_CLOUD_API_KEY')
        self.endpoint = "https://tce.tencentcloudapi.com"
        self.local_llm_enabled = os.getenv('LOCAL_LLM_ENABLED', 'true').lower() == 'true'
        self.local_llm_url = os.getenv('LOCAL_LLM_URL', 'http://127.0.0.1:1234/v1/chat/completions')
        self.local_llm_model = os.getenv('LOCAL_LLM_MODEL', 'google/gemma-3-4b')

    def _call_local_llm(self, prompt: str) -> dict:
        """调用本地LLM API"""
        payload = {
            "model": self.local_llm_model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.3,
            "max_tokens": 2000
        }
        response = requests.post(self.local_llm_url, headers={"Content-Type": "application/json"}, json=payload)
        response.raise_for_status() # Will raise an exception for 4xx/5xx status
        return response.json()

    def _parse_llm_response(self, response: dict) -> str:
        """解析API响应，并从Markdown代码块中提取YAML或JSON。"""
        if 'choices' not in response or not response['choices']:
            raise ValueError(f"LLM API返回格式错误或为空: {response}")
        content = response['choices'][0]['message']['content'].strip()
        # Try to extract from markdown code block first
        match = re.search(r"```(?:yaml|json)?\n(.*?)\n```", content, re.DOTALL)
        return match.group(1).strip() if match else content

    def generate_yaml_from_prompt(self, prompt: str) -> str:
        """通用函数，根据prompt调用LLM并返回YAML字符串"""
        try:
            response = self._call_local_llm(prompt)
            return self._parse_llm_response(response)
        except Exception as e:
            print(f"LLM调用失败: {str(e)}")
            raise

# --- Stage 1: Document Understanding ---

def classify_document(file_path: str) -> str:
    """
    阶段一：文档分类。
    调用多模态LLM，根据文档内容（图片）判断其所属的模板类型。
    当前版本返回一个模拟的分类结果用于流程验证。
    """
    print(f"[AI_SERVICE] 阶段 1: 正在对 {os.path.basename(file_path)} 进行AI分类...")
    # TODO: 在此接入真实的多模态分类模型
    # 模拟返回一个固定的类型，以便测试流程
    file_name = os.path.basename(file_path).lower()
    if "jipiao" in file_name or "flight" in file_name:
        doc_type = "jipiao"
    elif "train" in file_name or "huochepiao" in file_name:
        doc_type = "train_ticket"
    elif "vat" in file_name or "invoice" in file_name:
        doc_type = "vat_general_invoice"
    elif "xingchengdan" in file_name or "itinerary" in file_name:
        doc_type = "xingchengdan"
    elif "excel" in file_name or "xlsx" in file_name:
        doc_type = "reimbursement_excel" # Special type for the Excel template
    else:
        doc_type = "unknown"
    print(f"[AI_SERVICE] 分类结果: {doc_type}")
    return doc_type

def extract_document_data(file_path: str, document_type: str) -> Dict:
    """
    阶段一：数据提取。
    根据已经确定的文档类型，加载对应的模板，并调用LLM提取结构化数据。
    当前版本返回模拟数据以验证流程。
    """
    print(f"[AI_SERVICE] 阶段 1: 正在使用 '{document_type}' 模板从 {os.path.basename(file_path)} 中提取数据...")

    # 1. 加载模板配置
    config_path = os.path.join(os.path.dirname(__file__), '..', 'config', 'invoice_configs.yaml')
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = yaml.safe_load(f)
    except FileNotFoundError:
        print(f"Error: invoice_configs.yaml not found at {config_path}")
        configs = {}
    
    template = configs.get('invoice_types', {}).get(document_type)
    if not template:
        print(f"Warning: 在 invoice_configs.yaml 中未找到类型为 '{document_type}' 的模板。返回通用模拟数据。")
        return {"mock_data_for": document_type, "file_name": os.path.basename(file_path)}

    # 2. TODO: 调用OCR服务获取文本和图片Base64 (当前跳过，假设LLM直接处理图片)
    # In a real scenario, you would read the file, perform OCR, and convert image to base64
    ocr_text_1 = f"(模拟OCR文本1 for {os.path.basename(file_path)})";
    ocr_text_2 = f"(模拟OCR文本2 for {os.path.basename(file_path)})";
    image_base64 = f"(模拟图片数据 for {os.path.basename(file_path)})";

    # 3. 构建Prompt (使用实际的llm_prompt_template)
    llm_prompt_template = template.get('llm_prompt_template', '从图片和OCR文本中提取数据。图片：{image} OCR文本1：{ocr_text_1} OCR文本2：{ocr_text_2}')
    
    prompt = llm_prompt_template.format(
        image=image_base64,
        ocr_text_1=ocr_text_1,
        ocr_text_2=ocr_text_2
    )
    
    # ** 当前返回模拟数据以验证流程 **
    print(f"[AI_SERVICE] 注意: 当前返回模拟数据以验证端到端流程，基于模板 '{document_type}'.")
    if document_type == "vat_general_invoice":
        return {
            "invoice_number": f"MOCK_VAT_{os.path.basename(file_path).split('.')[0]}",
            "total_amount_nett_incl_tax": 1170.00,
            "issue_date": "2025-07-30"
        }
    elif document_type == "jipiao":
        return {
            "departure_city": "北京",
            "arrival_city": "上海",
            "total_amount": 850.00,
            "booking_date": "2025-07-30"
        }
    elif document_type == "train_ticket":
        return {
            "passenger_name": "张三",
            "train_number": "G123",
            "price": 150.00
        }
    elif document_type == "xingchengdan":
        return {
            "start_date": "2025-07-01",
            "end_date": "2025-07-05",
            "total_amount": 2500.00,
            "city": "广州"
        }
    else:
        return {"mock_data_for": document_type, "file_name": os.path.basename(file_path)}

# --- Stage 2: Requirement Understanding & Mapping Generation ---

def generate_excel_mapping(extracted_data: List[Dict], excel_description: str) -> List[Dict]:
    """
    阶段二：需求理解与映射生成。
    LLM 根据提取出的结构化数据和 Excel 模板的自然语言描述，生成数据映射指令。
    当前版本返回模拟的映射指令。
    """
    print(f"[AI_SERVICE] 阶段 2: 正在根据Excel描述生成映射指令...")
    print(f"  Excel 描述: {excel_description}")
    print(f"  提取数据: {json.dumps(extracted_data, ensure_ascii=False, indent=2)}")

    # TODO: 在此接入LLM，根据excel_description和extracted_data生成映射指令
    # 模拟返回一个映射指令
    mock_mapping = []
    current_row = 3 # Assuming data starts from row 3

    for item_index, item in enumerate(extracted_data):
        mappings_for_item = []
        doc_type = item.get('document_type', 'unknown')
        data = item.get('data', {})

        # Example mapping logic based on document type and excel_description
        # In a real scenario, LLM would generate this based on the excel_description
        if doc_type == "vat_general_invoice":
            mappings_for_item.append({"target_column": "A", "value": data.get("issue_date", "")})
            mappings_for_item.append({"target_column": "B", "value": data.get("goods_or_taxable_service_name", "")})
            mappings_for_item.append({"target_column": "C", "value": data.get("total_amount_nett_incl_tax", "")})
            mappings_for_item.append({"target_column": "D", "value": "增值税发票"})
        elif doc_type == "jipiao":
            mappings_for_item.append({"target_column": "A", "value": data.get("booking_date", "")})
            mappings_for_item.append({"target_column": "B", "value": f"{data.get('departure_city', '')}-{data.get('arrival_city', '')}"})
            mappings_for_item.append({"target_column": "C", "value": data.get("total_amount", "")})
            mappings_for_item.append({"target_column": "D", "value": "机票"})
        elif doc_type == "train_ticket":
            mappings_for_item.append({"target_column": "A", "value": data.get("departure_datetime", "")})
            mappings_for_item.append({"target_column": "B", "value": f"{data.get('departure_station', '')}-{data.get('arrival_station', '')}"})
            mappings_for_item.append({"target_column": "C", "value": data.get("price", "")})
            mappings_for_item.append({"target_column": "D", "value": "火车票"})
        elif doc_type == "xingchengdan":
            mappings_for_item.append({"target_column": "A", "value": data.get("start_date", "")})
            mappings_for_item.append({"target_column": "B", "value": data.get("city", "")})
            mappings_for_item.append({"target_column": "C", "value": data.get("total_amount", "")})
            mappings_for_item.append({"target_column": "D", "value": "行程单"})
        
        mock_mapping.append({
            "source_index": item_index,
            "target_row": current_row + item_index, # Each item goes to a new row
            "mappings": mappings_for_item
        })
    
    print(f"[AI_SERVICE] 模拟映射指令生成完成: {json.dumps(mock_mapping, ensure_ascii=False, indent=2)}")
    return mock_mapping

# --- Stage 3: Mechanical Filling ---

def fill_excel_template(template_path: str, mapping_instructions: List[Dict]) -> str:
    """
    阶段三：机械填表。
    根据空白 Excel 模板路径和映射指令，使用 openpyxl 库填充 Excel，并返回填充后的 Excel 路径。
    """
    print(f"[AI_SERVICE] 阶段 3: 正在填充Excel模板 '{template_path}'...")

    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Excel 模板文件未找到: {template_path}")

    # 创建一个临时文件来保存填充后的Excel
    temp_dir = os.path.join(os.getcwd(), 'output', 'temp_excel')
    os.makedirs(temp_dir, exist_ok=True)
    filled_excel_path = os.path.join(temp_dir, f"filled_reimbursement_{os.urandom(4).hex()}.xlsx")
    
    # 复制模板到临时路径
    import shutil
    shutil.copy(template_path, filled_excel_path)

    try:
        workbook = openpyxl.load_workbook(filled_excel_path)
        sheet = workbook.active # Get the active sheet

        for instruction_set in mapping_instructions:
            target_row = instruction_set.get("target_row")
            mappings = instruction_set.get("mappings", [])

            if target_row is None:
                print(f"Warning: 映射指令缺少 'target_row'，跳过此项: {instruction_set}")
                continue

            for mapping in mappings:
                target_column = mapping.get("target_column")
                value = mapping.get("value")

                if target_column and value is not None:
                    try:
                        sheet[f"{target_column}{target_row}"] = value
                        print(f"  写入单元格 {target_column}{target_row}: {value}")
                    except Exception as e:
                        print(f"Error writing to cell {target_column}{target_row}: {e}")
                else:
                    print(f"Warning: 无效的映射指令，跳过此项: {mapping}")
        
        workbook.save(filled_excel_path)
        print(f"[AI_SERVICE] Excel 模板填充完成，保存至: {filled_excel_path}")
        return filled_excel_path

    except Exception as e:
        print(f"Error filling Excel template: {e}")
        raise

# --- Orchestration Function for AI-driven Excel Filling ---
def process_receipts_and_fill_excel(receipt_file_paths: List[str], excel_template_path: str) -> Dict:
    """
    AI 驱动的 Excel 填充总控函数。
    它将协调文档分类、数据提取、映射生成和机械填表三个阶段。
    """
    print("[AI_SERVICE] 开始 AI 驱动的 Excel 填充流程...")
    extracted_data_list = []
    original_receipt_paths = []

    for file_path in receipt_file_paths:
        # 阶段一：文档理解 (分类和提取)
        doc_type = classify_document(file_path)
        if doc_type == "reimbursement_excel":
            # 如果是Excel模板本身，则跳过提取，但记录其路径
            print(f"[AI_SERVICE] 识别到 Excel 模板文件: {file_path}，跳过数据提取。")
            # TODO: 可以在这里验证Excel模板的有效性
            # For now, we assume the first excel file is the template, and others are receipts
            # This needs to be refined based on actual business logic
            continue # Skip processing this as a receipt
        
        extracted_data = extract_document_data(file_path, doc_type)
        extracted_data_list.append({
            "document_type": doc_type,
            "file_path": file_path, # Keep original file path for attachment
            "data": extracted_data
        })
        original_receipt_paths.append(file_path)

    # 阶段二：需求理解与映射生成
    # TODO: 这里需要一个真实的 Excel 模板描述，可以从配置文件中读取或作为参数传入
    excel_description = "我的报销Excel有这几列：A列是'日期'，B列是'城市信息'，C列是'费用类型'，D列是'金额'，E列是'备注'。其中，如果是机票，就把出发和到达城市填到'城市信息'里；如果是增值税发票，就把'货物名称'填到'备注'里。"
    mapping_instructions = generate_excel_mapping(extracted_data_list, excel_description)

    # 阶段三：机械填表
    filled_excel_path = fill_excel_template(excel_template_path, mapping_instructions)

    print("[AI_SERVICE] AI 驱动的 Excel 填充流程完成。")
    return {
        "filled_excel_path": filled_excel_path,
        "original_receipt_paths": original_receipt_paths,
        "total_amount": sum(item['data'].get('total_amount', 0) or item['data'].get('total_amount_nett_incl_tax', 0) or item['data'].get('price', 0) for item in extracted_data_list)
    }

# --- Retained for generate_workflow_yaml ---
def generate_workflow_yaml(recorded_steps: List[Dict], existing_yaml: str = None, user_prompt: str = None) -> str:
    """(保留功能) 生成或更新优化的工作流YAML"""
    llm = LLMService()
    try:
        # The prompt for workflow optimization is different from document processing
        steps_json = json.dumps(recorded_steps, ensure_ascii=False, indent=2)
        if user_prompt:
            prompt = f"""
            请扮演一位专家级的RPA工程师。你的核心任务是，根据用户提供的“最终目标”，来分析、重构并优化下面这些原始的、可能充满错误的录制步骤。请确保最终生成的RPA工作流能够最直接、最可靠地达成用户的目标。

            用户的最终目标: "{user_prompt}"

            原始录制步骤 (JSON):
            ```json
            {steps_json}
            ```

            你的工作要求:
            1.  **意图驱动**: 严格围绕用户的“最终目标”来重新组织逻辑。忽略或合并与目标无关的冗余操作（例如，打字错误、不必要的点击）。
            2.  **逻辑重构**: 不要逐字翻译步骤。如果原始步骤是“点击A -> 点击B -> 点击C”，但用户的目标是“下载报告”，你应该生成一个直接的“下载报告”步骤，而不是三个独立的点击。
            3.  **参数优化**: 提取关键参数，并可能的情况下使用变量。例如，将写死的日期转换为动态获取的日期。
            4.  **健壮性**: 为关键步骤（如登录、文件下载）添加明确的错误处理和验证步骤。
            5.  **格式要求**: 最终返回的必须是一个完整的YAML映射（字典），包含`name`, `description`, 和 `steps`三个顶级键。`name`和`description`必须根据用户的目标来生成。

            请现在开始分析和重构，并直接返回优化后的、结构完整的YAML内容，不要包含任何解释性文字。
            """
        else:
            prompt = f"""
            请将以下录制的JSON步骤列表，转换为一个结构化的RPA工作流YAML。

            最终的YAML必须是一个完整的映射（字典），包含以下三个顶级键：
            1. `name`: 一个基于步骤内容生成的、有意义的流程名称。
            2. `description`: 一段简短的流程描述。
            3. `steps`: 一个包含所有转换后步骤的列表。

            请直接返回包含`name`, `description`, `steps`三个顶级键的完整YAML内容，不要包含任何解释性文字。
            
            录制步骤 (JSON):
            ```json
            {steps_json}
            ```
            """
        return llm.generate_yaml_from_prompt(prompt)
    except Exception as e:
        print(f"LLM优化失败: {str(e)}")
        # Fallback to basic generation logic if LLM optimization fails
        if not existing_yaml:
            workflow = {
                'id': 'generated_' + str(hash(str(recorded_steps))),
                'name': '自动生成的工作流',
                'steps': [
                    {
                        'name': f'步骤_{i+1}_{step.get("type", "unknown")}',
                        'action': step.get("type", "unknown"),
                        'params': {'selector': step.get("selector", "")}
                    } 
                    for i, step in enumerate(recorded_steps)
                ]
            }
            return yaml.dump(workflow, allow_unicode=True)
        return existing_yaml # If existing YAML is provided, return it on failure