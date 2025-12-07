from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from connect import db

app = FastAPI()

# CORS setup
origins = [
    "http://localhost:3000",
    "http://10.88.7.176:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic model for a User
class User(BaseModel):
    email: str
    role: str
    balance: float
    cardFrozen: bool = False
    alertThreshold: float | None = None
    isBanned: bool = False

users_collection = db.get_collection("users")

# GET all users
@app.get("/api/users")
async def get_users():
    users = list(users_collection.find({}, {"_id": 0}))
    return users

# POST new user
@app.post("/api/users")
async def create_user(user: User):
    existing = users_collection.find_one({"email": user.email})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    users_collection.insert_one(user.dict())
    return user

# PUT /api/users/{email} to update a user
@app.put("/api/users/{email}")
async def update_user(email: str, updated_data: dict):
    result = users_collection.update_one({"email": email}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    user = users_collection.find_one({"email": email}, {"_id": 0})
    return user
