# app/routers/auth_router.py
# ─────────────────────────────────────────────────────────────
# JWT auth — DB-backed users with bcrypt password hashing
#   POST /api/v1/auth/signup → create user, return JWT
#   POST /api/v1/auth/login  → verify creds, return JWT
# ─────────────────────────────────────────────────────────────

import os
import bcrypt
import jwt
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from dotenv import load_dotenv

from app.database.db import get_db
from app.models.capa_model import User

load_dotenv()

router = APIRouter(prefix="/api/v1/auth", tags=["Auth"])

SECRET_KEY = os.getenv("SECRET_KEY", "pharma_secret_key_2026")
ALGORITHM  = "HS256"


# ── Schemas ──────────────────────────────────────────────────
class SignupRequest(BaseModel):
    user_id:     str = Field(min_length=1, max_length=64)
    username:    str = Field(min_length=1, max_length=50)
    email:       str = Field(min_length=5, max_length=120)
    password:    str = Field(min_length=1, max_length=72)   # bcrypt 72-byte limit; min relaxed to allow short passwords from the frontend
    customer_id: str = Field(min_length=1, max_length=64)
    role:        str = Field(default="user", max_length=32)

    model_config = {
        "json_schema_extra": {
            "example": {
                "user_id":     "USER-001",
                "username":    "ramu",
                "email":       "ramu@example.com",
                "password":    "secret123",
                "customer_id": "CUST_001",
                "role":        "qa_manager",
            }
        }
    }

class LoginRequest(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type:   str
    username:     str
    customer_id:  str
    role:         str
    message:      str


# ── Password helpers ─────────────────────────────────────────
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


# ── Token helpers ────────────────────────────────────────────
def create_token(username: str, customer_id: str) -> str:
    payload = {
        "sub":         username,
        "customer_id": customer_id,
        "exp":         datetime.utcnow() + timedelta(hours=24),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_token(auth: str = Header(...)) -> str:
    try:
        payload = jwt.decode(auth, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please login again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please login.")


def get_current_customer_id(auth: str = Header(...)) -> str:
    try:
        payload = jwt.decode(auth, SECRET_KEY, algorithms=[ALGORITHM])
        customer_id = payload.get("customer_id")
        if not customer_id:
            raise HTTPException(status_code=401, detail="customer_id missing in token.")
        return customer_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please login again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please login.")


class CurrentUser(BaseModel):
    username:    str
    customer_id: str

def get_current_user(auth: str = Header(...)) -> CurrentUser:
    try:
        payload = jwt.decode(auth, SECRET_KEY, algorithms=[ALGORITHM])
        return CurrentUser(
            username=payload.get("sub"),
            customer_id=payload.get("customer_id"),
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired. Please login again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token. Please login.")


# ── POST /api/v1/auth/signup ─────────────────────────────────
@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.user_id == req.user_id).first():
        raise HTTPException(status_code=409, detail="user_id already exists.")
    if db.query(User).filter(User.username == req.username).first():
        raise HTTPException(status_code=409, detail="Username already taken.")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=409, detail="Email already registered.")

    user = User(
        user_id         = req.user_id,
        username        = req.username,
        email           = req.email,
        hashed_password = hash_password(req.password),
        customer_id     = req.customer_id,
        role            = req.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.username, user.customer_id)
    return AuthResponse(
        access_token = token,
        token_type   = "Bearer",
        username     = user.username,
        customer_id  = user.customer_id,
        role         = user.role,
        message      = f"✅ Account created for {user.username}.",
    )


# ── POST /api/v1/auth/login ──────────────────────────────────
@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password.")

    token = create_token(user.username, user.customer_id)
    return AuthResponse(
        access_token = token,
        token_type   = "Bearer",
        username     = user.username,
        customer_id  = user.customer_id,
        role         = user.role,
        message      = f"✅ Login successful. Welcome {user.username}!",
    )
