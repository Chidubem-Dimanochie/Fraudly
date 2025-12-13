from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal, Any
from connect import db
from datetime import datetime
from uuid import uuid4
import os

# ✅ Added for migration endpoint ONLY (not used in normal requests)
import boto3
from botocore.exceptions import ClientError

# ----------------------------
# Optional ML imports (safe)
# ----------------------------
try:
    import joblib
    import pandas as pd
    ML_DEPS_AVAILABLE = True
    print("✅ ML dependencies available.")
except Exception as e:
    print("⚠️ ML dependencies not available:", e)
    joblib = None
    pd = None
    ML_DEPS_AVAILABLE = False

app = FastAPI()

# ----------------------------
# Better validation error handler
# ----------------------------
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"❌ Validation Error at {request.url}")
    body = await request.body()
    try:
        print(f"❌ Request body: {body.decode('utf-8')}")
    except Exception:
        print("❌ Request body: <binary>")
    print(f"❌ Errors: {exc.errors()}")

    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": exc.errors(), "body": body.decode("utf-8", errors="replace")},
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
# Pydantic models
# ----------------------------
class User(BaseModel):
    username: str
    email: EmailStr
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

    # Frontend expects this:
    modelScore: Optional[float] = None
    # Legacy/alias:
    mlProbability: Optional[float] = None

    # ✅ prevents double-charging:
    fundsApplied: bool = False


class TransactionCreate(BaseModel):
    userEmail: EmailStr
    amount: float
    merchant: str
    location: str
    timestamp: Optional[str] = None
    analystNotes: Optional[List[AnalystNote]] = None


class TransactionUpdate(BaseModel):
    status: Optional[Literal["approved", "fraudulent", "in_review"]] = None
    reason: Optional[str] = None
    analystNotes: Optional[List[AnalystNote]] = None


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

# Backward-compat aliases
logs_collection = audit_logs_collection
rules_collection = fraud_rules_collection


def generate_id() -> str:
    return str(uuid4())


# ----------------------------
# ML: load joblib pipeline
# Required file: ./models/fraud_pipeline.joblib
# ----------------------------
ML_MODEL_READY = False
fraud_pipeline = None

if ML_DEPS_AVAILABLE:
    try:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        models_dir = os.path.join(base_dir, "models")
        pipeline_path = os.path.join(models_dir, "fraud_pipeline.joblib")

        fraud_pipeline = joblib.load(pipeline_path)
        ML_MODEL_READY = True
        print(f"✅ Loaded fraud pipeline from: {pipeline_path}")
    except Exception as e:
        ML_MODEL_READY = False
        fraud_pipeline = None
        print("⚠️ Failed to load fraud_pipeline.joblib:", e)


def _iso_to_hour(iso_ts: str) -> int:
    clean = iso_ts.replace("Z", "")
    dt = datetime.fromisoformat(clean)
    return dt.hour


def ml_predict_fraud_probability(amount: float, iso_timestamp: Optional[str]) -> Optional[float]:
    """
    Uses your trained pipeline.
    Assumes training features are: Amount + Hour.
    """
    if not ML_MODEL_READY or fraud_pipeline is None or pd is None:
        return None

    try:
        ts = iso_timestamp or datetime.utcnow().isoformat()
        hour = _iso_to_hour(ts)
        X = pd.DataFrame([{"Amount": float(amount), "Hour": int(hour)}])
        prob = float(fraud_pipeline.predict_proba(X)[0][1])
        return prob
    except Exception as e:
        print("⚠️ ML prediction failed:", e)
        return None


def _ensure_model_fields(txn: dict) -> dict:
    """
    Ensure BOTH keys exist for frontend compatibility:
    - modelScore (frontend reads this)
    - mlProbability (alias)
    """
    if txn.get("modelScore") is None and txn.get("mlProbability") is not None:
        txn["modelScore"] = txn["mlProbability"]
    if txn.get("mlProbability") is None and txn.get("modelScore") is not None:
        txn["mlProbability"] = txn["modelScore"]
    return txn


def decide_transaction_status(amount: float, merchant: str, iso_timestamp: str) -> tuple[str, str, Optional[float]]:
    """
    ✅ Thresholds:
      score >= 0.70  -> fraudulent
      0.50–0.69      -> in_review
      < 0.50         -> approved
    Then fraud rules may escalate severity.
    """
    status_out: Literal["approved", "fraudulent", "in_review"] = "approved"
    reason = "Transaction appears normal."
    ml_prob: Optional[float] = None

    # 1) ML decision (your thresholds)
    ml_prob = ml_predict_fraud_probability(amount, iso_timestamp)
    if ml_prob is not None:
        if ml_prob >= 0.70:
            status_out = "fraudulent"
            reason = f"High ML risk ({ml_prob:.2f})."
        elif ml_prob >= 0.50:
            status_out = "in_review"
            reason = f"Moderate ML risk ({ml_prob:.2f})."
        else:
            status_out = "approved"
            reason = f"Low ML risk ({ml_prob:.2f})."
    else:
        status_out = "approved"
        reason = "ML unavailable."

    # 2) Rule-based overrides (only escalate)
    severity = {"approved": 0, "in_review": 1, "fraudulent": 2}
    try:
        rules = list(fraud_rules_collection.find({}, {"_id": 0}))
    except Exception as e:
        print("⚠️ Could not load fraud rules:", e)
        rules = []

    for rule in rules:
        triggered = False

        if rule.get("type") == "amount" and rule.get("threshold") is not None:
            if amount > float(rule["threshold"]):
                triggered = True
        elif rule.get("type") == "merchantKeyword" and rule.get("keyword"):
            if str(rule["keyword"]).lower() in merchant.lower():
                triggered = True

        if triggered:
            rule_result = rule.get("result", "in_review")
            if severity.get(rule_result, 0) > severity[status_out]:
                status_out = rule_result  # type: ignore
                reason = f"Flagged by rule: {rule.get('description', '(no description)')}."
            break

    return status_out, reason, ml_prob


def _apply_funds_once(txn: dict) -> None:
    """
    Deduct balance exactly once when a transaction becomes approved.
    Uses txn['fundsApplied'] guard.
    """
    if txn.get("fundsApplied", False):
        return

    user_email = txn["userEmail"]
    amount = float(txn["amount"])

    user_doc = users_collection.find_one({"email": user_email})
    if not user_doc:
        raise HTTPException(status_code=400, detail="User not found for transaction")

    if user_doc.get("isBanned"):
        raise HTTPException(status_code=400, detail="Account is suspended.")
    if user_doc.get("cardFrozen"):
        raise HTTPException(status_code=400, detail="Card is frozen.")

    balance = float(user_doc.get("balance", 0.0))
    if balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient funds at approval time.")

    users_collection.update_one({"email": user_email}, {"$inc": {"balance": -amount}})
    transactions_collection.update_one({"id": txn["id"]}, {"$set": {"fundsApplied": True}})


# ==========================================================
# ✅ ONE-TIME MIGRATION ENDPOINT: username + fullName from Cognito
# (Normal endpoints do NOT call Cognito)
# ==========================================================
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "us-east-1_HgEmPHJj8")
MIGRATION_KEY = os.getenv("MIGRATION_KEY", "")

cognito_client = boto3.client("cognito-idp", region_name=AWS_REGION)


def _generate_username_from_email(email: str) -> str:
    return email.split("@")[0].lower().replace(".", "").replace("-", "")


def _get_cognito_user_by_email(email: str) -> Optional[dict]:
    try:
        resp = cognito_client.list_users(
            UserPoolId=COGNITO_USER_POOL_ID,
            Filter=f'email = "{email}"',
            Limit=1
        )
        users = resp.get("Users", [])
        return users[0] if users else None
    except Exception as e:
        print(f"  ⚠ Could not fetch from Cognito for {email}: {e}")
        return None


def _extract_username_and_fullname(cognito_user: dict, email: str) -> tuple[str, Optional[str]]:
    username = None
    full_name = None

    for attr in cognito_user.get("Attributes", []):
        if attr.get("Name") == "preferred_username" and attr.get("Value"):
            username = attr["Value"]
        if attr.get("Name") == "name" and attr.get("Value"):
            full_name = attr["Value"]

    if not username:
        username = cognito_user.get("Username") or _generate_username_from_email(email)

    return username, full_name


def _resolve_username_conflict(username: str, email: str) -> str:
    conflict = users_collection.find_one({"username": username, "email": {"$ne": email}})
    if not conflict:
        return username

    base = username
    counter = 1
    while users_collection.find_one({"username": f"{base}{counter}", "email": {"$ne": email}}):
        counter += 1
    return f"{base}{counter}"


@app.post("/api/admin/migrate-usernames-and-names")
async def migrate_usernames_and_names(request: Request):
    """
    Runs a one-time migration:
      - For users missing username and/or fullName:
          username <- preferred_username OR Cognito Username OR email-derived
          fullName <- Cognito attribute "name"
      - Writes into MongoDB.
    Locked with header: x-migration-key
    """
    provided_key = request.headers.get("x-migration-key", "")
    if not MIGRATION_KEY or provided_key != MIGRATION_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    users = list(users_collection.find({}))
    updated = 0
    skipped = 0
    errors = 0
    details = []

    for user in users:
        email = user.get("email")
        if not email:
            skipped += 1
            details.append({"email": None, "status": "skipped", "reason": "missing email"})
            continue

        existing_username = user.get("username")
        existing_fullname = user.get("fullName")

        # if both exist, skip
        if existing_username and existing_fullname:
            skipped += 1
            details.append({"email": email, "status": "skipped", "reason": "already has username+fullName"})
            continue

        try:
            cognito_user = _get_cognito_user_by_email(email)

            if cognito_user:
                username, full_name = _extract_username_and_fullname(cognito_user, email)
            else:
                username = _generate_username_from_email(email)
                full_name = None

            username = _resolve_username_conflict(username, email)

            update_fields = {}
            if not existing_username:
                update_fields["username"] = username
            if not existing_fullname and full_name:
                update_fields["fullName"] = full_name

            if not update_fields:
                skipped += 1
                details.append({"email": email, "status": "skipped", "reason": "nothing to update"})
                continue

            res = users_collection.update_one({"email": email}, {"$set": update_fields})
            if res.modified_count > 0:
                updated += 1
                details.append({"email": email, "status": "updated", "fields": update_fields})
            else:
                skipped += 1
                details.append({"email": email, "status": "skipped", "reason": "no changes written"})

        except Exception as e:
            errors += 1
            details.append({"email": email, "status": "error", "reason": str(e)})

    return {
        "message": "Migration complete",
        "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "total": len(users),
        "details": details,
    }


# ----------------------------
# USERS endpoints (Mongo-only)
# ----------------------------

@app.get("/api/users")
async def get_users():
    try:
        return list(users_collection.find({}, {"_id": 0}))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/users/by-email/{email}")
async def get_user_by_email(email: str):
    try:
        user = users_collection.find_one({"email": email}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/users/email/{email}")
async def get_user_by_email_old(email: str):
    return await get_user_by_email(email)


@app.get("/api/users/{username}")
async def get_user(username: str):
    try:
        user = users_collection.find_one({"username": username}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/users/username/{username}")
async def get_user_by_username_old(username: str):
    return await get_user(username)


@app.post("/api/users")
async def create_user(user: User):
    try:
        if users_collection.find_one({"username": user.username}):
            raise HTTPException(status_code=400, detail="Username already exists")
        if users_collection.find_one({"email": user.email}):
            raise HTTPException(status_code=400, detail="Email already exists")

        users_collection.insert_one(user.dict())
        return user
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.put("/api/users/{username}")
async def update_user(username: str, updated_data: UserUpdate):
    try:
        update_dict = {k: v for k, v in updated_data.dict().items() if v is not None}
        if not update_dict:
            raise HTTPException(status_code=400, detail="No valid fields to update")

        if "email" in update_dict:
            existing = users_collection.find_one(
                {"email": update_dict["email"], "username": {"$ne": username}}
            )
            if existing:
                raise HTTPException(status_code=400, detail="Email already in use")

        result = users_collection.update_one({"username": username}, {"$set": update_dict})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User not found")

        return users_collection.find_one({"username": username}, {"_id": 0})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.put("/api/users/email/{email}")
async def update_user_by_email(email: str, updated_data: dict):
    try:
        user = users_collection.find_one({"email": email})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        username = user["username"]
        filtered = {k: v for k, v in updated_data.items() if k in UserUpdate.__fields__}
        return await update_user(username, UserUpdate(**filtered))
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
# TRANSACTIONS endpoints
# ----------------------------
@app.get("/api/transactions")
async def get_transactions(user_email: Optional[str] = None, status_filter: Optional[str] = None):
    try:
        query: dict[str, Any] = {}
        if user_email:
            query["userEmail"] = user_email
        if status_filter:
            query["status"] = status_filter

        txns = list(transactions_collection.find(query, {"_id": 0}))
        return [_ensure_model_fields(t) for t in txns]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/transactions/{transaction_id}")
async def get_transaction(transaction_id: str):
    try:
        txn = transactions_collection.find_one({"id": transaction_id}, {"_id": 0})
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return _ensure_model_fields(txn)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/transactions")
async def create_transaction(transaction: TransactionCreate):
    """
    ✅ Money rule:
      - We only change the user's balance when the transaction is APPROVED.
      - If status is in_review or fraudulent, balance doesn't change.
    """
    try:
        user_doc = users_collection.find_one({"email": transaction.userEmail})
        if not user_doc:
            raise HTTPException(status_code=400, detail="User not found for given email")

        if user_doc.get("isBanned"):
            raise HTTPException(status_code=400, detail="Account is suspended.")
        if user_doc.get("cardFrozen"):
            raise HTTPException(status_code=400, detail="Card is frozen.")

        ts = transaction.timestamp or datetime.utcnow().isoformat()

        status_out, reason, ml_prob = decide_transaction_status(
            amount=float(transaction.amount),
            merchant=transaction.merchant,
            iso_timestamp=ts,
        )

        new_txn = {
            "id": generate_id(),
            "userEmail": transaction.userEmail,
            "amount": float(transaction.amount),
            "merchant": transaction.merchant,
            "location": transaction.location,
            "status": status_out,
            "reason": reason,
            "timestamp": ts,
            "analystNotes": transaction.analystNotes or [],
            "fundsApplied": False,
        }

        if ml_prob is not None:
            new_txn["modelScore"] = ml_prob
            new_txn["mlProbability"] = ml_prob

        transactions_collection.insert_one(new_txn)
        new_txn.pop("_id", None)

        if status_out == "approved":
            _apply_funds_once(new_txn)
            refreshed = transactions_collection.find_one({"id": new_txn["id"]}, {"_id": 0})
            return _ensure_model_fields(refreshed) if refreshed else _ensure_model_fields(new_txn)

        return _ensure_model_fields(new_txn)

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error creating transaction: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


from fastapi import HTTPException, status

@app.put("/api/transactions/{transaction_id}")
async def update_transaction(transaction_id: str, updated_data: dict):
    """
    ✅ Finality Rule:
      - ONLY transactions currently "in_review" can be updated.
      - If current is "approved" or "fraudulent" => FINAL (cannot be changed).
    ✅ Money Rule:
      - If status changes TO approved, deduct funds once.
      - No refunds (since approved->fraudulent is now impossible).
    """
    try:
        txn = transactions_collection.find_one({"id": transaction_id})
        if not txn:
            raise HTTPException(status_code=404, detail="Transaction not found")

        old_status = txn.get("status")

        # ✅ BLOCK updates unless current status is in_review
        if old_status != "in_review":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Transaction is final ({old_status}). Only in_review transactions can be updated."
            )

        # ✅ Determine requested new status (if any)
        new_status = updated_data.get("status", old_status)

        # ✅ Optional: restrict allowed transitions out of in_review
        allowed_next = {"approved", "fraudulent"}
        if new_status != old_status and new_status not in allowed_next:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid status transition. in_review can only become approved or fraudulent."
            )

        # ✅ Apply updates
        transactions_collection.update_one({"id": transaction_id}, {"$set": updated_data})

        # ✅ If moved to approved, apply funds once
        if new_status == "approved":
            refreshed = transactions_collection.find_one({"id": transaction_id})
            if refreshed and not refreshed.get("fundsApplied", False):
                _apply_funds_once(refreshed)

        updated_txn = transactions_collection.find_one({"id": transaction_id}, {"_id": 0})
        if not updated_txn:
            raise HTTPException(status_code=404, detail="Transaction not found after update")

        return _ensure_model_fields(updated_txn)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
# ----------------------------
# AUDIT LOGS endpoints
# ----------------------------
@app.get("/api/audit-logs")
async def get_audit_logs(actor: Optional[str] = None, action: Optional[str] = None):
    try:
        query = {}
        if actor:
            query["actor"] = actor
        if action:
            query["action"] = action

        return list(audit_logs_collection.find(query, {"_id": 0}).sort("timestamp", -1).limit(1000))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/logs")
async def get_logs_old():
    return await get_audit_logs()


@app.post("/api/audit-logs")
async def create_audit_log(log: dict):
    try:
        if "id" not in log:
            log["id"] = generate_id()
        if "timestamp" not in log:
            log["timestamp"] = datetime.utcnow().isoformat()

        audit_logs_collection.insert_one(log)
        log.pop("_id", None)
        return log
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/logs")
async def create_log_old(log: dict):
    return await create_audit_log(log)


# ----------------------------
# FRAUD RULES endpoints
# ----------------------------
@app.get("/api/fraud-rules")
async def get_fraud_rules():
    try:
        return list(fraud_rules_collection.find({}, {"_id": 0}))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.get("/api/rules")
async def get_rules_old():
    return await get_fraud_rules()


@app.get("/api/fraud-rules/{rule_id}")
async def get_fraud_rule(rule_id: str):
    try:
        rule = fraud_rules_collection.find_one({"id": rule_id}, {"_id": 0})
        if not rule:
            raise HTTPException(status_code=404, detail="Fraud rule not found")
        return rule
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/fraud-rules")
async def create_fraud_rule(rule: dict):
    try:
        if "id" not in rule:
            rule["id"] = generate_id()
        fraud_rules_collection.insert_one(rule)
        rule.pop("_id", None)
        return rule
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.post("/api/rules")
async def create_rule_old(rule: dict):
    return await create_fraud_rule(rule)


@app.put("/api/fraud-rules/{rule_id}")
async def update_fraud_rule(rule_id: str, updated_data: dict):
    try:
        result = fraud_rules_collection.update_one({"id": rule_id}, {"$set": updated_data})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Fraud rule not found")
        return fraud_rules_collection.find_one({"id": rule_id}, {"_id": 0})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.delete("/api/fraud-rules/{rule_id}")
async def delete_fraud_rule(rule_id: str):
    try:
        result = fraud_rules_collection.delete_one({"id": rule_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Fraud rule deleted successfully")
        return {"message": "Fraud rule deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")


@app.delete("/api/rules/{rule_id}")
async def delete_rule_old(rule_id: str):
    return await delete_fraud_rule(rule_id)


# ----------------------------
# Root + health
# ----------------------------
@app.get("/")
async def root():
    return {"message": "FastAPI backend is running!", "timestamp": datetime.utcnow().isoformat()}


@app.get("/health")
async def health_check():
    try:
        db.command("ping")
        return {
            "status": "healthy",
            "database": "connected",
            "mlModelReady": ML_MODEL_READY,
            "mlArtifact": "models/fraud_pipeline.joblib",
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Database unhealthy: {str(e)}")


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
