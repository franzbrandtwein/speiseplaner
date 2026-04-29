"""Shared infrastructure: DB, auth helpers, storage, email, push notifications"""
import os
import json
import logging
import hashlib
import secrets
import smtplib
import configparser
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import HTTPException, Request, Depends
from motor.motor_asyncio import AsyncIOMotorClient
from pywebpush import webpush, WebPushException

from models import User

# ============ ENV / LOGGING ============

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("kochplaner")

# ============ MONGODB ============

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# ============ LOCAL FILE UPLOAD STORAGE ============

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/var/speiseplaner_bilder"))
try:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    # Self-test: write & delete a probe file to validate permissions early
    _probe = UPLOAD_DIR / ".write_probe"
    _probe.write_bytes(b"ok")
    _probe.unlink()
    logger.info(f"UPLOAD_DIR is writable: {UPLOAD_DIR}")
except Exception as _e:
    logger.error(f"UPLOAD_DIR not writable ({UPLOAD_DIR}): {type(_e).__name__}: {_e}")

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")  # used by LLM-based recipe import
APP_NAME = "kochplaner"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


def _safe_path(rel_path: str) -> Path:
    """Resolve and ensure the path stays inside UPLOAD_DIR (anti directory traversal)."""
    target = (UPLOAD_DIR / rel_path).resolve()
    if not str(target).startswith(str(UPLOAD_DIR.resolve())):
        raise ValueError("Invalid path")
    return target


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Save uploaded bytes to local filesystem at UPLOAD_DIR/<path>."""
    target = _safe_path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {"path": path, "size": len(data), "content_type": content_type}


def get_object(path: str):
    """Read bytes from UPLOAD_DIR/<path>. Raises FileNotFoundError if missing."""
    target = _safe_path(path)
    if not target.is_file():
        raise FileNotFoundError(path)
    data = target.read_bytes()
    # Infer content-type from extension
    ext = target.suffix.lower().lstrip(".")
    ct_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
              "webp": "image/webp", "gif": "image/gif"}
    return data, ct_map.get(ext, "application/octet-stream")


# ============ SMTP CONFIG ============

SMTP_CONFIG_PATH = Path("/etc/speisenplaner/smtp.conf")
smtp_config = {}
if SMTP_CONFIG_PATH.exists():
    _config = configparser.ConfigParser()
    _config.read(SMTP_CONFIG_PATH)
    if 'smtp' in _config:
        smtp_config = dict(_config['smtp'])


def send_invitation_email(recipient_email: str, inviter_name: str, group_name: str, invitation_token: str, base_url: str) -> bool:
    """Send invitation email via SMTP"""
    if not smtp_config:
        logger.warning("SMTP nicht konfiguriert - Einladung kann nicht per Email gesendet werden")
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = f"{smtp_config.get('sender_name', 'Speisenplaner')} <{smtp_config.get('sender_email', smtp_config.get('username'))}>"
        msg["To"] = recipient_email
        msg["Subject"] = f"Einladung zur Gruppe '{group_name}' im Speisenplaner"
        invitation_url = f"{base_url}/invite/{invitation_token}"

        text_content = f"""
Hallo,

{inviter_name} hat dich eingeladen, der Gruppe "{group_name}" im Speisenplaner beizutreten.

Klicke auf den folgenden Link, um die Einladung anzunehmen:
{invitation_url}

Die Einladung ist 7 Tage gültig.

Viele Grüße,
Dein Speisenplaner Team
        """

        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Inter', Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 20px; }}
        .container {{ max-width: 500px; margin: 0 auto; background: white; border-radius: 16px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }}
        h1 {{ color: #10B981; font-family: 'Playfair Display', serif; margin-bottom: 20px; }}
        p {{ color: #4B5563; line-height: 1.6; }}
        .button {{ display: inline-block; background: #10B981; color: white; padding: 14px 28px; text-decoration: none; border-radius: 50px; font-weight: 600; margin: 20px 0; }}
        .button:hover {{ background: #059669; }}
        .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9CA3AF; font-size: 14px; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>Du wurdest eingeladen!</h1>
        <p><strong>{inviter_name}</strong> hat dich eingeladen, der Gruppe <strong>"{group_name}"</strong> im Speisenplaner beizutreten.</p>
        <p>Als Gruppenmitglied könnt ihr gemeinsam:</p>
        <ul style="color: #4B5563;">
            <li>Rezepte teilen</li>
            <li>Einen gemeinsamen Speiseplan führen</li>
            <li>Einkaufslisten zusammen verwalten</li>
        </ul>
        <a href="{invitation_url}" class="button">Einladung annehmen</a>
        <div class="footer">
            <p>Die Einladung ist 7 Tage gültig.</p>
            <p>Falls du diese Einladung nicht erwartet hast, kannst du diese Email ignorieren.</p>
        </div>
    </div>
</body>
</html>
        """

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        server = smtplib.SMTP(smtp_config.get('server'), int(smtp_config.get('port', 587)))
        server.starttls()
        server.login(smtp_config.get('username'), smtp_config.get('password'))
        server.sendmail(smtp_config.get('username'), recipient_email, msg.as_string())
        server.quit()

        logger.info(f"Einladungs-Email an {recipient_email} gesendet")
        return True
    except Exception as e:
        logger.error(f"Fehler beim Senden der Email: {str(e)}")
        return False


# ============ AUTH HELPERS ============

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{hashed.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, hashed = stored_hash.split(':')
        new_hash = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return new_hash.hex() == hashed
    except Exception:
        return False


def _is_secure_request(request: Request) -> bool:
    if request.url.scheme == "https":
        return True
    if request.headers.get("x-forwarded-proto") == "https":
        return True
    return False


async def get_current_user(request: Request) -> User:
    """Extract and validate user from session token"""
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)


# ============ PUSH NOTIFICATIONS ============

VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY')
VAPID_CLAIMS_EMAIL = os.environ.get('VAPID_CLAIMS_EMAIL', 'mailto:admin@kochplaner.app')

WEEKDAY_MAP = {0: "montag", 1: "dienstag", 2: "mittwoch", 3: "donnerstag",
               4: "freitag", 5: "samstag", 6: "sonntag"}
WEEKDAY_LABELS = {0: "Montag", 1: "Dienstag", 2: "Mittwoch", 3: "Donnerstag",
                  4: "Freitag", 5: "Samstag", 6: "Sonntag"}
MEAL_LABELS = {"breakfast": "Frühstück", "lunch": "Mittagessen", "dinner": "Abendessen"}


async def send_push_to_user(user_id: str, title: str, body: str, url: str = "/meal-planner", tag: str = "general"):
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return 0
    subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    sent = 0
    for sub in subs:
        try:
            webpush(
                subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
                data=json.dumps({"title": title, "body": body, "url": url, "tag": tag}),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims={"sub": VAPID_CLAIMS_EMAIL}
            )
            sent += 1
        except WebPushException as e:
            if e.response and e.response.status_code in (404, 410):
                await db.push_subscriptions.delete_one({"subscription_id": sub["subscription_id"]})
            else:
                logger.error(f"Push error: {e}")
        except Exception as e:
            logger.error(f"Push error: {e}")
    return sent
