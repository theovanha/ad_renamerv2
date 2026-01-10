"""Google OAuth authentication service."""

import json
from typing import Optional
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build

from app.config import settings


class GoogleAuthService:
    """Handle Google OAuth flow and token management."""
    
    def __init__(self):
        self.client_config = {
            "web": {
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [settings.google_redirect_uri],
            }
        }
    
    def get_authorization_url(self, state: Optional[str] = None) -> tuple[str, str]:
        """Generate the Google OAuth authorization URL.
        
        Returns:
            Tuple of (authorization_url, state)
        """
        flow = Flow.from_client_config(
            self.client_config,
            scopes=settings.google_scopes,
            redirect_uri=settings.google_redirect_uri,
        )
        
        authorization_url, state = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        
        return authorization_url, state
    
    def exchange_code(self, code: str) -> dict:
        """Exchange authorization code for tokens.
        
        Args:
            code: The authorization code from Google callback
            
        Returns:
            Dict with access_token, refresh_token, and expiry
        """
        flow = Flow.from_client_config(
            self.client_config,
            scopes=settings.google_scopes,
            redirect_uri=settings.google_redirect_uri,
        )
        
        flow.fetch_token(code=code)
        credentials = flow.credentials
        
        return {
            "access_token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
        }
    
    def get_credentials(self, token_data: dict) -> Credentials:
        """Create Credentials object from stored token data."""
        return Credentials(
            token=token_data.get("access_token"),
            refresh_token=token_data.get("refresh_token"),
            token_uri=token_data.get("token_uri", "https://oauth2.googleapis.com/token"),
            client_id=token_data.get("client_id", settings.google_client_id),
            client_secret=token_data.get("client_secret", settings.google_client_secret),
        )
    
    def get_user_info(self, credentials: Credentials) -> dict:
        """Get user info from Google.
        
        Returns:
            Dict with id, email, name, picture
        """
        service = build("oauth2", "v2", credentials=credentials)
        user_info = service.userinfo().get().execute()
        return {
            "id": user_info.get("id"),
            "email": user_info.get("email"),
            "name": user_info.get("name"),
            "picture": user_info.get("picture"),
        }
    
    def refresh_credentials(self, credentials: Credentials) -> Credentials:
        """Refresh expired credentials."""
        if credentials.expired and credentials.refresh_token:
            from google.auth.transport.requests import Request
            credentials.refresh(Request())
        return credentials


# Global instance
google_auth_service = GoogleAuthService()
