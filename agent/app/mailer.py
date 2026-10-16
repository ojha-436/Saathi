"""Outgoing email (invites). Plain SMTP from the standard library, so any provider works: Google Workspace or Gmail with an
app password, SendGrid, Brevo, Mailgun, Amazon SES. Configure on saathi-api with env vars, the password as a Secret Manager
mount (SMTP_PASSWORD). Without SMTP_HOST, email is off and admins share the personal invite link themselves.

Production sends from a Gmail mailbox kept only for this, saathi.invites@gmail.com: host, port and address are set by the
deploy step in .github/workflows/ci-cd.yml, the app password is the secret saathi-smtp-password (see README)."""
import os
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid, parseaddr

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))  # 587 = STARTTLS, 465 = implicit TLS
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").strip()
MAIL_FROM = os.getenv("MAIL_FROM", SMTP_USER)  # e.g. "Saathi <invites@yourcompany.com>"; must be allowed by the provider
if SMTP_HOST.endswith(("gmail.com", "googlemail.com")):
    # Google shows an app password as four groups of four ("abcd efgh ijkl mnop"); the spaces aren't part of it
    SMTP_PASSWORD = SMTP_PASSWORD.replace(" ", "")


def enabled() -> bool:
    # A mailbox login without its password fails every send: until the secret is mounted, email stays off
    return bool(SMTP_HOST and MAIL_FROM and (SMTP_PASSWORD or not SMTP_USER))


def sender() -> str:
    """The address invites come from, so admins can tell people where to look (and to check spam)."""
    return parseaddr(MAIL_FROM)[1] if enabled() else ""


def _header(v: str) -> str:
    """Names typed by people end up in headers: no line breaks (header injection), bounded length."""
    return re.sub(r"[\r\n]+", " ", v or "").strip()[:200]


def send(to: str, subject: str, text: str, html: str, reply_to: str | None = None, sender_name: str | None = None) -> None:
    """Sends one message or raises. Callers record the outcome; nothing retries silently."""
    if not enabled():
        raise RuntimeError("Email isn't set up on this server")
    msg = EmailMessage()
    from_name, from_addr = parseaddr(MAIL_FROM)
    # "Neha Verma via Saathi" tells the vendor who is inviting them while the address stays the verified sender
    msg["From"] = formataddr((_header(f"{sender_name} via Saathi" if sender_name else (from_name or "Saathi")), from_addr))
    msg["To"] = _header(to)
    msg["Subject"] = _header(subject)
    # smtplib adds neither; spam filters mark mail without them down
    msg["Date"] = formatdate(usegmt=True)
    msg["Message-ID"] = make_msgid("invite", domain=from_addr.rpartition("@")[2] or None)
    if reply_to:
        msg["Reply-To"] = _header(reply_to)
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    ctx = ssl.create_default_context()
    if SMTP_PORT == 465:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15, context=ctx) as s:
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
            s.starttls(context=ctx)
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD)
            s.send_message(msg)
