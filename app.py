import os
import requests
import google.generativeai as genai
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta

# --- Basic Setup & API Key Configuration ---
app = Flask(__name__)
CORS(app)

# Use Environment Variables for security
api_key = os.environ.get("GEMINI_API_KEY", "YOUR_API_KEY_HERE")
genai.configure(api_key=api_key) 
model = genai.GenerativeModel('gemini-1.5-flash')

basedir = os.path.abspath(os.path.dirname(__file__))

# --- Database Configuration ---
if os.environ.get('VERCEL'):
    # Vercel's file system is read-only except for /tmp
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////tmp/pantry.db'
else:
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'pantry.db')

app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# --- Initialize Database ---
# This line fixes the "db is not defined" error
db = SQLAlchemy(app)

# --- Database Model Definition ---
class Item(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, nullable=False, default=1)
    expiry_date = db.Column(db.Date, nullable=False)

    def to_dict(self):
        status = calculate_expiry_status(self.expiry_date.strftime('%Y-%m-%d'))
        return {
            'id': self.id,
            'name': self.name,
            'quantity': self.quantity,
            'expiry_date': self.expiry_date.strftime('%Y-%m-%d'),
            'expiry_status': status
        }

# --- Helper Functions ---
def calculate_expiry_status(expiry_date_str):
    today = datetime.now().date()
    expiry_date = datetime.strptime(expiry_date_str, '%Y-%m-%d').date()
    days_left = (expiry_date - today).days
    if days_left < 0: return "EXPIRED"
    elif days_left <= 3: return "NEAR_EXPIRY"
    else: return "OK"

# --- ROUTE TO SERVE THE FRONTEND ---
@app.route('/')
def home():
    return render_template('index.html')

# --- API ENDPOINTS ---
@app.route('/items', methods=['POST'])
def add_item():
    data = request.get_json()
    if not data or 'name' not in data or 'expiry_date' not in data:
        return jsonify({'error': 'Item name and expiry date are required'}), 400
    try:
        quantity = int(data.get('quantity', 1))
        if quantity <= 0: return jsonify({'error': 'Quantity must be a positive number'}), 400
        expiry = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid data format'}), 400
    
    new_item = Item(name=data['name'].strip().capitalize(), quantity=quantity, expiry_date=expiry)
    db.session.add(new_item)
    db.session.commit()
    return jsonify({'message': 'Item added successfully', 'item': new_item.to_dict()}), 201

@app.route('/items', methods=['GET'])
def get_all_items():
    all_items = Item.query.all()
    return jsonify([item.to_dict() for item in all_items]), 200

@app.route('/items/<int:item_id>', methods=['PUT'])
def update_item(item_id):
    item = Item.query.get_or_404(item_id)
    data = request.get_json()
    item.name = data.get('name', item.name).strip().capitalize()
    try:
        if 'expiry_date' in data:
            item.expiry_date = datetime.strptime(data['expiry_date'], '%Y-%m-%d').date()
        if 'quantity' in data:
            quantity = int(data.get('quantity'))
            if quantity <= 0: return jsonify({'error': 'Quantity must be a positive number'}), 400
            item.quantity = quantity
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid data format'}), 400
    db.session.commit()
    return jsonify({'message': 'Item updated successfully', 'item': item.to_dict()}), 200

@app.route('/items/<int:item_id>', methods=['DELETE'])
def delete_item(item_id):
    item = Item.query.get_or_404(item_id)
    db.session.delete(item)
    db.session.commit()
    return jsonify({'message': 'Item deleted successfully'}), 200

@app.route('/chef/suggest', methods=['POST'])
def get_chef_suggestions():
    data = request.get_json()
    if not data or 'ingredients' not in data:
        return jsonify({'error': 'Ingredients list is required'}), 400
    ingredients = data['ingredients']
    if not ingredients:
        return jsonify({'recipe': 'Please select at least one ingredient.'})
    
    prompt = f"Give me a simple recipe name and instructions using only these ingredients: {', '.join(ingredients)}. Format the response as: Recipe Name: [Name] \n\n Instructions: [Instructions]"
    try:
        response = model.generate_content(prompt)
        formatted_recipe = response.text.replace('\n', '<br>')
        return jsonify({'recipe': formatted_recipe})
    except Exception as e:
        return jsonify({'error': f'Error generating recipe: {str(e)}'}), 500

@app.route('/lookup_barcode', methods=['POST'])
def lookup_barcode():
    data = request.get_json()
    if not data or 'barcode' not in data:
        return jsonify({'error': 'Barcode not provided'}), 400
    barcode = data['barcode']
    api_url = f'https://world.openfoodfacts.org/api/v0/product/{barcode}.json'
    try:
        response = requests.get(api_url)
        response.raise_for_status()
        product_data = response.json()
        if product_data.get('status') == 1:
            product_name = product_data['product'].get('product_name', 'Unknown Product')
            suggested_expiry = (datetime.now().date() + timedelta(days=7)).strftime('%Y-%m-%d')
            return jsonify({'name': product_name, 'expiry_date': suggested_expiry})
        else:
            return jsonify({'error': 'Product not found'}), 404
    except requests.exceptions.RequestException as e:
        return jsonify({'error': f'API request failed: {e}'}), 500

# Required for Vercel deployment
app = app

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)