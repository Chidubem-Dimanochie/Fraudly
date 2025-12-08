from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from connect import db
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Optional

app = FastAPI()

cognito_client = boto3.client('cognito-idp', region_name='us-east-1')
USER_POOL_ID = 'us-east-1_HgEmPHJj8'

origins = [
    "http://localhost:3000",
    "http://10.88.7.176:3000",
    "https://main.d3sba06ap3p2l2.amplifyapp.com",
    'https://fraudly-git-main-chidubem-dimanochies-projects.vercel.app',
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class User(BaseModel):
    username: str
    email: str
    role: Optional[str] = "Customer"
    balance: float = 0.0
    cardFrozen: bool = False
    alertThreshold: Optional[float] = None
    isBanned: bool = False

users_collection = db.get_collection("users")
logs_collection = db.get_collection("logs")

def check_aws_credentials():
    try:
        session = boto3.Session()
        creds = session.get_credentials()
        return creds is not None
    except Exception:
        return False

def get_cognito_username_by_email(email: str) -> Optional[str]:
    """Find Cognito username for a given email."""
    try:
        resp = cognito_client.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )
        users = resp.get("Users", [])
        if users:
            return users[0]["Username"]
        return None
    except (NoCredentialsError, ClientError):
        return None

def cognito_find_user_by_email(email: str) -> bool:
    """Check if user exists in Cognito by email."""
    try:
        resp = cognito_client.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )
        return len(resp.get("Users", [])) > 0
    except (NoCredentialsError, ClientError):
        raise

# GET all users
@app.get("/api/users")
async def get_users():
    users = list(users_collection.find({}, {"_id": 0}))
    return users

# POST new user (create local MongoDB user)
@app.post("/api/users")
async def create_user(user: User):
    # 1) Check MongoDB for duplicates
    existing_email = users_collection.find_one({"email": user.email})
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered locally.")

    existing_username = users_collection.find_one({"username": user.username})
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken.")

    # 2) Check Cognito for email conflict
    try:
        if check_aws_credentials():
            if cognito_find_user_by_email(user.email):
                raise HTTPException(
                    status_code=400,
                    detail="This email is already registered with Cognito. Please sign in using Cognito."
                )
    except NoCredentialsError:
        print("WARNING: AWS credentials not configured. Skipping Cognito check.")
    except ClientError as e:
        print("Cognito lookup failed:", str(e))
        raise HTTPException(status_code=500, detail="Error checking Cognito.")

    # 3) Insert into MongoDB
    users_collection.insert_one(user.dict())
    return user

# GET user by email
@app.get("/api/users/email/{email}")
async def get_user_by_email(email: str):
    user = users_collection.find_one({"email": email}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# GET user by username
@app.get("/api/users/username/{username}")
async def get_user_by_username(username: str):
    user = users_collection.find_one({"username": username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# PUT /api/users/email/{email} to update a user by email
@app.put("/api/users/email/{email}")
async def update_user_by_email(email: str, updated_data: dict):
    # Check for email conflicts if changing email
    if "email" in updated_data and updated_data["email"] != email:
        conflict = users_collection.find_one({"email": updated_data["email"]})
        if conflict:
            raise HTTPException(status_code=400, detail="Email already in use.")

    # Check for username conflicts if changing username
    if "username" in updated_data:
        conflict = users_collection.find_one({
            "username": updated_data["username"],
            "email": {"$ne": email}
        })
        if conflict:
            raise HTTPException(status_code=400, detail="Username already taken.")

    result = users_collection.update_one({"email": email}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    # Handle Cognito role sync if credentials available
    if "role" in updated_data:
        try:
            if check_aws_credentials():
                cognito_username = get_cognito_username_by_email(email)
                if cognito_username:
                    # Remove from all groups
                    try:
                        groups_resp = cognito_client.admin_list_groups_for_user(
                            Username=cognito_username,
                            UserPoolId=USER_POOL_ID
                        )
                        for group in groups_resp.get("Groups", []):
                            cognito_client.admin_remove_user_from_group(
                                UserPoolId=USER_POOL_ID,
                                Username=cognito_username,
                                GroupName=group["GroupName"]
                            )
                    except ClientError:
                        pass

                    # Add to new group
                    try:
                        cognito_client.admin_add_user_to_group(
                            UserPoolId=USER_POOL_ID,
                            Username=cognito_username,
                            GroupName=updated_data["role"]
                        )
                    except ClientError as e:
                        print(f"Failed to add user to group: {e}")
        except Exception as e:
            print(f"Cognito sync error: {e}")

    # Handle ban status
    if "isBanned" in updated_data:
        try:
            if check_aws_credentials():
                cognito_username = get_cognito_username_by_email(email)
                if cognito_username:
                    if updated_data["isBanned"]:
                        cognito_client.admin_disable_user(
                            UserPoolId=USER_POOL_ID,
                            Username=cognito_username
                        )
                    else:
                        cognito_client.admin_enable_user(
                            UserPoolId=USER_POOL_ID,
                            Username=cognito_username
                        )
        except Exception as e:
            print(f"Cognito status update error: {e}")

    user = users_collection.find_one({"email": updated_data.get("email", email)}, {"_id": 0})
    return user

# Transactions endpoints
@app.get("/api/transactions")
async def get_transactions():
    transactions_collection = db.get_collection("transactions")
    transactions = list(transactions_collection.find({}, {"_id": 0}))
    return transactions

@app.post("/api/transactions")
async def create_transaction(transaction: dict):
    transactions_collection = db.get_collection("transactions")
    transactions_collection.insert_one(transaction)
    return transaction

@app.put("/api/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, updated_data: dict):
    transactions_collection = db.get_collection("transactions")
    result = transactions_collection.update_one({"id": transaction_id}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Transaction not found")
    transaction = transactions_collection.find_one({"id": transaction_id}, {"_id": 0})
    return transaction

# Rules endpoints
@app.get("/api/rules")
async def get_rules():
    rules_collection = db.get_collection("rules")
    rules = list(rules_collection.find({}, {"_id": 0}))
    return rules

@app.post("/api/rules")
async def create_rule(rule: dict):
    rules_collection = db.get_collection("rules")
    rules_collection.insert_one(rule)
    return rule

@app.delete("/api/rules/{rule_id}")
async def delete_rule(rule_id: str):
    rules_collection = db.get_collection("rules")
    result = rules_collection.delete_one({"id": rule_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"message": "Rule deleted successfully"}

# Logs endpoints
@app.get("/api/logs")
async def get_logs():
    logs = list(logs_collection.find({}, {"_id": 0}))
    return logs

@app.post("/api/logs")
async def create_log(log: dict):
    logs_collection.insert_one(log)
    return log

@app.on_event("startup")
async def startup_event():
    print("=" * 50)
    print("FastAPI Server Started")
    print("=" * 50)
    if check_aws_credentials():
        print("✓ AWS credentials configured")
    else:
        print("⚠ WARNING: AWS credentials NOT configured!")
    print("=" * 50)