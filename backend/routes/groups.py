"""Group management & invitations – Multi-Gruppen-Unterstützung"""
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, Request, Depends

from core import db, get_current_user, send_invitation_email
from models import User, Group, GroupCreate, Invitation, InvitationCreate

router = APIRouter(prefix="/api")


async def _get_group_for_user(group_id: str, user_id: str):
    """Gibt Gruppe zurück wenn user Mitglied ist, sonst 403."""
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    if not group:
        raise HTTPException(404, "Gruppe nicht gefunden")
    if user_id not in group.get("member_ids", []):
        raise HTTPException(403, "Kein Mitglied dieser Gruppe")
    return group


@router.get("/groups")
async def list_my_groups(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    active_gid = user_doc.get("group_id")

    # Ground-Truth: alle Gruppen in denen der User Mitglied ist
    groups = await db.groups.find(
        {"member_ids": user.user_id}, {"_id": 0}
    ).to_list(100)

    # group_ids am User-Dokument mit tatsächlicher Mitgliedschaft synchronisieren
    actual_ids = [g["group_id"] for g in groups]
    if set(actual_ids) != set(user_doc.get("group_ids", [])):
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {"group_ids": actual_ids}}
        )

    # Aktive Gruppe validieren: falls ungültig erste verfügbare nehmen
    if active_gid and active_gid not in actual_ids:
        active_gid = actual_ids[0] if actual_ids else None
        await db.users.update_one(
            {"user_id": user.user_id},
            {"$set": {"group_id": active_gid}}
        )

    if not groups:
        return {"groups": [], "active_group_id": None}

    result = []
    for g in groups:
        members = await db.users.find(
            {"user_id": {"$in": g.get("member_ids", [])}},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}
        ).to_list(100)
        result.append({**g, "members": members, "is_owner": g.get("owner_id") == user.user_id})
    return {"groups": result, "active_group_id": active_gid}


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
    return {"group": group, "members": members, "invitations": invitations, "is_owner": group.get("owner_id") == user.user_id}


@router.post("/groups")
async def create_group(data: GroupCreate, user: User = Depends(get_current_user)):
    group = Group(name=data.name, owner_id=user.user_id, member_ids=[user.user_id])
    group_doc = group.model_dump()
    group_doc['created_at'] = group_doc['created_at'].isoformat()
    await db.groups.insert_one(group_doc)
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    active = user_doc.get("group_id")
    update = {"$addToSet": {"group_ids": group.group_id}}
    if not active:
        update["$set"] = {"group_id": group.group_id}
    await db.users.update_one({"user_id": user.user_id}, update)
    return {"group_id": group.group_id, "name": group.name, "message": "Gruppe erstellt"}


@router.put("/groups/switch/{group_id}")
async def switch_active_group(group_id: str, user: User = Depends(get_current_user)):
    await _get_group_for_user(group_id, user.user_id)
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {"group_id": group_id}, "$addToSet": {"group_ids": group_id}}
    )
    return {"message": "Aktive Gruppe gewechselt", "group_id": group_id}


@router.get("/groups/{group_id}")
async def get_group(group_id: str, user: User = Depends(get_current_user)):
    group = await _get_group_for_user(group_id, user.user_id)
    members = await db.users.find(
        {"user_id": {"$in": group.get("member_ids", [])}},
        {"_id": 0, "user_id": 1, "name": 1, "email": 1, "picture": 1}
    ).to_list(100)
    invitations = []
    if group.get("owner_id") == user.user_id:
        invitations = await db.invitations.find(
            {"group_id": group_id, "status": "pending"}, {"_id": 0}
        ).to_list(100)
    return {**group, "members": members, "invitations": invitations, "is_owner": group.get("owner_id") == user.user_id}


@router.delete("/groups/{group_id}/members/{member_id}")
async def remove_member(group_id: str, member_id: str, user: User = Depends(get_current_user)):
    group = await _get_group_for_user(group_id, user.user_id)
    if group.get("owner_id") != user.user_id:
        raise HTTPException(403, "Nur der Owner kann Mitglieder entfernen")
    if member_id == user.user_id:
        raise HTTPException(400, "Nutze 'Gruppe verlassen' um dich selbst zu entfernen")
    await db.groups.update_one({"group_id": group_id}, {"$pull": {"member_ids": member_id}})
    member_doc = await db.users.find_one({"user_id": member_id}, {"_id": 0})
    if member_doc:
        remaining = [g for g in member_doc.get("group_ids", []) if g != group_id]
        updates = {"$pull": {"group_ids": group_id}}
        if member_doc.get("group_id") == group_id:
            updates["$set"] = {"group_id": remaining[0] if remaining else None}
        await db.users.update_one({"user_id": member_id}, updates)
    return {"message": "Mitglied entfernt"}


@router.post("/groups/invite")
async def invite_to_group(data: InvitationCreate, request: Request, user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    if not group_id:
        raise HTTPException(400, "Du bist in keiner Gruppe")
    return await invite_to_specific_group(group_id, data, request, user)


@router.post("/groups/{group_id}/invite")
async def invite_to_specific_group(group_id: str, data: InvitationCreate, request: Request, user: User = Depends(get_current_user)):
    group = await _get_group_for_user(group_id, user.user_id)
    existing_user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if existing_user and group_id in (existing_user.get("group_ids") or [existing_user.get("group_id")]):
        raise HTTPException(400, "Diese Person ist bereits Mitglied")
    existing_invite = await db.invitations.find_one({"group_id": group_id, "invitee_email": data.email, "status": "pending"}, {"_id": 0})
    if existing_invite:
        raise HTTPException(400, "Einladung wurde bereits gesendet")
    invitation = Invitation(group_id=group_id, inviter_id=user.user_id, invitee_email=data.email)
    inv_doc = invitation.model_dump()
    inv_doc['created_at'] = inv_doc['created_at'].isoformat()
    inv_doc['expires_at'] = inv_doc['expires_at'].isoformat()
    await db.invitations.insert_one(inv_doc)
    base_url = str(request.base_url).rstrip('/')
    referer = request.headers.get("referer", "")
    frontend_url = f"{urlparse(referer).scheme}://{urlparse(referer).netloc}" if referer else base_url.replace(":8001", ":3000")
    email_sent = send_invitation_email(
        recipient_email=data.email, inviter_name=user.name,
        group_name=group["name"], invitation_token=invitation.token, base_url=frontend_url
    )
    return {"message": "Einladung erstellt", "email_sent": email_sent, "invitation_token": invitation.token, "invitation_link": f"{frontend_url}/invite/{invitation.token}"}


@router.get("/invitations/{token}")
async def get_invitation(token: str):
    invitation = await db.invitations.find_one({"token": token}, {"_id": 0})
    if not invitation:
        raise HTTPException(404, "Einladung nicht gefunden")
    if invitation["status"] != "pending":
        raise HTTPException(400, f"Einladung wurde bereits {invitation['status']}")
    expires_at = invitation["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        await db.invitations.update_one({"token": token}, {"$set": {"status": "expired"}})
        raise HTTPException(400, "Einladung ist abgelaufen")
    group = await db.groups.find_one({"group_id": invitation["group_id"]}, {"_id": 0})
    inviter = await db.users.find_one({"user_id": invitation["inviter_id"]}, {"_id": 0, "password_hash": 0})
    return {"invitation": invitation, "group_name": group["name"] if group else "Unbekannt", "inviter_name": inviter["name"] if inviter else "Unbekannt"}


@router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, user: User = Depends(get_current_user)):
    invitation = await db.invitations.find_one({"token": token, "status": "pending"}, {"_id": 0})
    if not invitation:
        raise HTTPException(404, "Einladung nicht gefunden oder bereits verwendet")
    group_id = invitation["group_id"]
    await db.groups.update_one({"group_id": group_id}, {"$addToSet": {"member_ids": user.user_id}})
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    update = {"$addToSet": {"group_ids": group_id}}
    if not user_doc.get("group_id"):
        update["$set"] = {"group_id": group_id}
    await db.users.update_one({"user_id": user.user_id}, update)
    await db.invitations.update_one({"token": token}, {"$set": {"status": "accepted"}})
    group = await db.groups.find_one({"group_id": group_id}, {"_id": 0})
    return {"message": "Einladung angenommen", "group_name": group["name"]}


@router.post("/groups/leave")
async def leave_active_group(user: User = Depends(get_current_user)):
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    group_id = user_doc.get("group_id")
    if not group_id:
        raise HTTPException(400, "Du bist in keiner Gruppe")
    return await leave_specific_group(group_id, user)


@router.post("/groups/{group_id}/leave")
async def leave_specific_group(group_id: str, user: User = Depends(get_current_user)):
    group = await _get_group_for_user(group_id, user.user_id)
    if group.get("owner_id") == user.user_id:
        other_members = [m for m in group.get("member_ids", []) if m != user.user_id]
        if other_members:
            raise HTTPException(400, "Als Owner musst du erst alle Mitglieder entfernen")
        await db.groups.delete_one({"group_id": group_id})
        await db.invitations.delete_many({"group_id": group_id})
    else:
        await db.groups.update_one({"group_id": group_id}, {"$pull": {"member_ids": user.user_id}})
    user_doc = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    remaining = [g for g in user_doc.get("group_ids", []) if g != group_id]
    updates = {"$pull": {"group_ids": group_id}}
    if user_doc.get("group_id") == group_id:
        updates["$set"] = {"group_id": remaining[0] if remaining else None}
    await db.users.update_one({"user_id": user.user_id}, updates)
    return {"message": "Gruppe verlassen", "new_active": remaining[0] if remaining else None}


@router.delete("/groups/{group_id}")
async def delete_group(group_id: str, user: User = Depends(get_current_user)):
    group = await _get_group_for_user(group_id, user.user_id)
    if group.get("owner_id") != user.user_id:
        raise HTTPException(403, "Nur der Owner kann die Gruppe löschen")
    for member_id in group.get("member_ids", []):
        m_doc = await db.users.find_one({"user_id": member_id}, {"_id": 0})
        if not m_doc:
            continue
        remaining = [g for g in m_doc.get("group_ids", []) if g != group_id]
        upd = {"$pull": {"group_ids": group_id}}
        if m_doc.get("group_id") == group_id:
            upd["$set"] = {"group_id": remaining[0] if remaining else None}
        await db.users.update_one({"user_id": member_id}, upd)
    await db.groups.delete_one({"group_id": group_id})
    await db.invitations.delete_many({"group_id": group_id})
    return {"message": "Gruppe gelöscht"}
