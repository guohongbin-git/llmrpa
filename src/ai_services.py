"""
This module provides an abstraction layer for interacting with various AI services (OCR, LLM).
It implements the dual OCR check strategy and leverages multi-modal LLM capabilities for validation.
"""
import yaml
import requests
import logging
import base64
import json
from typing import Dict, Any
from io import BytesIO

from robocorp.vault import get_secret
import pytesseract
from PIL import Image
from pdf2image import convert_from_path

# Configure basic logging
logging.basicConfig(level=logging.INFO)

CONFIG_PATH = "config/config.yaml"

def load_config() -> Dict[str, Any]:
    """Loads the AI service configuration from the YAML file."""
    try:
        with open(CONFIG_PATH, 'r') as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        logging.error(f"Configuration file not found at: {CONFIG_PATH}")
        return {}

CONFIG = load_config()

def get_ocr_result(image: Image.Image, provider: str) -> str:
    """
    Gets the OCR result from a specified provider using a PIL Image object.

    Args:
        image: A PIL Image object to be processed.
        provider: The key of the OCR provider (e.g., 'ocr_provider_1').

    Returns:
        The recognized text as a single string.
    """
    logging.info(f"Calling OCR provider: {provider}")

    if provider == "ocr_provider_1": # Use local Tesseract
        try:
            text = pytesseract.image_to_string(image, lang='chi_sim+eng')
            logging.info(f"Tesseract OCR result captured.")
            return text
        except Exception as e:
            logging.error(f"An error occurred during Tesseract OCR: {e}")
            return ""
    elif provider == "ocr_provider_2": # Keep this as a mock for the dual-check
        logging.warning("Using mock OCR for provider 2.")
        return "发票代码: 25312000000003736410, 金额: 337.60, 日期: 2025-01-03, 校验码: 01234567890123456789"
    else:
        raise ValueError(f"Unknown OCR provider: {provider}")

def get_llm_extraction_multimodal(ocr_text_1: str, ocr_text_2: str, image: Image.Image) -> Dict[str, Any]:
    """
    Uses a multi-modal LLM to extract structured data, using the image as the ground truth.

    Args:
        ocr_text_1: Text from the first OCR provider.
        ocr_text_2: Text from the second OCR provider.
        image: The source PIL Image object for verification.

    Returns:
        A dictionary with the extracted, validated, and structured data.
    """
    llm_config = CONFIG.get("ai_services", {}).get("llm_provider")
    if not llm_config:
        raise ValueError("Configuration for LLM provider not found.")

    secrets = get_secret("AIServiceCredentials")
    api_key = secrets["llm_api_key"]

    logging.info(f"Calling Multi-modal LLM at {llm_config['url']} for data extraction and validation.")

    # Convert image to base64
    buffered = BytesIO()
    image.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode('utf-8')

    prompt = f"""
    You are an expert financial auditor. You will be given an image of an invoice and two potentially imperfect OCR text results from that image. Your task is to act as the final authority.

    1.  Analyze the invoice IMAGE as the single source of truth.
    2.  Use the two OCR results as helpful, but potentially flawed, hints.
    3.  Extract the key information from the IMAGE and structure it as a clean JSON object.

    OCR Result 1:
    --- START ---
    {ocr_text_1}
    --- END ---

    OCR Result 2:
    --- START ---
    {ocr_text_2}
    --- END ---

    Based on the IMAGE, please extract the following fields: 'invoice_number', 'amount', 'date'. Ensure the date is in 'YYYY-MM-DD' format and the amount is a number. Respond with only the JSON object.
    """

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}"
    }
    payload = {
        "model": "google/gemma-3-27b",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{img_base64}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.1
    }

    try:
        response = requests.post(llm_config['url'], headers=headers, json=payload)
        response.raise_for_status()
        content_string = response.json()['choices'][0]['message']['content']
        
        if '```json' in content_string:
            json_start = content_string.find('{')
            json_end = content_string.rfind('}') + 1
            content_string = content_string[json_start:json_end]
        
        extracted_data = json.loads(content_string)

        # Validate that all required keys are present
        required_keys = ['invoice_number', 'amount', 'date']
        for key in required_keys:
            if key not in extracted_data:
                raise ValueError(f"LLM response is missing required key: '{key}'")

        return extracted_data

    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to connect to LLM service at {llm_config['url']}: {e}")
        raise
    except (json.JSONDecodeError, ValueError) as e:
        logging.error(f"Failed to parse or validate JSON response from LLM: {e}")
        logging.error(f"Raw LLM response: {content_string}")
        raise

def extract_document_data(file_path: str) -> Dict[str, Any]:
    """
    Main function to orchestrate the document extraction process.
    It converts PDF/Image to a standard format, then uses a dual OCR + multi-modal LLM strategy.
    """
    logging.info(f"Starting multi-modal data extraction for {file_path}")

    try:
        if file_path.lower().endswith('.pdf'):
            # Convert PDF to a list of images, we only use the first page for invoices
            images = convert_from_path(file_path)
            if not images:
                raise ValueError("PDF file is empty or could not be converted.")
            source_image = images[0]
        else:
            source_image = Image.open(file_path)
    except Exception as e:
        logging.error(f"Failed to open or convert file {file_path}: {e}")
        raise

    # 1. Get results from two different OCR providers using the same source image
    ocr_result_1 = get_ocr_result(source_image, 'ocr_provider_1')
    ocr_result_2 = get_ocr_result(source_image, 'ocr_provider_2')

    if not ocr_result_1 and not ocr_result_2:
        raise ConnectionError("Both OCR services failed to process the document.")

    # 2. Use Multi-modal LLM to extract and validate the data using the image as ground truth
    extracted_data = get_llm_extraction_multimodal(ocr_result_1, ocr_result_2, source_image)

    logging.info(f"Successfully extracted data using multi-modal validation: {extracted_data}")
    return extracted_data