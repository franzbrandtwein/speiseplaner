"""Group management & invitations"""
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Depends

from core import db, get_current_user, send_invitation_email
from models import User, Group, GroupCreate, Invitation, InvitationCreate

router = APIRouter(prefix="/api")


@router.post("/groups")
async def create_group(data: GroupCreate, user: User = Depends(get_current_user)):
    group = Group(name=data.name, owner_id=user.user_id, member_ids=[user.user_id])
    group_doc = group.model_dump()
    group_doc['created_at'] = group_doc['created_at'].isoformat()
    await db.groups.insert_one(group_doc)
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"group_id": group.group_id}})
    return {"group_id": group.group_id, "name": group.name, "message": "Gruppe erstellt"}


@router.get("/groups/my")
async def get_my_group(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    if not group_id:
        return {"group": None, "members": [], "invitations": []}

    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        return {"group": None, "members": [], "invitations": []}

    members = await db.users.find(
        {"user_id": {"$in": group.get("member_ids", [])}},
        {"_id": 0, "password_hash": 0}
    ).to_list(100)

    invitations = []
    if group.get("owner_id") == user.user_id:
        invitations = await db.invitations.find(
            {"group_id": group_id, "status": "pending"}, {"_id": 0}
        ).to_list(100)

    return {
        "group": group, "members": members, "invitations": invitations,
        "is_owner": group.get("owner_id") == user.user_id
    }


@router.post("/groups/invite")
async def invite_to_group(data: InvitationCreate, request: Request, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")

    if not group_id:
        raise HTTPException(status_code=400, detail="Du bist in keiner Gruppe")

    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(status_code=404, detail="Gruppe nicht gefunden")

    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user and existing_user.get("group_id") == group_id:
        raise HTTPException(status_code=400, detail="Diese Person ist bereits Mitglied")

    existing_invite = await db.invitations.find_one({
        "group_id": group_id, "invitee_email": data.email, "status": "pending"
    }, {"_id": 0})
    if existing_invite:
        raise HTTPException(status_code=400, detail="Einladung wurde bereits gesendet")

    invitation = Invitation(group_id=group_id, inviter_id=user.user_id, invitee_email=data.email)
    inv_doc = invitation.model_dump()
    inv_doc['created_at'] = inv_doc['created_at'].isoformat()
    inv_doc['expires_at'] = inv_doc['expires_at'].isoformat()
    await db.invitations.insert_one(inv_doc)

    base_url = str(request.base_url).rstrip('/')
    referer = request.headers.get("referer", "")
    if referer:
        parsed = urlparse(referer)
        frontend_url = f"{parsed.scheme}://{parsed.netloc}"
    else:
        frontend_url = base_url.replace(":8001", ":3000")

    email_sent = send_invitation_email(
        recipient_email=data.email, inviter_name=user.name,
        group_name=group["name"], invitation_token=invitation.token,
        base_url=frontend_url
    )

    return {
        "message": "Einladung erstellt",
        "email_sent": email_sent,
        "invitation_token": invitation.token,
        "invitation_link": f"{frontend_url}/invite/{invitation.token}"
    }


@router.get("/invitations/{token}")
async def get_invitation(token: str):
    invitation = await db.invitations.find_one({"token": token}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden")

    if invitation["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Einladung wurde bereits {invitation['status']}")

    expires_at = invitation["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.invitations.update_one({"token": token}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=400, detail="Einladung ist abgelaufen")

    group = await db.groups.find_one({"group_id": invitation["group_id"]}, {"_id": 0})
    inviter = await db.users.find_one({"user_id": invitation["inviter_id"]}, {"_id": 0, "password_hash": 0})

    return {
        "invitation": invitation,
        "group_name": group["name"] if group else "Unbekannt",
        "inviter_name": inviter["name"] if inviter else "Unbekannt"
    }


@router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, user: User = Depends(get_current_user)):
    invitation = await db.invitations.find_one({"token": token, "status": "pending"}, {"_id": 0})
    if not invitation:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden oder bereits verwendet")

    group_id = invitation["group_id"]
    await db.groups.update_one({"group_id": group_id}, {"$addToSet": {"member_ids": user.user_id}})
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"group_id": group_id}})
    await db.invitations.update_one({"token": token}, {"$set": {"status": "accepted"}})

    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    return {"message": "Einladung angenommen", "group_name": group["name"]}


@router.post("/groups/leave")
async def leave_group(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    if not group_id:
        raise HTTPException(status_code=400, detail="Du bist in keiner Gruppe")

    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if group and group.get("owner_id") == user.user_id:
        other_members = [m for m in group.get("member_ids", []) if m != user.user_id]
        if other_members:
            raise HTTPException(status_code=400, detail="Als Owner musst du erst einen neuen Owner bestimmen oder alle Mitglieder entfernen")
        else:
            await db.groups.delete_one({"group_id": group_id})
    else:
        await db.groups.update_one({"group_id": group_id}, {"$pull": {"member_ids": user.user_id}})

    await db.users.update_one({"user_id": user.user_id}, {"$unset": {"group_id": ""}})
    return {"message": "Gruppe verlassen"}
