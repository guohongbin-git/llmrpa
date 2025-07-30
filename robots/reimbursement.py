"""
This is the main robot for the reimbursement process.
"""
from robocorp.tasks import task
from robocorp.workitems import inputs, outputs
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO)

@task
def run_reimbursement_process():
    """
    Main task to run the entire reimbursement process for all pending work items.
    """
    logging.info("Starting reimbursement process...")
    
    try:
        for item in inputs:
            process_single_item(item)
    except Exception as e:
        logging.error(f"An unexpected error occurred in the main process: {e}")

    logging.info("Reimbursement process finished.")

import os
import json

REVIEW_QUEUE_DIR = "review_queue"

def process_single_item(item):
    """
    Processes a single work item (e.g., one reimbursement request).
    """
    try:
        logging.info(f"Processing work item: {item.id}")

        # 1. Data Acquisition Module
        file_path = item.payload.get("file_path")
        if not file_path or not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found at path: {file_path}")
        logging.info(f"Acquired file: {file_path}")

        # 2. Intelligent Recognition & Extraction Module
        extracted_data = extract_document_data(file_path)
        logging.info(f"Extracted data: {extracted_data}")

        # 3. Business System Interaction Module
        reimbursement_id = interact_with_business_system(extracted_data)
        logging.info(f"Successfully created reimbursement with ID: {reimbursement_id}")

        item.done()

    except (ValueError, ConnectionError) as e:
        logging.error(f"Data or AI Service Error for work item {item.id}: {e}")
        item.fail(exception_type="BUSINESS", code="DATA_AI_ERROR", message=str(e))
        save_for_review(item)
    except Exception as e:
        # Catch-all for other exceptions, likely from RPA browser interaction
        logging.error(f"RPA automation error for work item {item.id}: {e}")
        item.fail(exception_type="APPLICATION", code="RPA_AUTOMATION_ERROR", message=str(e))
        save_for_review(item)

def save_for_review(item):
    """
    Saves a failed work item's data to the review queue directory.
    """
    if not os.path.exists(REVIEW_QUEUE_DIR):
        os.makedirs(REVIEW_QUEUE_DIR)
    
    # Create a JSON file with the work item's data
    review_file_path = os.path.join(REVIEW_QUEUE_DIR, f"{item.id}.json")
    with open(review_file_path, 'w') as f:
        review_data = {
            "id": item.id,
            "payload": item.payload,
            "exception": item.exception # The exception is already a dict
        }
        json.dump(review_data, f, indent=4)
    logging.info(f"Saved work item {item.id} for manual review.")


from src.ai_services import extract_document_data

@task
def submit_reviewed_data(invoice_number: str, amount: str, date: str):
    """
    A separate task to submit data that has been manually reviewed and corrected.
    It skips the AI extraction part and directly interacts with the business system.
    """
    logging.info("Starting submission for manually reviewed data...")
    try:
        corrected_data = {
            "invoice_number": invoice_number,
            "amount": amount,
            "date": date
        }
        reimbursement_id = interact_with_business_system(corrected_data)
        logging.info(f"Successfully submitted reviewed claim. Reimbursement ID: {reimbursement_id}")
    except Exception as e:
        logging.error(f"Failed to submit reviewed data: {e}")
        # In a real scenario, you might want to notify the user here
        raise

from robocorp.browser import page

def login_to_system():
    """Logs into the reimbursement system."""
    logging.info("Attempting to log in...")
    page().fill("#username", "user")
    page().fill("#password", "password")
    page().click("button[type=submit]")
    page().wait_for_selector("#invoice_number")
    logging.info("Login successful.")

def fill_reimbursement_form(data: dict):
    """Fills out the reimbursement form with the provided data."""
    logging.info("Filling out reimbursement form...")
    page().fill("#invoice_number", str(data.get("invoice_number", "")))
    page().fill("#amount", str(data.get("amount", "")))
    page().fill("#date", str(data.get("date", "")))
    page().click("button:text('Submit Claim')")
    logging.info("Claim form submitted.")

def verify_submission() -> str:
    """Verifies the submission and returns a confirmation message."""
    page().wait_for_selector(".alert-success")
    success_message = page().locator(".alert-success").text_content()
    logging.info(f"Got confirmation message: {success_message}")
    return success_message

def interact_with_business_system(data: dict) -> str:
    """
    Interacts with the local web reimbursement system to file a claim.
    """
    try:
        url = "http://127.0.0.1:5001/"
        logging.info(f"Opening browser to interact with local reimbursement system at {url}")
        page().goto(url)

        login_to_system()
        fill_reimbursement_form(data)
        verify_submission()

        return str(data.get("invoice_number", ""))

    except Exception as e:
        logging.error(f"An error occurred during browser interaction: {e}")
        # 确保输出目录存在
        os.makedirs("output", exist_ok=True)
        page().screenshot(path="output/error_screenshot.png")
        raise
    finally:
        logging.info("Finished browser interaction.")

