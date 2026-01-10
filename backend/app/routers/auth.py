"""Authentication routes for Google OAuth."""

import json
import secrets
from typing import Optional
from fastapi import APIRouter, HTTPException, Response, Request, Cookie
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.config import settings
from app.services.google_auth import google_auth_service

router = APIRouter()

# In-memory session storage (use Redis/database in production)
_sessions: dict[str, dict] = {}


class UserInfo(BaseModel):
    """User info response."""
    id: str
    email: str
    name: str
    picture: Optional[str] = None


class AuthStatus(BaseModel):
    """Auth status response."""
    authenticated: bool
    user: Optional[UserInfo] = None
    picker_api_key: Optional[str] = None
    client_id: Optional[str] = None


def _get_session(session_id: Optional[str]) -> Optional[dict]:
    """Get session data by ID."""
    if not session_id:
        return None
    return _sessions.get(session_id)


def _create_session(token_data: dict, user_info: dict) -> str:
    """Create a new session and return session ID."""
    session_id = secrets.token_urlsafe(32)
    _sessions[session_id] = {
        "tokens": token_data,
        "user": user_info,
    }
    return session_id


def _delete_session(session_id: str) -> None:
    """Delete a session."""
    if session_id in _sessions:
        del _sessions[session_id]


@router.get("/login")
async def login():
    """Start Google OAuth flow."""
    if not settings.google_client_id:
        raise HTTPException(status_code=500, detail="Google OAuth not configured")
    
    state = secrets.token_urlsafe(16)
    authorization_url, _ = google_auth_service.get_authorization_url(state=state)
    
    return RedirectResponse(url=authorization_url)


@router.get("/callback")
async def callback(code: str, state: Optional[str] = None, error: Optional[str] = None):
    """Handle Google OAuth callback."""
    if error:
        # Redirect to frontend with error
        return RedirectResponse(url=f"http://localhost:5173/?auth_error={error}")
    
    try:
        # Exchange code for tokens
        token_data = google_auth_service.exchange_code(code)
        
        # Get user info
        credentials = google_auth_service.get_credentials(token_data)
        user_info = google_auth_service.get_user_info(credentials)
        
        # Create session
        session_id = _create_session(token_data, user_info)
        
        # Redirect to frontend with session cookie
        response = RedirectResponse(url="http://localhost:5173/")
        response.set_cookie(
            key="session_id",
            value=session_id,
            httponly=True,
            secure=False,  # Set to True in production with HTTPS
            samesite="lax",
            max_age=60 * 60 * 24 * 7,  # 7 days
        )
        
        return response
        
    except Exception as e:
        print(f"OAuth callback error: {e}")
        return RedirectResponse(url=f"http://localhost:5173/?auth_error=callback_failed")


@router.get("/me", response_model=AuthStatus)
async def get_current_user(session_id: Optional[str] = Cookie(default=None)):
    """Get current authenticated user."""
    session = _get_session(session_id)
    
    if not session:
        return AuthStatus(
            authenticated=False,
            picker_api_key=settings.google_picker_api_key,
            client_id=settings.google_client_id,
        )
    
    return AuthStatus(
        authenticated=True,
        user=UserInfo(**session["user"]),
        picker_api_key=settings.google_picker_api_key,
        client_id=settings.google_client_id,
    )


@router.post("/logout")
async def logout(response: Response, session_id: Optional[str] = Cookie(default=None)):
    """Log out and clear session."""
    if session_id:
        _delete_session(session_id)
    
    response.delete_cookie(key="session_id")
    return {"success": True}


@router.get("/tokens")
async def get_tokens(session_id: Optional[str] = Cookie(default=None)):
    """Get current tokens (for Drive API calls)."""
    session = _get_session(session_id)
    
    if not session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    return session["tokens"]


def get_credentials_from_session(session_id: Optional[str]):
    """Helper to get Google credentials from session."""
    session = _get_session(session_id)
    if not session:
        return None
    
    token_data = session["tokens"]
    credentials = google_auth_service.get_credentials(token_data)
    
    # Refresh if expired
    if credentials.expired:
        credentials = google_auth_service.refresh_credentials(credentials)
        # Update session with new tokens
        session["tokens"]["access_token"] = credentials.token
    
    return credentials
