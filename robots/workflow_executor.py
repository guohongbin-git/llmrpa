import yaml
import logging
import os
import sys
from robocorp.tasks import task
from robocorp import browser
from robocorp.workitems import inputs, outputs

# Add the project root to the Python path for module imports
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, project_root)

# 导入新的AI服务函数
from src.ai_services import process_receipts_and_fill_excel

# Configure basic logging
logging.basicConfig(level=logging.INFO)

class WorkflowExecutor:
    def __init__(self, workflow_path):
        self.workflow = self._load_workflow(workflow_path)
        self.vars = {} # For storing variables
        self.current_context = None # Stores the current browser context (page or frame)

    def _load_workflow(self, workflow_path):
        with open(workflow_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)

    def _resolve_variable(self, value):
        if isinstance(value, str) and value.startswith("{{") and value.endswith("}}"):
            var_name = value[2:-2].strip()
            keys = var_name.split('.')
            val = self.vars
            for key in keys:
                if isinstance(val, dict):
                    val = val.get(key)
                elif isinstance(val, list) and key.isdigit(): # Allow list indexing
                    try:
                        val = val[int(key)]
                    except (IndexError, ValueError):
                        return value # Return original template if not found
                else:
                    return value # Cannot resolve further
                if val is None:
                    return value # Return original template if not found
            return val
        return value

    def _execute_steps(self, steps):
        """递归执行步骤列表，用于支持循环等控制结构"""
        for step in steps:
            action = step.get('action') or step.get('type')
            step_name = step.get('name', f"Unnamed Step ({action})")
            output_to = step.get('output_to')

            params = {k: self._resolve_variable(v) for k, v in step.get('params', {}).items()}

            logging.info(f"Executing step '{step_name}' with action '{action}'")

            try:
                result = None
                if action == 'loop':
                    source_list_name = params.get('source_list')
                    loop_variable_name = params.get('loop_variable')
                    loop_steps = step.get('steps') # Loop steps are nested under 'steps' key

                    if not all([source_list_name, loop_variable_name, loop_steps]):
                        raise ValueError("Loop action requires 'source_list', 'loop_variable', and 'steps'.")

                    source_list = self.vars.get(source_list_name, [])
                    for item in source_list:
                        self.vars[loop_variable_name] = item
                        self._execute_steps(loop_steps)

                elif action == 'ai_fill_reimbursement_excel':
                    receipt_files = params.get('receipt_files')
                    excel_template_path = params.get('excel_template_path')

                    if not receipt_files or not excel_template_path:
                        raise ValueError("ai_fill_reimbursement_excel requires 'receipt_files' and 'excel_template_path'.")
                    
                    # Call the AI service to process receipts and fill the Excel
                    reimbursement_package = process_receipts_and_fill_excel(receipt_files, excel_template_path)
                    result = reimbursement_package

                # --- All other browser actions and existing actions --- 
                elif action == 'browser_goto':
                    url = params.get('url')
                    if url:
                        browser.goto(url)
                        self.current_context = browser.page()
                        self.current_context.wait_for_load_state('networkidle')
                    else:
                        raise ValueError("Missing 'url' for browser_goto action.")

                elif action == 'browser_login_human_like':
                    url = params.get('url')
                    username = params.get('username')
                    password = params.get('password')
                    username_selector = params.get('username_selector')
                    password_selector = params.get('password_selector')
                    submit_selector = params.get('submit_selector')

                    if not all([url, username, password, username_selector, password_selector, submit_selector]):
                        raise ValueError("Missing one or more required parameters for browser_login_human_like.")

                    browser.goto(url)
                    page = browser.page()
                    page.wait_for_load_state('networkidle')
                    
                    page.fill(username_selector, username)
                    
                    encryption_script = """
                    (args) => {
                        const { password, pass_selector } = args;
                        try {
                            const seed = window._SecuritySeed;
                            const crypto_obj = window.CryptoJS;

                            if (!seed || !crypto_obj) {
                                return { error: 'CryptoJS or seed not found on page.' };
                            }

                            const encrypted = crypto_obj.DES.encrypt(password, seed);
                            
                            const hidden_pass_id = 'login_password';
                            let hidden_input = document.getElementById(hidden_pass_id);
                            if (!hidden_input) {
                                hidden_input = document.createElement('input');
                                hidden_input.type = 'hidden';
                                hidden_input.id = hidden_pass_id;
                                hidden_input.name = hidden_pass_id;
                                const form = document.querySelector('form');
                                if (form) form.appendChild(hidden_input);
                            }
                            hidden_input.value = encrypted.toString();

                            const visible_pass_field = document.querySelector(pass_selector);
                            if (visible_pass_field) visible_pass_field.value = password;

                            return { encrypted_password: encrypted.toString() };
                        } catch (e) {
                            return { error: `JS execution error: ${e.toString()}` };
                        }
                    }
                    """
                    
                    result = page.evaluate(encryption_script, {
                        'password': password,
                        'pass_selector': password_selector
                    })

                    if result.get('error'):
                        raise Exception(f"Failed to encrypt password on page: {result['error']}")
                    
                    logging.info(f"Successfully encrypted password and set hidden field. Encrypted value starts with: {result.get('encrypted_password', '')[:10]}...")

                    logging.info(f"Attempting to click submit button '{submit_selector}' using JavaScript.")
                    page.evaluate(f"document.querySelector('{submit_selector}').click()")
                    
                    page.wait_for_load_state('networkidle', timeout=30000)
                    logging.info("Login submitted successfully.")

                elif action == 'browser_fill':
                    if selector and value is not None:
                        self.current_context.fill(selector, value)
                    else:
                        raise ValueError(f"Missing 'selector' or 'value' for browser_fill. Got selector='{selector}', value='{value}'")

                elif action == 'browser_click':
                    if selector:
                        opens_new_window = params.get('opens_new_window', False) #or step_copy.get('opens_new_window', False)
                        if opens_new_window:
                            logging.info(f"Expecting new window after clicking {selector}")
                            new_page = None
                            try:
                                with browser.context().expect_event('page', timeout=15000) as new_page_info:
                                    self.current_context.click(selector)
                                
                                new_page = new_page_info.value
                                new_page.wait_for_load_state('load', timeout=60000)
                                
                                self.current_context = new_page
                                logging.info(f"Successfully switched context to new page: {new_page.url}")
                                self._proactively_save_source(f"new_window_from_click_on_{selector[:30]}")

                            except Exception as e:
                                logging.error(f"An error occurred while opening or waiting for the new window: {e}")
                                if new_page and not new_page.is_closed():
                                    logging.info("Attempting to take a screenshot of the partially loaded new window.")
                                    safe_step_name = "".join(c if c.isalnum() or c in (' ', '_') else '_' for c in step_name).replace(' ', '_')
                                    error_screenshot_path = os.path.join(os.getcwd(), 'output', f"error_screenshot_NEW_WINDOW_{safe_step_name}.png")
                                    try:
                                        new_page.screenshot(path=error_screenshot_path)
                                        logging.info(f"Saved error screenshot of NEW window to: {error_screenshot_path}")
                                    except Exception as screenshot_e:
                                        logging.error(f"Failed to take screenshot of the new window: {screenshot_e}")
                                else:
                                    logging.warning("New window was not created before the error. Taking screenshot of the original context.")
                                    self._take_error_screenshot(step_name)
                                raise
                        else:
                            self.current_context.click(selector)
                    else:
                        raise ValueError("Missing 'selector' for browser_click.")
                
                elif action == 'browser_press':
                    if key:
                        self.current_context.press(selector, key)
                    else:
                        raise ValueError("Missing 'selector' or 'key' for browser_press.")

                elif action == 'browser_select_option':
                    if selector and value is not None:
                        self.current_context.select_option(selector, value)
                    else:
                        raise ValueError("Missing 'selector' or 'value' for browser_select_option.")

                elif action == 'browser_switch_to_frame':
                    frame_selector = params.get('selector')
                    if frame_selector == '__main_page__':
                        if hasattr(self.current_context, 'page'):  # Check if we are inside a frame
                            self.current_context = self.current_context.page # Correctly exit to the containing page
                        logging.info("Switched context back to the page level.")
                    elif frame_selector:
                        logging.info(f"Attempting to switch to frame: {frame_selector}")
                        # Log all available iframes in the current context
                        if hasattr(self.current_context, 'frames'):
                            logging.info(f"Current context has {len(self.current_context.frames)} frames.")
                            for i, frame in enumerate(self.current_context.frames):
                                logging.info(f'  Frame {i}: name="{frame.name}", url="{frame.url}"')
                        elif hasattr(self.current_context, 'page'): # If current_context is a Frame, get its page's frames
                            logging.info(f"Current context (Frame) has page with {len(self.current_context.page.frames)} frames.")
                            for i, frame in enumerate(self.current_context.page.frames):
                                logging.info(f'  Frame {i}: name="{frame.name}", url="{frame.url}"')
                        else:
                            logging.info("Current context does not have 'frames' attribute.")
                        frame_element = self.current_context.wait_for_selector(frame_selector, timeout=30000, state='attached')
                        self.current_context = frame_element.content_frame()
                        self.current_context.wait_for_load_state('load', timeout=30000)
                        logging.info(f"Switched context to iframe: {frame_selector}")
                        self._proactively_save_source(f"iframe_switch_{frame_selector}")
                    else:
                        raise ValueError("Missing 'selector' for browser_switch_to_frame.")
                
                elif action == 'extract_data': # This action is now deprecated in favor of ai_fill_reimbursement_excel
                    raise NotImplementedError("'extract_data' is deprecated. Use 'ai_fill_reimbursement_excel' instead.")

                elif action == 'browser_wait_for_selector':
                    timeout = params.get('timeout')
                    state = params.get('state')
                    self.current_context.wait_for_selector(selector, timeout=timeout if timeout is not None else 30000, state=state if state is not None else 'visible')
                elif action == 'browser_mouse_move':
                    x = params.get('x')
                    y = params.get('y')
                    if x is not None and y is not None:
                        self.current_context.mouse.move(int(x), int(y))
                        logging.info(f"Moved mouse to ({x}, {y})")
                    else:
                        raise ValueError("Missing 'x' or 'y' for browser_mouse_move.")
                elif action == 'browser_get_source':
                    output_file = params.get('output_file')
                    source_dir = os.path.join(os.getcwd(), 'output', 'sources')
                    os.makedirs(source_dir, exist_ok=True)
                    import time
                    timestamp = int(time.time())
                    # insert timestamp before the extension
                    base, ext = os.path.splitext(output_file)
                    filename = f"{base}_{timestamp}{ext}"
                    final_path = os.path.join(source_dir, filename)

                    source_code = self.current_context.content())
                    with open(final_path, 'w', encoding='utf-8') as f:
                        f.write(source_code)
                    logging.info(f"Saved source code to: {final_path}")
                    result = source_code

                elif action == 'browser_screenshot':
                    import time
                    output_file = params.get('output_file')
                    screenshot_dir = os.path.join(os.getcwd(), 'output', 'screenshots')
                    os.makedirs(screenshot_dir, exist_ok=True)
                    timestamp = int(time.time())
                    base, ext = os.path.splitext(output_file)
                    filename = f"{base}_{timestamp}{ext}"
                    final_path = os.path.join(screenshot_dir, filename)
                    
                    target_page = None
                    if hasattr(self.current_context, 'page'): # Frame context
                        target_page = self.current_context.page
                    else: # Assume Page context
                        target_page = self.current_context

                    if target_page and not target_page.is_closed():
                        target_page.screenshot(path=final_path)
                        logging.info(f"Saved screenshot to: {final_path}")
                        result = final_path
                    else:
                        raise Exception(f"Could not take screenshot, target page for context is invalid or closed.")
                elif action == 'browser_wait_for_url':
                    url_pattern = params.get('url_pattern')
                    timeout = params.get('timeout')
                    self.current_context.wait_for_url(url_pattern, timeout=timeout if timeout is not None else 30000)
                elif action == 'browser_wait_for_load_state':
                    state = params.get('state')
                    timeout = params.get('timeout')
                    self.current_context.wait_for_load_state(state if state is not None else 'domcontentloaded', timeout=timeout if timeout is not None else 30000)
                elif action == 'browser_evaluate':
                    expression = params.get('expression')
                    result = self.current_context.evaluate(expression)
                elif action == 'browser_js_click':
                    if selector:
                        script = f"document.querySelector('{selector}').click();"
                        self.current_context.evaluate(script)
                        logging.info(f"Clicked {selector} using JavaScript.")
                elif action == 'browser_wait_for_response':
                    url_pattern = params.get('url_pattern')
                    timeout = params.get('timeout')
                    output_file = params.get('output_file')
                    response_data = None
                    def match_url_pattern(url, pattern):
                        import re
                        pattern_regex = pattern.replace('**', '.*')
                        try:
                            return bool(re.match(pattern_regex, url))
                        except Exception as e:
                            logging.warning(f"URL pattern matching error: {e}")
                            return False
                    def handle_response(response):
                        nonlocal response_data
                        if match_url_pattern(response.url, url_pattern):
                            try:
                                response_data = response.json()
                            except Exception:
                                response_data = response.text()
                    browser.page().on('response', handle_response)
                    try:
                        self.current_context.wait_for_event('response', predicate=lambda r: match_url_pattern(r.url, url_pattern), timeout=timeout if timeout is not None else 30000)
                    except Exception as e:
                        logging.warning(f"Wait for response timed out or failed: {e}")
                    browser.page().remove_listener('response', handle_response)
                    if response_data is not None:
                        with open(output_file, 'w', encoding='utf-8') as f:
                            if isinstance(response_data, dict):
                                import json
                                json.dump(response_data, f, ensure_ascii=False, indent=2)
                            else:
                                f.write(str(response_data))
                        result = response_data
                    else:
                        logging.warning(f"No response captured for URL pattern: {url_pattern}")
                elif action == 'browser_upload_file':
                    file_path = params.get('file_path')
                    click_selector = params.get('selector') # The selector to click to trigger the file chooser

                    if not file_path or not click_selector:
                        raise ValueError("Missing 'file_path' or 'selector' for browser_upload_file.")

                    # The context for the operation should be the current frame/page
                    operation_context = self.current_context

                    absolute_file_path = os.path.abspath(file_path)
                    if not os.path.exists(absolute_file_path):
                        raise FileNotFoundError(f"The file specified for upload does not exist: {absolute_file_path}")

                    is_input_file = operation_context.eval_on_selector(click_selector, "el => el.tagName === 'INPUT' && el.type === 'file'")

                    if is_input_file:
                        logging.info(f"Selector '{click_selector}' is a file input. Setting files directly.")
                        operation_context.set_input_files(click_selector, absolute_file_path)
                    else:
                        logging.info(f"Expecting a file chooser to open after clicking '{click_selector}'.")
                        with operation_context.expect_file_chooser(timeout=15000) as fc_info:
                            operation_context.click(click_selector)
                        file_chooser = fc_info.value
                        logging.info(f"File chooser opened. Setting file to: {absolute_file_path}")
                        file_chooser.set_files(absolute_file_path)
                    logging.info(f"Successfully handled file chooser and set file to: {absolute_file_path}")
                else:
                    logging.warning(f"Unknown or unhandled action: '{action}'")

                if output_to:
                    self.vars[output_to] = result
                    logging.info(f"Stored result in variable: {output_to}")

            except Exception as e:
                if not (action == 'browser_click' and (params.get('opens_new_window', False) or step.get('opens_new_window', False))):
                    logging.error(f"Error in step '{step_name}' (Action: {action}): {e}")
                    self._take_error_screenshot(step_name)
                
                inputs.current.fail(exception_type="APPLICATION", code="STEP_ERROR", message=str(e))
                raise

    def execute(self, initial_input=None):
        logging.info(f"Starting workflow: {self.workflow.get('name', 'Unnamed Workflow')}")
        self.vars['input'] = initial_input if initial_input is not None else {}

        if not browser.page():
            browser.goto("about:blank")
        self.current_context = browser.page()

        self._execute_steps(self.workflow.get('steps', []))

        logging.info(f"Workflow '{self.workflow.get('name')}' completed successfully.")
        if hasattr(outputs, 'current') and outputs.current:
            outputs.current.payload['final_variables'] = self.vars
            logging.info("Saved final variables to output work item.")
        else:
            logging.info("No output work item available, skipping saving of final variables.")

    def _take_error_screenshot(self, step_name: str):
        """Takes a screenshot on error, saving it to a dedicated folder with a timestamp."""
        try:
            import time
            screenshot_dir = os.path.join(os.getcwd(), 'output', 'screenshots')
            os.makedirs(screenshot_dir, exist_ok=True)
            
            safe_step_name = "".join(c if c.isalnum() or c in (' ', '_') else '_' for c in step_name).replace(' ', '_')
            timestamp = int(time.time())
            filename = f"error_{safe_step_name}_{timestamp}.png"
            error_screenshot_path = os.path.join(screenshot_dir, filename)

            target_page = None
            if hasattr(self.current_context, 'page'):  # Frame context
                target_page = self.current_context.page
            else:  # Assume Page context
                target_page = self.current_context

            if target_page and not target_page.is_closed():
                target_page.screenshot(path=error_screenshot_path)
                logging.info(f"Saved error screenshot to: {error_screenshot_path}")
            else:
                logging.warning("Could not take screenshot, target page is invalid or closed.")
        except Exception as e:
            logging.error(f"An unexpected error occurred while taking a screenshot: {e}")

    def _proactively_save_source(self, event_name: str):
        """Saves the HTML source of the current context to a dedicated folder with a timestamp."""
        try:
            import time
            source_dir = os.path.join(os.getcwd(), 'output', 'sources')
            os.makedirs(source_dir, exist_ok=True)

            safe_event_name = "".join(c if c.isalnum() or c in (' ', '_') else '_' for c in event_name).replace(' ', '_')
            timestamp = int(time.time())
            filename = f"source_after_{safe_event_name}_{timestamp}.html"
            source_file_path = os.path.join(source_dir, filename)

            if self.current_context:
                with open(source_file_path, 'w', encoding='utf-8') as f:
                    f.write(self.current_context.content())
                logging.info(f"Proactively saved source code to: {source_file_path}")
        except Exception as e:
            logging.warning(f"Could not proactively save source code for event '{event_name}': {e}")

@task
def run_workflow():
    work_item = inputs.current
    if not work_item.payload:
        work_item.fail(exception_type="BUSINESS", code="INVALID_INPUT", message="Payload is empty.")
        return
    workflow_file = work_item.payload.get('workflow_file')

    if not workflow_file:
        work_item.fail(exception_type="BUSINESS", code="INVALID_INPUT", message="No workflow_file specified.")
        return

    executor = WorkflowExecutor(workflow_file)
    executor.execute(initial_input=work_item.payload)