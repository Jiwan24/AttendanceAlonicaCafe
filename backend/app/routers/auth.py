"""
Auth API endpoints.

Endpoints:
  POST /api/auth/login   -> login dengan username+password, dapat JWT token
  GET  /api/auth/verify  -> verifikasi token masih valid
"""

import os
import hmac
import hashlib
import base64
import json
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])

security = HTTPBearer(auto_error=False)

# ─── JWT helpers (stdlib only, no python-jose needed) ────────────────────────

def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(s: str) -> bytes:
    # Re-add padding
    padding = 4 - len(s) % 4
    if padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s)


def _get_secret() -> str:
    secret = os.getenv("SECRET_KEY", "")
    if not secret:
        raise RuntimeError("SECRET_KEY tidak di-set di environment variables.")
    return secret


def create_token(payload: dict, expires_hours: int = 8) -> str:
    """Buat JWT HS256 token."""
    secret = _get_secret()
    header = {"alg": "HS256", "typ": "JWT"}

    now = datetime.now(timezone.utc)
    payload = {
        **payload,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=expires_hours)).timestamp()),
    }

    header_b64  = _b64url_encode(json.dumps(header,  separators=(",", ":")).encode())
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}"

    sig = hmac.new(
        secret.encode(),
        signing_input.encode(),
        hashlib.sha256,
    ).digest()

    return f"{signing_input}.{_b64url_encode(sig)}"


def decode_token(token: str) -> dict:
    """
    Decode dan verifikasi JWT token.
    Raise HTTPException 401 jika invalid atau expired.
    """
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Format token tidak valid.")

        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}"
        secret = _get_secret()

        expected_sig = hmac.new(
            secret.encode(),
            signing_input.encode(),
            hashlib.sha256,
        ).digest()

        actual_sig = _b64url_decode(sig_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("Signature tidak valid.")

        payload = json.loads(_b64url_decode(payload_b64))

        now = int(datetime.now(timezone.utc).timestamp())
        if payload.get("exp", 0) < now:
            raise ValueError("Token sudah expired.")

        return payload

    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception:
        raise HTTPException(status_code=401, detail="Token tidak valid.")


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Dependency — pastikan request membawa token admin yang valid."""
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Token diperlukan. Silakan login terlebih dahulu.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/login")
def login(body: LoginRequest):
    """Login admin. Kembalikan JWT token jika kredensial valid."""
    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD", "admin123")

    # Bandingkan secara constant-time untuk cegah timing attack
    username_ok = hmac.compare_digest(body.username.strip(), admin_username)
    password_ok = hmac.compare_digest(body.password, admin_password)

    if not (username_ok and password_ok):
        logger.warning(f"Login gagal untuk username: '{body.username}'")
        raise HTTPException(
            status_code=401,
            detail="Username atau password salah.",
        )

    token = create_token({"sub": body.username, "role": "admin"})

    logger.info(f"Admin login berhasil: {body.username}")
    return {
        "success": True,
        "access_token": token,
        "token_type": "bearer",
        "expires_in_hours": 8,
    }


@router.get("/verify")
def verify_token(admin: dict = Depends(get_current_admin)):
    """Verifikasi apakah token masih valid."""
    return {
        "valid": True,
        "username": admin.get("sub"),
        "role": admin.get("role"),
    }
