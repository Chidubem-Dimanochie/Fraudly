# connect.py
import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv(dotenv_path="config.env")# loads .env

# Get the MongoDB URI
ATLAS_URI = os.getenv("ATLAS_URI")

if not ATLAS_URI:
    raise ValueError("No ATLAS_URI found. Check your .env file!")

# Connect to MongoDB Atlas
client = MongoClient(ATLAS_URI)

# Select the database
# If you want a specific database, you can specify like this:
db = client.get_database("TestRun")  # matches your Atlas DB name

# Test the connection
try:
    print("Collections in DB:", db.list_collection_names())
    print("Connected to MongoDB Atlas successfully!")
except Exception as e:
    print("MongoDB connection error:", e)