from flask import Flask, render_template, request, redirect, url_for, flash, send_from_directory
import os
import json

app = Flask(__name__)
app.secret_key = 'supersecretkey' # Needed for flashing messages

# Path to the Robocorp output and devdata directories
PROJECT_ROOT = os.path.dirname(__file__)
REVIEW_QUEUE_DIR = os.path.join(PROJECT_ROOT, '..', 'review_queue')
DEVDATA_DIR = os.path.join(PROJECT_ROOT, '..', 'devdata')

# In-memory user database for simplicity
users = {
    "user": "password"
}

@app.route("/")
def index():
    return redirect(url_for('login'))

@app.route("/login", methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if users.get(username) == password:
            flash("Login successful!", "success")
            return redirect(url_for('review_list')) # Redirect to review list after login
        else:
            flash("Invalid credentials, please try again.", "danger")
    return render_template('login.html')

@app.route("/form")
def reimbursement_form():
    return render_template('form.html')

@app.route("/submit", methods=['POST'])
def submit_form():
    invoice_number = request.form['invoice_number']
    amount = request.form['amount']
    date = request.form['date']
    # In a real app, you would save this data to a database
    print(f"Received reimbursement claim: Invoice={invoice_number}, Amount={amount}, Date={date}")
    flash(f"Successfully submitted claim for invoice {invoice_number}.", "success")
    return redirect(url_for('reimbursement_form'))

@app.route("/review")
def review_list():
    """Displays a list of work items that failed and need review."""
    failed_items = []
    if os.path.exists(REVIEW_QUEUE_DIR):
        for item_file in os.listdir(REVIEW_QUEUE_DIR):
            if item_file.endswith('.json'):
                with open(os.path.join(REVIEW_QUEUE_DIR, item_file), 'r') as f:
                    data = json.load(f)
                    input_file = data.get('payload', {}).get('file_path', 'N/A')
                    failed_items.append({
                        'id': data.get('id'),
                        'input_file': os.path.basename(input_file),
                        'error_type': data.get('exception', {}).get('code', 'N/A'),
                        'error_message': data.get('exception', {}).get('message', 'N/A')
                    })
    return render_template('review_list.html', items=failed_items)

@app.route("/review/<item_id>")
def review_item(item_id):
    """Displays the details of a single failed item for review."""
    item_data = {}
    item_file_path = os.path.join(REVIEW_QUEUE_DIR, f"{item_id}.json")
    if os.path.exists(item_file_path):
        with open(item_file_path, 'r') as f:
            item_data = json.load(f)
    
    # We need the original file path to display the image
    original_file_path = item_data.get('payload', {}).get('file_path', '')
    
    # For simplicity, we assume the file is in the devdata directory
    # and we serve it from there.
    image_url = url_for('serve_dev_file', filename=os.path.basename(original_file_path))

    return render_template("review_item.html", item=item_data, image_url=image_url)

@app.route("/devdata/<path:filename>")
def serve_dev_file(filename):
    """Serves files from the devdata directory."""
    return send_from_directory(DEVDATA_DIR, filename)

if __name__ == "__main__":
    app.run(debug=True, port=5001)
