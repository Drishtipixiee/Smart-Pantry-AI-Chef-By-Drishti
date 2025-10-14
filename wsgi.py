import os
import sys

# Add your project directory to the Python path
# This is necessary so the import below can find your app.py file
project_path = os.path.dirname(os.path.abspath(__file__))
if project_path not in sys.path:
    sys.path.append(project_path)

from app import app as application