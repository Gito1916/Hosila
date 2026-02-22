"""
Organisation management API routes.

Provides endpoints for managing organisations, hotels within an org,
and org membership. Only org_owner can create hotels and manage members.
Hotel-level managers cannot create org-level accounts.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.database import get_db
from app.middleware.tenant import TenantContext, get_tenant


router = APIRouter(prefix="/organisations", tags=["Organisations"])


# ── Schemas ──────────────────────────────────────────────────────

class OrgResponse(BaseModel):
    id: str
    name: str
    owner_id: str
    created_at: str


class HotelInOrg(BaseModel):
    id: str
    name: str


class CreateHotelRequest(BaseModel):
    name: str
    address: str | None = None
    phone: str | None = None
    email: str | None = None


class OrgMemberResponse(BaseModel):
    id: str
    user_id: str
    role: str
    hotel_id: str | None
    created_at: str


class InviteMemberRequest(BaseModel):
    """Invite a user to the organisation by their auth user ID."""
    user_id: str
    role: str = "org_admin"  # org_owner | org_admin
    hotel_id: str | None = None  # None = access to all hotels


# ── Endpoints ────────────────────────────────────────────────────

@router.get("/me", response_model=OrgResponse)
async def get_my_organisation(
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's organisation."""
    if not tenant.org_id:
        raise HTTPException(status_code=404, detail="No organisation found.")

    result = await db.execute(
        text("SELECT id, name, owner_id, created_at FROM organisations WHERE id = :org_id"),
        {"org_id": tenant.org_id},
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Organisation not found.")

    return OrgResponse(
        id=str(row.id),
        name=row.name,
        owner_id=str(row.owner_id),
        created_at=str(row.created_at),
    )


@router.get("/hotels", response_model=list[HotelInOrg])
async def list_org_hotels(
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all hotels accessible to the current user within their org."""
    result = await db.execute(
        text("SELECT id, name FROM hotels WHERE id = ANY(:ids) ORDER BY name"),
        {"ids": tenant.accessible_hotel_ids},
    )
    return [HotelInOrg(id=str(r.id), name=r.name) for r in result.fetchall()]


@router.post("/hotels", response_model=HotelInOrg, status_code=201)
async def create_hotel(
    body: CreateHotelRequest,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """Add a new hotel to the organisation. Only org_owner can do this."""
    if not tenant.is_org_owner:
        raise HTTPException(
            status_code=403,
            detail="Only organisation owners can create new hotels.",
        )

    result = await db.execute(
        text("""
            INSERT INTO hotels (name, address, phone, email, tenant_id, org_id)
            VALUES (:name, :address, :phone, :email, :tenant_id, :org_id)
            RETURNING id, name
        """),
        {
            "name": body.name,
            "address": body.address,
            "phone": body.phone,
            "email": body.email,
            "tenant_id": tenant.user_id,
            "org_id": tenant.org_id,
        },
    )
    row = result.first()
    await db.commit()

    return HotelInOrg(id=str(row.id), name=row.name)


@router.get("/members", response_model=list[OrgMemberResponse])
async def list_org_members(
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """List all members in the organisation. Only org-level users can see this."""
    if not tenant.is_org_level:
        raise HTTPException(
            status_code=403,
            detail="Only organisation-level users can view members.",
        )

    result = await db.execute(
        text("""
            SELECT id, user_id, role, hotel_id, created_at
            FROM org_members
            WHERE org_id = :org_id
            ORDER BY created_at
        """),
        {"org_id": tenant.org_id},
    )
    return [
        OrgMemberResponse(
            id=str(r.id),
            user_id=str(r.user_id),
            role=r.role,
            hotel_id=str(r.hotel_id) if r.hotel_id else None,
            created_at=str(r.created_at),
        )
        for r in result.fetchall()
    ]


@router.post("/members", response_model=OrgMemberResponse, status_code=201)
async def invite_member(
    body: InviteMemberRequest,
    tenant: TenantContext = Depends(get_tenant),
    db: AsyncSession = Depends(get_db),
):
    """
    Add a member to the organisation.
    Only org_owner can invite org-level users.
    Hotel-level managers CANNOT create org-level accounts.
    """
    if not tenant.is_org_owner:
        raise HTTPException(
            status_code=403,
            detail="Only organisation owners can add members.",
        )

    if body.role not in ("org_owner", "org_admin"):
        raise HTTPException(
            status_code=400,
            detail="Role must be 'org_owner' or 'org_admin'.",
        )

    # Validate hotel_id if provided
    if body.hotel_id and body.hotel_id not in tenant.accessible_hotel_ids:
        raise HTTPException(
            status_code=400,
            detail="Specified hotel is not part of this organisation.",
        )

    result = await db.execute(
        text("""
            INSERT INTO org_members (org_id, user_id, role, hotel_id)
            VALUES (:org_id, :user_id, :role, :hotel_id)
            ON CONFLICT (org_id, user_id) DO UPDATE SET role = :role, hotel_id = :hotel_id
            RETURNING id, user_id, role, hotel_id, created_at
        """),
        {
            "org_id": tenant.org_id,
            "user_id": body.user_id,
            "role": body.role,
            "hotel_id": body.hotel_id,
        },
    )
    row = result.first()
    await db.commit()

    return OrgMemberResponse(
        id=str(row.id),
        user_id=str(row.user_id),
        role=row.role,
        hotel_id=str(row.hotel_id) if row.hotel_id else None,
        created_at=str(row.created_at),
    )
