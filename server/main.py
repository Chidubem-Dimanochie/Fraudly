from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from connect import db
import boto3
from botocore.exceptions import ClientError, NoCredentialsError
import os
from typing import Optional

app = FastAPI()

# Initialize Cognito client (boto3 will use environment / ~/.aws credentials)
cognito_client = boto3.client('cognito-idp', region_name='us-east-1')
USER_POOL_ID = 'us-east-1_HgEmPHJj8'

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

# Pydantic models
class User(BaseModel):
    username: str
    email: str
    role: Optional[str] = "Customer"
    balance: float = 0.0
    cardFrozen: bool = False
    alertThreshold: Optional[float] = None
    isBanned: bool = False

class AuditLog(BaseModel):
    id: str
    timestamp: str
    actor: str
    action: str
    details: str

users_collection = db.get_collection("users")
logs_collection = db.get_collection("logs")

# Helper function to check if AWS credentials are configured
def check_aws_credentials():
    """Return True if boto3 can find credentials."""
    try:
        session = boto3.Session()
        creds = session.get_credentials()
        return creds is not None
    except Exception:
        return False

# Helper: check if a Cognito user exists for a given username/email
def cognito_user_exists(username_or_email: str) -> bool:
    """
    Returns True if a Cognito user exists with Username = username_or_email.
    Note: If your Cognito usernames are NOT the email value, you may need to use
    a different lookup (e.g. list users by filter on email attribute).
    """
    try:
        # admin_get_user expects the Cognito Username. If you used email as username,
        # this will work. Otherwise consider AdminListUsers with a filter on email.
        cognito_client.admin_get_user(
            UserPoolId=USER_POOL_ID,
            Username=username_or_email
        )
        return True
    except NoCredentialsError:
        # No credentials available locally — caller will decide policy
        raise
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("UserNotFoundException", "ResourceNotFoundException"):
            return False
        # Re-raise for unexpected errors
        raise

# Alternative: search Cognito users by email attribute (safer if Username != email)
def cognito_find_user_by_email(email: str) -> bool:
    """
    Uses ListUsers with a filter on email attribute to detect existence.
    Returns True if at least one user matches.
    """
    try:
        resp = cognito_client.list_users(
            UserPoolId=USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )
        return len(resp.get("Users", [])) > 0
    except NoCredentialsError:
        raise
    except ClientError:
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

    # 2) If AWS creds present, check Cognito for a user with same email
    try:
        if check_aws_credentials():
            # Use filter-by-email because Cognito username might be different than email
            if cognito_find_user_by_email(user.email):
                # If a user exists in Cognito for this email, block local account creation.
                raise HTTPException(
                    status_code=400,
                    detail="This email is already registered with Cognito. Please sign in using Cognito (Hosted UI or Cognito login)."
                )
    except NoCredentialsError:
        # Credentials missing: we will allow creation but warn in logs
        print("WARNING: AWS credentials not configured. Skipping Cognito existence check.")
    except ClientError as e:
        # Unexpected error when contacting Cognito: log and return 500
        print("Cognito lookup failed:", str(e))
        raise HTTPException(status_code=500, detail="Error checking Cognito for existing user.")

    # 3) Insert into MongoDB
    users_collection.insert_one(user.dict())
    return user

# PUT /api/users/{email} to update a user
@app.put("/api/users/{email}")
async def update_user(email: str, updated_data: dict):
    # optional: prevent changing email to one that conflicts
    if "email" in updated_data:
        # If trying to change to an email that exists locally under a different user
        conflict = users_collection.find_one({"email": updated_data["email"], "email": {"$ne": email}})
        if conflict:
            raise HTTPException(status_code=400, detail="Desired email is already in use by another account.")

    # Update MongoDB first
    result = users_collection.update_one({"email": email}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found in database")

    # If role changed, attempt to sync with Cognito (if creds available)
    if "role" in updated_data:
        try:
            if check_aws_credentials():
                # Try update via Cognito admin APIs
                # remove previous groups and add to new group (reuse your helper logic)
                # For brevity, call your existing helper functions if defined
                # Example: await update_user_cognito_group(email, updated_data['role'])
                # But since this is sync code in a sync function, call cognito_client directly:
                # First list current groups for user
                try:
                    groups_resp = cognito_client.admin_list_groups_for_user(Username=email, UserPoolId=USER_POOL_ID)
                    current_groups = [g["GroupName"] for g in groups_resp.get("Groups", [])]
                    for gname in current_groups:
                        cognito_client.admin_remove_user_from_group(UserPoolId=USER_POOL_ID, Username=email, GroupName=gname)
                except ClientError as e:
                    code = e.response.get("Error", {}).get("Code", "")
                    if code == "UserNotFoundException":
                        # user doesn't exist in Cognito — skip gracefully
                        print(f"User {email} not in Cognito, skipping group sync.")
                    else:
                        raise

                # Add to new group
                try:
                    cognito_client.admin_add_user_to_group(UserPoolId=USER_POOL_ID, Username=email, GroupName=updated_data["role"])
                except ClientError as e:
                    code = e.response.get("Error", {}).get("Code", "")
                    if code == "UserNotFoundException":
                        print(f"User {email} not found in Cognito when trying to add to group {updated_data['role']}")
                    else:
                        raise
            else:
                print("WARNING: AWS credentials not configured. Skipping Cognito role sync.")
        except NoCredentialsError:
            print("WARNING: No AWS credentials available; skipping Cognito sync.")
        except ClientError as e:
            print("Cognito role sync error:", str(e))
            # don't fail the request; we updated MongoDB already

    # If isBanned changed, update enable/disable in Cognito
    if "isBanned" in updated_data:
        try:
            if check_aws_credentials():
                if updated_data["isBanned"]:
                    cognito_client.admin_disable_user(UserPoolId=USER_POOL_ID, Username=email)
                else:
                    cognito_client.admin_enable_user(UserPoolId=USER_POOL_ID, Username=email)
            else:
                print("WARNING: AWS credentials not configured. Skipping Cognito enable/disable.")
        except NoCredentialsError:
            print("WARNING: No AWS credentials available; skipping Cognito status update.")
        except ClientError as e:
            print("Cognito status update error:", str(e))

    # Return updated user
    user = users_collection.find_one({"email": updated_data.get("email", email)}, {"_id": 0})
    return user

# Transactions / rules / logs unchanged (kept as-is)
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
        print("  Cognito integration will be skipped.")
        print("  To configure: run 'aws configure' or set AWS env variables")
    print("=" * 50)
