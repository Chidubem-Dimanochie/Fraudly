from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
from connect import db
from datetime import datetime
from uuid import uuid4

app = FastAPI()

# Add validation error handler for better debugging
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"❌ Validation Error at {request.url}")
    body = await request.body()
    print(f"❌ Request body: {body.decode('utf-8')}")
    print(f"❌ Errors: {exc.errors()}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": exc.errors(),
            "body": body.decode("utf-8"),
        },
    )

# ----------------------------
# CORS setup
# ----------------------------
origins = [
    "http://localhost:3000",
    "http://10.88.7.176:3000",
    "https://main.d3sba06ap3p2l2.amplifyapp.com",
    "https://fraudly-git-main-chidubem-dimanochies-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# Pydantic models matching types.ts
# ----------------------------
class User(BaseModel):
    username: str
    email: EmailStr

    # Single full name field
    fullName: Optional[str] = None

    role: Literal["Customer", "Employee", "Admin"] = "Customer"
    balance: float = Field(default=0.0, ge=0)
    cardFrozen: bool = False
    alertThreshold: Optional[float] = None
    isBanned: bool = False


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    fullName: Optional[str] = None
    role: Optional[Literal["Customer", "Employee", "Admin"]] = None
    balance: Optional[float] = Field(None, ge=0)
    cardFrozen: Optional[bool] = None
    alertThreshold: Optional[float] = None
    isBanned: Optional[bool] = None


# Transaction types matching types.ts
class AnalystNote(BaseModel):
    timestamp: str
    analyst: str
    note: str


class Transaction(BaseModel):
    id: str
    userEmail: EmailStr
    amount: float
    merchant: str
    location: str
    status: Literal["approved", "fraudulent", "in_review"]
    reason: str
    timestamp: str
    analystNotes: Optional[List[AnalystNote]] = None


class TransactionCreate(BaseModel):
    userEmail: EmailStr
    amount: float
    merchant: str
    location: str
    status: Literal["approved", "fraudulent", "in_review"] = "approved"
    reason: str = ""
    timestamp: Optional[str] = None
    analystNotes: Optional[List[AnalystNote]] = None


class TransactionUpdate(BaseModel):
    status: Optional[Literal["approved", "fraudulent", "in_review"]] = None
    reason: Optional[str] = None
    analystNotes: Optional[List[AnalystNote]] = None


# Audit Log matching types.ts
class AuditLog(BaseModel):
    id: str
    timestamp: str
    actor: str
    action: str
    details: str


class AuditLogCreate(BaseModel):
    actor: str
    action: str
    details: str
    timestamp: Optional[str] = None


# Fraud Rules matching types.ts
class FraudRule(BaseModel):
    id: str
    type: Literal["amount", "merchantKeyword"]
    description: str
    threshold: Optional[float] = None
    keyword: Optional[str] = None
    result: Literal["fraudulent", "in_review"]


class FraudRuleCreate(BaseModel):
    type: Literal["amount", "merchantKeyword"]
    description: str
    threshold: Optional[float] = None
    keyword: Optional[str] = None
    result: Literal["fraudulent", "in_review"]


# ----------------------------
# MongoDB collections
# ----------------------------
users_collection = db.get_collection("users")
transactions_collection = db.get_collection("transactions")
audit_logs_collection = db.get_collection("audit_logs")
fraud_rules_collection = db.get_collection("fraud_rules")

# For backward compatibility with old endpoint names
logs_collection = audit_logs_collection
rules_collection = fraud_rules_collection

# ----------------------------
# Helper function to generate IDs
# ----------------------------
def generate_id() -> str:
    return str(uuid4())

# ----------------------------
# /users endpoints
# ----------------------------
@app.get("/api/users")
async def get_users():
    try:
        users = list(users_collection.find({}, {"_id": 0}))
        return users
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/users/by-email/{email}")
async def get_user_by_email(email: str):
    """Get user by email address"""
    try:
        user = users_collection.find_one({"email": email}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# Support old endpoint
@app.get("/api/users/email/{email}")
async def get_user_by_email_old(email: str):
    return await get_user_by_email(email)


@app.get("/api/users/{username}")
async def get_user(username: str):
    """Get user by username (Cognito username)"""
    try:
        user = users_collection.find_one({"username": username}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# Support old endpoint
@app.get("/api/users/username/{username}")
async def get_user_by_username_old(username: str):
    return await get_user(username)


@app.post("/api/users")
async def create_user(user: User):
    try:
        print(f"📝 Creating user with data: {user.dict()}")

        # Check if username already exists in MongoDB only
        existing_username = users_collection.find_one({"username": user.username})
        if existing_username:
            print(f"⚠️ Username {user.username} already exists")
            raise HTTPException(status_code=400, detail="Username already exists")

        # Check if email already exists in MongoDB only
        existing_email = users_collection.find_one({"email": user.email})
        if existing_email:
            print(f"⚠️ Email {user.email} already exists")
            raise HTTPException(status_code=400, detail="Email already exists")

        # Insert the new user (includes fullName if provided)
        result = users_collection.insert_one(user.dict())
        print(
            f"✅ User created successfully: {user.username} ({user.email}) with _id: {result.inserted_id}"
        )
        return user
    except HTTPException:
        raise
    except Exception as e:
        import traceback

        print(f"❌ Error creating user: {str(e)}")
        print(f"❌ Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.put("/api/users/{username}")
async def update_user(username: str, updated_data: UserUpdate):
    try:
        print(
            f"📝 Updating user {username} with data: {updated_data.dict(exclude_none=True)}"
        )

        # Remove None values
        update_dict = {
            k: v for k, v in updated_data.dict().items() if v is not None
        }

        if not update_dict:
            raise HTTPException(
                status_code=400, detail="No valid fields to update"
            )

        # If email is being updated, check it's not taken by another user
        if "email" in update_dict:
            existing = users_collection.find_one(
                {"email": update_dict["email"], "username": {"$ne": username}}
            )
            if existing:
                raise HTTPException(
                    status_code=400, detail="Email already in use"
                )

        result = users_collection.update_one(
            {"username": username}, {"$set": update_dict}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        updated_user = users_collection.find_one(
            {"username": username}, {"_id": 0}
        )
        print(f"✅ User updated successfully: {username}")
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error updating user: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


# Support old endpoint (by email)
@app.put("/api/users/email/{email}")
async def update_user_by_email(email: str, updated_data: dict):
    try:
        # Find user by email first
        user = users_collection.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        username = user["username"]

        # Use the main update function (filter only fields present in UserUpdate)
        user_update = UserUpdate(
            **{k: v for k, v in updated_data.items() if k in UserUpdate.__fields__}
        )
        return await update_user(username, user_update)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.delete("/api/users/{username}")
async def delete_user(username: str):
    try:
        result = users_collection.delete_one({"username": username})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ----------------------------
# /transactions endpoints
# ----------------------------
@app.get("/api/transactions")
async def get_transactions(
    user_email: Optional[str] = None, status: Optional[str] = None
):
    try:
        query = {}
        if user_email:
            query["userEmail"] = user_email
        if status:
            query["status"] = status

        transactions = list(transactions_collection.find(query, {"_id": 0}))
        return transactions
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/transactions/{transaction_id}")
async def get_transaction(transaction_id: str):
    try:
        transaction = transactions_collection.find_one(
            {"id": transaction_id}, {"_id": 0}
        )
        if not transaction:
            raise HTTPException(
                status_code=404, detail="Transaction not found"
            )
        return transaction
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/transactions")
async def create_transaction(transaction: dict):
    try:
        # Generate ID if not provided
        if "id" not in transaction:
            transaction["id"] = generate_id()

        # Set timestamp if not provided
        if "timestamp" not in transaction:
            transaction["timestamp"] = datetime.utcnow().isoformat()

        transactions_collection.insert_one(transaction)
        print(f"✅ Transaction created: {transaction['id']}")

        # Return without _id
        transaction.pop("_id", None)
        return transaction
    except Exception as e:
        print(f"❌ Error creating transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.put("/api/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, updated_data: dict):
    try:
        result = transactions_collection.update_one(
            {"id": transaction_id}, {"$set": updated_data}
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=404, detail="Transaction not found"
            )

        updated_transaction = transactions_collection.find_one(
            {"id": transaction_id}, {"_id": 0}
        )
        print(f"✅ Transaction updated: {transaction_id}")
        return updated_transaction
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

# ----------------------------
# /audit-logs endpoints (new) and /logs (backward compatibility)
# ----------------------------
@app.get("/api/audit-logs")
async def get_audit_logs(
    actor: Optional[str] = None, action: Optional[str] = None
):
    try:
        query = {}
        if actor:
            query["actor"] = actor
        if action:
            query["action"] = action

        logs = list(
            audit_logs_collection.find(query, {"_id": 0})
            .sort("timestamp", -1)
            .limit(1000)
        )
        return logs
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/logs")
async def get_logs_old():
    """Backward compatibility endpoint"""
    return await get_audit_logs()


@app.post("/api/audit-logs")
async def create_audit_log(log: dict):
    try:
        # Generate ID if not provided
        if "id" not in log:
            log["id"] = generate_id()

        # Set timestamp if not provided
        if "timestamp" not in log:
            log["timestamp"] = datetime.utcnow().isoformat()

        audit_logs_collection.insert_one(log)

        # Return without _id
        log.pop("_id", None)
        return log
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/logs")
async def create_log_old(log: dict):
    """Backward compatibility endpoint"""
    return await create_audit_log(log)

# ----------------------------
# /fraud-rules endpoints (new) and /rules (backward compatibility)
# ----------------------------
@app.get("/api/fraud-rules")
async def get_fraud_rules():
    try:
        rules = list(fraud_rules_collection.find({}, {"_id": 0}))
        return rules
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/rules")
async def get_rules_old():
    """Backward compatibility endpoint"""
    return await get_fraud_rules()


@app.get("/api/fraud-rules/{rule_id}")
async def get_fraud_rule(rule_id: str):
    try:
        rule = fraud_rules_collection.find_one({"id": rule_id}, {"_id": 0})
        if not rule:
            raise HTTPException(
                status_code=404, detail="Fraud rule not found"
            )
        return rule
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/fraud-rules")
async def create_fraud_rule(rule: dict):
    try:
        # Generate ID if not provided
        if "id" not in rule:
            rule["id"] = generate_id()

        fraud_rules_collection.insert_one(rule)
        print(f"✅ Fraud rule created: {rule['id']}")

        # Return without _id
        rule.pop("_id", None)
        return rule
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/rules")
async def create_rule_old(rule: dict):
    """Backward compatibility endpoint"""
    return await create_fraud_rule(rule)


@app.put("/api/fraud-rules/{rule_id}")
async def update_fraud_rule(rule_id: str, updated_data: dict):
    try:
        result = fraud_rules_collection.update_one(
            {"id": rule_id}, {"$set": updated_data}
        )

        if result.matched_count == 0:
            raise HTTPException(
                status_code=404, detail="Fraud rule not found"
            )

        updated_rule = fraud_rules_collection.find_one(
            {"id": rule_id}, {"_id": 0}
        )
        print(f"✅ Fraud rule updated: {rule_id}")
        return updated_rule
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.delete("/api/fraud-rules/{rule_id}")
async def delete_fraud_rule(rule_id: str):
    try:
        result = fraud_rules_collection.delete_one({"id": rule_id})
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=404, detail="Fraud rule not found"
            )
        return {"message": "Fraud rule deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.delete("/api/rules/{rule_id}")
async def delete_rule_old(rule_id: str):
    """Backward compatibility endpoint"""
    return await delete_fraud_rule(rule_id)

# ----------------------------
# Root + health
# ----------------------------
@app.get("/")
async def root():
    return {
        "message": "FastAPI backend is running!",
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/health")
async def health_check():
    try:
        # Test MongoDB connection
        db.command("ping")
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        raise HTTPException(
            status_code=503, detail=f"Database unhealthy: {str(e)}"
        )


@app.on_event("startup")
async def startup_event():
    print("=" * 50)
    print("FastAPI Server Started")
    print("=" * 50)
    print(f"Database: {db.name}")
    try:
        db.command("ping")
        print("✅ MongoDB connection successful")
        collections = db.list_collection_names()
        print(f"✅ Collections: {collections}")
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
    print("=" * 50)
