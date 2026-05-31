from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import io
import csv
import uuid
import logging
import json as jsonlib
import requests
import math
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Literal

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

# ----------------------------- MongoDB ---------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

# ----------------------------- App / Router ----------------------------
app = FastAPI(title="ICF Operations Hub")
api = APIRouter(prefix="/api")

JWT_ALGORITHM = "HS256"
JWT_SECRET = os.environ["JWT_SECRET"]
ACCESS_MIN = 15
REFRESH_DAYS = 7
LOCK_MIN = 15
MAX_FAILED = 5

# ----------------------------- Helpers ---------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": now_utc() + timedelta(minutes=ACCESS_MIN),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    payload = {
        "sub": user_id,
        "exp": now_utc() + timedelta(days=REFRESH_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie("access_token", access, httponly=True, secure=False,
                        samesite="lax", max_age=ACCESS_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False,
                        samesite="lax", max_age=REFRESH_DAYS * 86400, path="/")


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def serialize_user(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "email": doc["email"],
        "name": doc.get("name", ""),
        "role": doc.get("role", "crew"),
        "created_at": doc.get("created_at", now_utc()).isoformat()
        if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles: str):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles and user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return checker


# ----------------------------- Models ----------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)
    role: Literal["admin", "foreman", "crew"] = "crew"


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# Bracing
class BracingIn(BaseModel):
    wall_height_ft: float = Field(gt=0, le=20)
    wall_length_ft: float = Field(gt=0, le=500)
    wind_exposure: Literal["B", "C", "D"] = "B"  # ASCE 7
    pour_rate_ft_hr: float = Field(gt=0, le=15)
    concrete_temp_f: float = Field(ge=30, le=110)
    concrete_slump_in: float = Field(ge=2, le=10)
    core_thickness_in: float = Field(ge=4, le=14)
    safety_factor: float = Field(default=2.0, ge=1.5, le=3.0)


# Estimator
class EstimatorIn(BaseModel):
    wall_height_ft: float = Field(gt=0, le=20)
    wall_length_ft: float = Field(gt=0, le=2000)
    core_thickness_in: float = Field(ge=4, le=14)
    openings_sqft: float = Field(ge=0, default=0)
    rebar_spacing_in: float = Field(ge=8, le=24, default=16)
    rebar_size: Literal["#3", "#4", "#5", "#6"] = "#4"
    block_face_sqft: float = Field(default=5.33, ge=4, le=12)


# Equipment
class EquipmentIn(BaseModel):
    name: str
    category: Literal["brace", "waler", "strongback", "alignment", "scaffold", "tool", "other"]
    serial: Optional[str] = None
    condition: Literal["excellent", "good", "fair", "poor", "retired"] = "good"
    location: Optional[str] = None
    daily_rate: float = Field(ge=0, default=0)
    quantity: int = Field(ge=1, default=1)
    notes: Optional[str] = None


# Customer
class CustomerIn(BaseModel):
    name: str
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None


# Rental
class RentalItemIn(BaseModel):
    equipment_id: str
    quantity: int = Field(ge=1, default=1)
    daily_rate: Optional[float] = None


class RentalIn(BaseModel):
    customer_id: str
    items: List[RentalItemIn] = Field(min_length=1, max_length=30)
    start_date: str  # ISO date
    due_date: str
    deposit: float = Field(ge=0, default=0)
    notes: Optional[str] = None


class ReturnItemIn(BaseModel):
    equipment_id: str
    quantity: int = Field(ge=0)  # 0 = keep this item out, do not return any of it now
    condition: Optional[Literal["excellent", "good", "fair", "poor", "damaged", "lost"]] = None  # overrides default


class RentalReturnIn(BaseModel):
    return_date: str
    condition_on_return: Literal["excellent", "good", "fair", "poor", "damaged", "lost"] = "good"
    damage_fee: float = Field(ge=0, default=0)
    notes: Optional[str] = None
    items: Optional[List[ReturnItemIn]] = None  # None = full return of every outstanding item
    new_due_date: Optional[str] = None  # extend remaining items' due_date


# Maintenance
class MaintenanceIn(BaseModel):
    equipment_id: str
    service_date: str
    service_type: Literal["inspection", "repair", "cleaning", "replacement", "other"]
    performed_by: Optional[str] = None
    cost: float = Field(ge=0, default=0)
    next_service_date: Optional[str] = None
    notes: Optional[str] = None


# Bookings (tentative / pipeline)
class BookingIn(BaseModel):
    customer_name: str = Field(min_length=1)
    customer_id: Optional[str] = None  # link to existing customer if any
    contact: Optional[str] = None  # phone or email for leads not yet in DB
    equipment_id: str
    quantity: int = Field(ge=1, default=1)
    tentative_start_date: str
    tentative_end_date: str
    is_delivery: bool = False
    delivery_address: Optional[str] = None
    estimated_value: float = Field(ge=0, default=0)
    probability: Literal["hot", "warm", "cold"] = "warm"
    notes: Optional[str] = None


# ----------------------------- Auth Endpoints --------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    doc = {
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name.strip(),
        "role": payload.role,
        "created_at": now_utc(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    user_id = str(res.inserted_id)
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return serialize_user(doc)


@api.post("/auth/login")
async def login(payload: LoginIn, request: Request, response: Response):
    email = payload.email.lower().strip()
    ip = request.client.host if request.client else "unknown"
    ident = f"{ip}:{email}"

    # brute-force lockout check
    rec = await db.login_attempts.find_one({"identifier": ident})
    if rec and rec.get("failed", 0) >= MAX_FAILED:
        locked_until = rec.get("locked_until")
        if locked_until and locked_until > now_utc():
            raise HTTPException(status_code=429, detail="Too many failed attempts. Try again later.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        await db.login_attempts.update_one(
            {"identifier": ident},
            {"$inc": {"failed": 1},
             "$set": {"locked_until": now_utc() + timedelta(minutes=LOCK_MIN)}},
            upsert=True,
        )
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await db.login_attempts.delete_one({"identifier": ident})
    user_id = str(user["_id"])
    access = create_access_token(user_id, email)
    refresh = create_refresh_token(user_id)
    set_auth_cookies(response, access, refresh)
    return serialize_user(user)


@api.post("/auth/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


@api.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    rt = request.cookies.get("refresh_token")
    if not rt:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(rt, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        access = create_access_token(str(user["_id"]), user["email"])
        response.set_cookie("access_token", access, httponly=True, secure=False,
                            samesite="lax", max_age=ACCESS_MIN * 60, path="/")
        return {"ok": True}
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ----------------------------- Bracing Engine --------------------------
@api.post("/bracing/calculate")
async def bracing_calculate(payload: BracingIn, user: dict = Depends(get_current_user)):
    """
    Bracing calculation using ACI 347 lateral concrete pressure principles
    and standard ICF bracing practice (Fox Blocks / Nudura / BuildBlock guidelines).
    """
    H = payload.wall_height_ft
    L = payload.wall_length_ft
    R = payload.pour_rate_ft_hr
    T = max(payload.concrete_temp_f, 40.0)  # avoid div by zero / cold capping

    # ACI 347 formula for lateral pressure (psf) of plastic concrete:
    # P = Cw * Cc * [150 + 9000*R/T], P <= 150*H, capped at 3000 psf
    Cw = 1.0  # unit weight factor (normal-weight concrete)
    Cc = 1.0  # chemistry factor (Type I cement, no retarders)
    p_aci = Cw * Cc * (150.0 + (9000.0 * R) / T)
    p_hydro = 150.0 * H
    P_max = min(max(p_aci, 600.0), p_hydro, 3000.0)  # psf

    # Resultant lateral load per linear foot (lbs/lf) of wall
    # Triangular pressure distribution -> total resultant = 0.5 * P_max * H
    total_resultant_lf = 0.5 * P_max * H

    # Wind adjustment per ASCE 7 exposure category (multiplier on lateral load)
    wind_mult = {"B": 1.00, "C": 1.15, "D": 1.30}[payload.wind_exposure]
    total_resultant_lf *= wind_mult

    # ICF braces only resist the upper portion of pressure — through-form ties
    # carry the majority (~75-80%) of lateral pressure to the slab and into the
    # opposing form face. Per manufacturer engineering (NUDURA, Reachcraft),
    # brace working load is ~20-25% of total lateral resultant.
    brace_share = 0.22
    load_per_lf = total_resultant_lf * brace_share

    # All bracing is engineered strongback (NUDURA / Reachcraft Gen 1+2).
    # Working capacity per manufacturer datasheets: ~7500 lbs. Safety factor applied.
    brace_type = "strongback"
    brace_capacity = 7500.0
    allowable = brace_capacity / payload.safety_factor

    # Brace spacing (ft) = allowable per brace / load per linear foot
    spacing_calc = allowable / load_per_lf if load_per_lf > 0 else 8.0
    # Cap recommended max spacing at 6 ft (industry guideline), min 2 ft
    spacing = max(2.0, min(6.0, spacing_calc))

    # Brace count = ceil(L / spacing) + 1 for end braces
    brace_count = math.ceil(L / spacing) + 1

    # Tie-downs: 2 anchors per brace typically (top tie and base plate)
    tiedown_anchors = brace_count * 2
    # Hardware: wedge bolts to slab + lag screws to top plate
    wedge_anchors = brace_count
    lag_screws = brace_count * 4  # top plate connection (typ 4 per brace)

    # Walers (horizontal): every 4ft of height for stiffening, only if H >= 8
    waler_rows = math.floor(H / 4) if H >= 8 else 0
    waler_lf = waler_rows * L

    # Tie pattern: vertical ties every 16" oc both directions through ICF
    tie_pattern = "16\" o.c. both ways (vertical + horizontal) through-form ties"

    # Concrete pressure profile (for chart)
    profile = []
    for i in range(0, int(H * 4) + 1):
        h = i / 4.0  # every 3 inches
        # pressure increases linearly with depth from top, capped at P_max
        depth_from_top = H - h
        p = min(150.0 * depth_from_top, P_max)
        profile.append({"height_ft": round(h, 2), "pressure_psf": round(p, 1)})

    warnings = []
    if R > 7:
        warnings.append("Pour rate above 7 ft/hr exceeds ACI 347 simplified formula range. Reduce pour rate or consult engineer.")
    if T < 50:
        warnings.append("Concrete temperature below 50°F slows set time and increases lateral pressure. Tighten brace spacing.")
    if H > 10:
        warnings.append("Wall height >10 ft. Engineered bracing design strongly recommended.")
    if payload.concrete_slump_in > 6:
        warnings.append("High slump increases lateral pressure. Verify pressure assumptions.")

    result = {
        "input": payload.model_dump(),
        "lateral_pressure_psf": round(P_max, 1),
        "aci_pressure_psf": round(p_aci, 1),
        "hydrostatic_pressure_psf": round(p_hydro, 1),
        "load_per_lf": round(load_per_lf, 1),
        "total_resultant_per_lf": round(total_resultant_lf, 1),
        "brace_share_pct": round(brace_share * 100, 0),
        "wind_multiplier": wind_mult,
        "brace_type": brace_type,
        "brace_capacity_lbs": brace_capacity,
        "allowable_per_brace_lbs": round(allowable, 1),
        "recommended_spacing_ft": round(spacing, 2),
        "spacing_uncapped_ft": round(spacing_calc, 2),
        "brace_count": brace_count,
        "tiedown_anchors": tiedown_anchors,
        "wedge_anchors": wedge_anchors,
        "lag_screws": lag_screws,
        "waler_rows": waler_rows,
        "waler_linear_ft": waler_lf,
        "tie_pattern": tie_pattern,
        "safety_factor": payload.safety_factor,
        "pressure_profile": profile,
        "warnings": warnings,
        "calculated_at": now_utc().isoformat(),
    }

    # Save calculation history
    history = {
        "user_id": str(user["_id"]),
        "user_email": user["email"],
        "type": "bracing",
        "input": payload.model_dump(),
        "result": {k: v for k, v in result.items() if k != "pressure_profile"},
        "created_at": now_utc(),
    }
    await db.calculations.insert_one(history)
    return result


# ----------------------------- Quick Estimator -------------------------
@api.post("/estimator/calculate")
async def estimator_calculate(payload: EstimatorIn, user: dict = Depends(get_current_user)):
    H = payload.wall_height_ft
    L = payload.wall_length_ft
    core_in = payload.core_thickness_in
    wall_area = H * L - payload.openings_sqft
    if wall_area <= 0:
        raise HTTPException(status_code=400, detail="Wall area is zero or negative after openings.")

    # ICF block count (with 5% waste)
    blocks = math.ceil((wall_area / payload.block_face_sqft) * 1.05)

    # Concrete volume (cubic yards) = wall_area * core_thickness/12 / 27
    cy = (wall_area * (core_in / 12.0)) / 27.0
    cy_with_waste = cy * 1.05

    # Rebar (linear feet)
    # Horizontal courses: ceil(H * 12 / spacing) total runs each spans L
    spacing = payload.rebar_spacing_in
    horizontal_runs = math.ceil((H * 12) / spacing) + 1
    horizontal_lf = horizontal_runs * L
    vertical_runs = math.ceil((L * 12) / spacing) + 1
    vertical_lf = vertical_runs * H
    total_rebar_lf = horizontal_lf + vertical_lf
    # Weight lb/ft for #3=0.376 #4=0.668 #5=1.043 #6=1.502
    rebar_weight = {"#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502}[payload.rebar_size]
    rebar_lbs = total_rebar_lf * rebar_weight
    rebar_tons = rebar_lbs / 2000.0

    bom = [
        {"item": f"ICF blocks ({payload.block_face_sqft} sqft face)", "quantity": blocks, "unit": "ea"},
        {"item": f"Concrete ({core_in}\" core, 5% waste)", "quantity": round(cy_with_waste, 2), "unit": "cy"},
        {"item": f"Rebar {payload.rebar_size} @ {spacing}\" o.c. EW", "quantity": round(total_rebar_lf, 1), "unit": "lf"},
        {"item": f"Rebar {payload.rebar_size} total weight", "quantity": round(rebar_lbs, 1), "unit": "lbs"},
        {"item": "Foam adhesive", "quantity": math.ceil(blocks / 25), "unit": "tubes"},
        {"item": "Rebar ties", "quantity": math.ceil(total_rebar_lf / 8), "unit": "ea"},
        {"item": "Tie wire (16 ga)", "quantity": math.ceil(total_rebar_lf / 200), "unit": "rolls"},
    ]
    result = {
        "input": payload.model_dump(),
        "wall_area_sqft": round(wall_area, 1),
        "block_count": blocks,
        "concrete_cy": round(cy, 2),
        "concrete_cy_with_waste": round(cy_with_waste, 2),
        "rebar_horizontal_lf": round(horizontal_lf, 1),
        "rebar_vertical_lf": round(vertical_lf, 1),
        "rebar_total_lf": round(total_rebar_lf, 1),
        "rebar_total_lbs": round(rebar_lbs, 1),
        "rebar_total_tons": round(rebar_tons, 3),
        "bom": bom,
        "calculated_at": now_utc().isoformat(),
    }
    await db.calculations.insert_one({
        "user_id": str(user["_id"]),
        "user_email": user["email"],
        "type": "estimator",
        "input": payload.model_dump(),
        "result": result,
        "created_at": now_utc(),
    })
    return result


# ----------------------------- Equipment CRUD --------------------------
def serialize_equipment(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "category": doc["category"],
        "serial": doc.get("serial"),
        "condition": doc.get("condition", "good"),
        "location": doc.get("location"),
        "daily_rate": doc.get("daily_rate", 0),
        "quantity": doc.get("quantity", 1),
        "available": doc.get("available", doc.get("quantity", 1)),
        "notes": doc.get("notes"),
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@api.get("/equipment")
async def list_equipment(user: dict = Depends(get_current_user)):
    items = await db.equipment.find({}).sort("name", 1).to_list(1000)
    return [serialize_equipment(i) for i in items]


@api.post("/equipment")
async def create_equipment(payload: EquipmentIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["available"] = doc["quantity"]
    doc["created_at"] = now_utc()
    res = await db.equipment.insert_one(doc)
    doc["_id"] = res.inserted_id
    # log initial stock event
    await db.stock_adjustments.insert_one({
        "equipment_id": str(res.inserted_id),
        "delta": doc["quantity"],
        "reason": "Initial stock — added to inventory",
        "user_id": str(user["_id"]),
        "user_email": user["email"],
        "created_at": now_utc(),
    })
    return serialize_equipment(doc)


CSV_HEADERS = ["name", "category", "condition", "location", "daily_rate", "quantity", "serial", "notes"]
VALID_CATEGORIES = {"brace", "waler", "strongback", "alignment", "scaffold", "tool", "other"}
VALID_CONDITIONS = {"excellent", "good", "fair", "poor", "retired"}


@api.get("/equipment/template.csv")
async def csv_template(user: dict = Depends(get_current_user)):
    """Download a CSV template the user can fill out."""
    from fastapi.responses import PlainTextResponse
    sample_rows = [
        CSV_HEADERS,
        ["Wafer Brace - 9ft", "brace", "good", "Yard A", "4.50", "200", "WB-9-001", "Aluminum turnbuckle"],
        ["Strongback Brace - 12ft", "strongback", "good", "Yard A", "7.25", "80", "", "Engineered"],
        ["Waler 8ft Aluminum", "waler", "excellent", "Yard B", "3.00", "150", "", ""],
    ]
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in sample_rows:
        writer.writerow(row)
    return PlainTextResponse(
        buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="icf-inventory-template.csv"'},
    )


@api.post("/equipment/import")
async def import_equipment_csv(
    file: UploadFile = File(...),
    mode: str = "create",
    user: dict = Depends(get_current_user),
):
    """
    Import equipment from CSV.

    Modes:
      • create  — insert new rows only; skip rows whose serial/name already exists
      • update  — only update existing matched rows (set fields to CSV values); skip unmatched
      • add     — increment quantity of matched rows by CSV `quantity`; create row if no match

    Matching priority: `serial` (exact, when non-empty) → `name` (exact, case-insensitive).
    Expected columns (case-insensitive):
    name, category, condition, location, daily_rate, quantity, serial, notes
    """
    if mode not in {"create", "update", "add"}:
        raise HTTPException(status_code=400, detail="mode must be one of: create, update, add")

    fname = (file.filename or "").lower()
    if not fname.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a .csv")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="No header row found")

    created = []
    updated = []
    skipped = []
    errors = []
    row_index = 1
    for raw_row in reader:
        row_index += 1
        try:
            norm = {(k or "").strip().lower(): (v.strip() if isinstance(v, str) else v)
                    for k, v in raw_row.items() if k}
            name = norm.get("name") or ""
            serial = norm.get("serial") or ""
            if not name and not serial:
                raise ValueError("missing both 'name' and 'serial' — need at least one")

            qty_raw = norm.get("quantity") or norm.get("qty")
            rate_raw = norm.get("daily_rate") or norm.get("rate")

            # find existing match
            existing = None
            if serial:
                existing = await db.equipment.find_one({"serial": serial})
            if not existing and name:
                existing = await db.equipment.find_one({
                    "name": {"$regex": f"^{name}$", "$options": "i"}
                })

            if mode == "create":
                if existing:
                    skipped.append({"row": row_index, "name": name or serial, "reason": "already exists"})
                    continue
                if not name:
                    raise ValueError("'name' is required for create")
                data = _row_to_equipment(norm, name, qty_raw, rate_raw)
                res = await db.equipment.insert_one(data)
                data["_id"] = res.inserted_id
                await _log_stock(res.inserted_id, data["quantity"], f"CSV import — row {row_index}", user)
                created.append(serialize_equipment(data))

            elif mode == "update":
                if not existing:
                    skipped.append({"row": row_index, "name": name or serial, "reason": "no match found"})
                    continue
                # only set fields that are present (non-empty) in the row
                update_doc = {}
                if name:
                    update_doc["name"] = name
                if (norm.get("category") or "").lower() in VALID_CATEGORIES:
                    update_doc["category"] = norm["category"].lower()
                if (norm.get("condition") or "").lower() in VALID_CONDITIONS:
                    update_doc["condition"] = norm["condition"].lower()
                if norm.get("location") is not None and norm.get("location") != "":
                    update_doc["location"] = norm["location"]
                if rate_raw not in (None, ""):
                    update_doc["daily_rate"] = float(rate_raw)
                if serial:
                    update_doc["serial"] = serial
                if norm.get("notes"):
                    update_doc["notes"] = norm["notes"]
                qty_delta = 0
                if qty_raw not in (None, ""):
                    new_qty = int(float(qty_raw))
                    old_qty = existing.get("quantity", 1)
                    qty_delta = new_qty - old_qty
                    update_doc["quantity"] = new_qty
                    new_avail = max(0, existing.get("available", old_qty) + qty_delta)
                    update_doc["available"] = new_avail
                await db.equipment.update_one({"_id": existing["_id"]}, {"$set": update_doc})
                if qty_delta != 0:
                    await _log_stock(existing["_id"], qty_delta, f"CSV update — row {row_index}", user)
                refreshed = {**existing, **update_doc}
                updated.append(serialize_equipment(refreshed))

            else:  # mode == "add"
                if not existing:
                    if not name:
                        raise ValueError("'name' is required to create when no match found")
                    data = _row_to_equipment(norm, name, qty_raw, rate_raw)
                    res = await db.equipment.insert_one(data)
                    data["_id"] = res.inserted_id
                    await _log_stock(res.inserted_id, data["quantity"], f"CSV add — row {row_index} (new SKU)", user)
                    created.append(serialize_equipment(data))
                else:
                    if qty_raw in (None, ""):
                        skipped.append({"row": row_index, "name": name or serial, "reason": "no quantity to add"})
                        continue
                    delta = int(float(qty_raw))
                    new_qty = existing.get("quantity", 0) + delta
                    new_avail = existing.get("available", existing.get("quantity", 0)) + delta
                    if new_qty < 0 or new_avail < 0:
                        raise ValueError(f"adding {delta} would push qty below zero")
                    await db.equipment.update_one(
                        {"_id": existing["_id"]},
                        {"$set": {"quantity": new_qty, "available": new_avail}},
                    )
                    await _log_stock(existing["_id"], delta, f"CSV add — row {row_index}", user)
                    refreshed = {**existing, "quantity": new_qty, "available": new_avail}
                    updated.append(serialize_equipment(refreshed))

        except Exception as e:
            errors.append({
                "row": row_index,
                "error": str(e),
                "name": raw_row.get("name") or raw_row.get("Name", ""),
            })

    return {
        "mode": mode,
        "created_count": len(created),
        "updated_count": len(updated),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "errors": errors[:50],
        "skipped": skipped[:50],
        "created": created,
        "updated": updated,
    }


def _row_to_equipment(norm: dict, name: str, qty_raw, rate_raw) -> dict:
    cat = (norm.get("category") or "other").lower()
    cond = (norm.get("condition") or "good").lower()
    data = {
        "name": name,
        "category": cat if cat in VALID_CATEGORIES else "other",
        "condition": cond if cond in VALID_CONDITIONS else "good",
        "location": norm.get("location") or None,
        "daily_rate": float(rate_raw or 0),
        "quantity": int(float(qty_raw or 1)),
        "serial": norm.get("serial") or None,
        "notes": norm.get("notes") or None,
    }
    if data["quantity"] < 0:
        raise ValueError("quantity must be >= 0")
    data["available"] = data["quantity"]
    data["created_at"] = now_utc()
    return data


async def _log_stock(equipment_id, delta: int, reason: str, user: dict):
    await db.stock_adjustments.insert_one({
        "equipment_id": str(equipment_id),
        "delta": delta,
        "reason": reason,
        "user_id": str(user["_id"]),
        "user_email": user["email"],
        "created_at": now_utc(),
    })


@api.get("/equipment/{equipment_id}/history")
async def equipment_history(equipment_id: str, user: dict = Depends(get_current_user)):
    items = await db.stock_adjustments.find({"equipment_id": equipment_id}).sort("created_at", -1).to_list(500)
    return [{
        "id": str(i["_id"]),
        "delta": i["delta"],
        "reason": i.get("reason"),
        "user_email": i.get("user_email"),
        "created_at": i["created_at"].isoformat() if isinstance(i["created_at"], datetime) else i["created_at"],
    } for i in items]


@api.get("/equipment/{equipment_id}/availability")
async def equipment_availability(
    equipment_id: str,
    start: str,
    end: str,
    qty: Optional[int] = None,
    user: dict = Depends(get_current_user),
):
    """Per-day capacity check for a single SKU."""
    try:
        start_d = datetime.fromisoformat(start).date()
        end_d = datetime.fromisoformat(end).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be ISO YYYY-MM-DD")
    if end_d < start_d:
        raise HTTPException(status_code=400, detail="end must be on or after start")
    if (end_d - start_d).days > 366:
        raise HTTPException(status_code=400, detail="Range too large (max 366 days)")
    return await _check_sku_availability(equipment_id, start_d, end_d, qty)


async def _check_sku_availability(equipment_id: str, start_d, end_d, qty: Optional[int]):
    eq = await db.equipment.find_one({"_id": ObjectId(equipment_id)})
    if not eq:
        raise HTTPException(status_code=404, detail=f"Equipment not found: {equipment_id}")
    total_qty = eq.get("quantity", 0)

    rentals = await db.rentals.find({
        "$or": [
            {"items.equipment_id": equipment_id},
            {"equipment_id": equipment_id},  # legacy flat docs
        ],
        "status": {"$nin": ["returned", "lost"]},
    }).to_list(2000)
    bookings = await db.bookings.find({
        "equipment_id": equipment_id,
        "status": "tentative",
    }).to_list(2000)

    # build (start, end, qty) per rental — sum across all matching items in one rental
    rental_windows = []
    for r in rentals:
        items = rental_items(r)
        qty_for_sku = sum(
            max(0, it.get("quantity", 0) - it.get("returned_quantity", 0))
            for it in items if it["equipment_id"] == equipment_id
        )
        if qty_for_sku == 0:
            continue
        occ_start = r.get("start_date", "")
        occ_end = r.get("return_date") or r.get("due_date", "")
        rental_windows.append({
            "id": str(r["_id"]),
            "qty": qty_for_sku,
            "occ_start": occ_start,
            "occ_end": occ_end,
            "customer_id": r.get("customer_id"),
            "status": r.get("status"),
            "start_date": occ_start,
            "due_date": r.get("due_date"),
        })

    days = []
    min_available = total_qty
    worst_day = None
    blocked_dates = []
    conflicting_rental_ids = set()
    conflicting_bookings = set()

    cur = start_d
    while cur <= end_d:
        iso = cur.isoformat()
        on_rent = 0
        on_hold = 0
        for rw in rental_windows:
            if rw["occ_start"] <= iso <= rw["occ_end"]:
                on_rent += rw["qty"]
                conflicting_rental_ids.add(rw["id"])
        for b in bookings:
            occ_start = b.get("tentative_start_date", "")
            occ_end = b.get("tentative_end_date", "")
            if occ_start <= iso <= occ_end:
                on_hold += b.get("quantity", 0)
                conflicting_bookings.add(str(b["_id"]))
        available = total_qty - on_rent - on_hold
        sufficient = (qty is None) or (available >= qty)
        days.append({
            "date": iso,
            "weekday": cur.strftime("%a"),
            "on_rent": on_rent,
            "on_hold": on_hold,
            "available": available,
            "sufficient": sufficient,
        })
        if available < min_available:
            min_available = available
            worst_day = iso
        if not sufficient:
            blocked_dates.append(iso)
        cur += timedelta(days=1)

    conflict_rental_docs = []
    if conflicting_rental_ids:
        cust_ids = {ObjectId(rw["customer_id"]) for rw in rental_windows if rw["id"] in conflicting_rental_ids and rw.get("customer_id")}
        cust_map = {str(c["_id"]): c for c in await db.customers.find({"_id": {"$in": list(cust_ids)}}).to_list(1000)} if cust_ids else {}
        for rw in rental_windows:
            if rw["id"] not in conflicting_rental_ids:
                continue
            conflict_rental_docs.append({
                "id": rw["id"],
                "customer_name": cust_map.get(rw.get("customer_id"), {}).get("name", "Unknown"),
                "quantity": rw["qty"],
                "start_date": rw["start_date"],
                "due_date": rw["due_date"],
                "status": rw["status"],
            })
    conflict_booking_docs = []
    if conflicting_bookings:
        ids = [ObjectId(x) for x in conflicting_bookings]
        bs = await db.bookings.find({"_id": {"$in": ids}}).to_list(1000)
        for b in bs:
            conflict_booking_docs.append({
                "id": str(b["_id"]),
                "customer_name": b.get("customer_name", ""),
                "quantity": b.get("quantity", 0),
                "start_date": b.get("tentative_start_date"),
                "end_date": b.get("tentative_end_date"),
                "probability": b.get("probability", "warm"),
            })

    return {
        "equipment_id": equipment_id,
        "equipment_name": eq.get("name"),
        "total_quantity": total_qty,
        "qty_requested": qty,
        "start": start_d.isoformat(),
        "end": end_d.isoformat(),
        "overall_ok": all(d["sufficient"] for d in days),
        "min_available": min_available,
        "worst_day": worst_day,
        "blocked_dates": blocked_dates,
        "days": days,
        "conflicting_rentals": conflict_rental_docs,
        "conflicting_bookings": conflict_booking_docs,
    }


class CapacityItem(BaseModel):
    equipment_id: str
    qty: int = Field(ge=1)


class CapacityCheckIn(BaseModel):
    start: str
    end: str
    items: List[CapacityItem] = Field(min_length=1, max_length=20)


@api.post("/capacity/check")
async def capacity_check_multi(payload: CapacityCheckIn, user: dict = Depends(get_current_user)):
    """Per-day capacity check across multiple SKUs at once."""
    try:
        start_d = datetime.fromisoformat(payload.start).date()
        end_d = datetime.fromisoformat(payload.end).date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must be ISO YYYY-MM-DD")
    if end_d < start_d:
        raise HTTPException(status_code=400, detail="end must be on or after start")
    if (end_d - start_d).days > 366:
        raise HTTPException(status_code=400, detail="Range too large (max 366 days)")
    if len({i.equipment_id for i in payload.items}) != len(payload.items):
        raise HTTPException(status_code=400, detail="Duplicate equipment_id in items — merge them")

    results = []
    for item in payload.items:
        res = await _check_sku_availability(item.equipment_id, start_d, end_d, item.qty)
        results.append(res)

    overall_ok = all(r["overall_ok"] for r in results)
    blocked_skus = [r["equipment_name"] for r in results if not r["overall_ok"]]
    total_blocked_days = len({d for r in results for d in r["blocked_dates"]})

    return {
        "start": payload.start,
        "end": payload.end,
        "overall_ok": overall_ok,
        "blocked_skus": blocked_skus,
        "total_blocked_days": total_blocked_days,
        "items_count": len(results),
        "results": results,
    }


@api.patch("/equipment/{equipment_id}")
async def update_equipment(equipment_id: str, payload: EquipmentIn, user: dict = Depends(get_current_user)):
    doc = await db.equipment.find_one({"_id": ObjectId(equipment_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Equipment not found")
    update = payload.model_dump()
    # if quantity changed, adjust availability by same delta
    qty_delta = update["quantity"] - doc.get("quantity", 1)
    new_avail = max(0, doc.get("available", doc.get("quantity", 1)) + qty_delta)
    update["available"] = new_avail
    await db.equipment.update_one({"_id": ObjectId(equipment_id)}, {"$set": update})
    doc.update(update)
    return serialize_equipment(doc)


class StockAdjustIn(BaseModel):
    delta: int  # positive to add stock, negative to remove
    reason: Optional[str] = None


@api.post("/equipment/{equipment_id}/adjust")
async def adjust_stock(equipment_id: str, payload: StockAdjustIn, user: dict = Depends(get_current_user)):
    doc = await db.equipment.find_one({"_id": ObjectId(equipment_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Equipment not found")
    new_qty = doc.get("quantity", 1) + payload.delta
    new_avail = doc.get("available", doc.get("quantity", 1)) + payload.delta
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Quantity cannot go below zero")
    if new_avail < 0:
        raise HTTPException(status_code=400, detail=f"Cannot remove {-payload.delta} — only {doc.get('available', 0)} not on rent")
    await db.equipment.update_one(
        {"_id": ObjectId(equipment_id)},
        {"$set": {"quantity": new_qty, "available": new_avail}},
    )
    # log the adjustment for audit
    await db.stock_adjustments.insert_one({
        "equipment_id": equipment_id,
        "delta": payload.delta,
        "reason": payload.reason,
        "user_id": str(user["_id"]),
        "user_email": user["email"],
        "created_at": now_utc(),
    })
    doc["quantity"] = new_qty
    doc["available"] = new_avail
    return serialize_equipment(doc)


@api.delete("/equipment/{equipment_id}")
async def delete_equipment(equipment_id: str, user: dict = Depends(require_role("admin", "foreman"))):
    await db.equipment.delete_one({"_id": ObjectId(equipment_id)})
    return {"ok": True}


# ----------------------------- Customers -------------------------------
def serialize_customer(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "company": doc.get("company"),
        "phone": doc.get("phone"),
        "email": doc.get("email"),
        "address": doc.get("address"),
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@api.get("/customers")
async def list_customers(user: dict = Depends(get_current_user)):
    items = await db.customers.find({}).sort("name", 1).to_list(1000)
    return [serialize_customer(i) for i in items]


@api.post("/customers")
async def create_customer(payload: CustomerIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["created_at"] = now_utc()
    res = await db.customers.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_customer(doc)


# ----------------------------- Rentals ---------------------------------
def rental_items(doc: dict) -> list:
    """Return items list, migrating legacy flat (equipment_id/quantity) docs on the fly."""
    if doc.get("items"):
        return doc["items"]
    if doc.get("equipment_id"):
        return [{
            "equipment_id": doc["equipment_id"],
            "quantity": doc.get("quantity", 1),
            "daily_rate": doc.get("daily_rate", 0),
            "returned_quantity": 0,
        }]
    return []


def serialize_rental(doc: dict, eq_map: Optional[dict] = None, cust: Optional[dict] = None) -> dict:
    items = rental_items(doc)
    enriched = []
    for it in items:
        eq = (eq_map or {}).get(it["equipment_id"]) if eq_map else None
        returned = it.get("returned_quantity", 0)
        qty = it.get("quantity", 1)
        enriched.append({
            "equipment_id": it["equipment_id"],
            "equipment_name": (eq or {}).get("name"),
            "quantity": qty,
            "returned_quantity": returned,
            "outstanding": max(0, qty - returned),
            "daily_rate": it.get("daily_rate", 0),
        })
    total_qty = sum(i.get("quantity", 0) for i in items)
    total_outstanding = sum(i["outstanding"] for i in enriched)
    summary = (
        f"{enriched[0]['equipment_name']} × {enriched[0]['quantity']}"
        if len(enriched) == 1 else f"{len(enriched)} SKUs · {total_qty} units"
    )
    return {
        "id": str(doc["_id"]),
        "customer_id": doc["customer_id"],
        "customer_name": (cust or {}).get("name") if cust else doc.get("customer_name"),
        "items": enriched,
        "items_summary": summary,
        "total_quantity": total_qty,
        "total_outstanding": total_outstanding,
        "start_date": doc["start_date"],
        "due_date": doc["due_date"],
        "return_date": doc.get("return_date"),
        "deposit": doc.get("deposit", 0),
        "status": doc.get("status", "active"),
        "condition_on_return": doc.get("condition_on_return"),
        "damage_fee": doc.get("damage_fee", 0),
        "notes": doc.get("notes"),
        "returns": doc.get("returns", []),
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@api.get("/rentals")
async def list_rentals(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    items = await db.rentals.find(q).sort("start_date", -1).to_list(1000)
    # collect equipment + customer ids across all rentals (multi-item aware)
    eq_ids = set()
    cust_ids = set()
    for r in items:
        for it in rental_items(r):
            eq_ids.add(ObjectId(it["equipment_id"]))
        if r.get("customer_id"):
            cust_ids.add(ObjectId(r["customer_id"]))
    eq_map = {str(e["_id"]): e for e in await db.equipment.find({"_id": {"$in": list(eq_ids)}}).to_list(1000)} if eq_ids else {}
    cust_map = {str(c["_id"]): c for c in await db.customers.find({"_id": {"$in": list(cust_ids)}}).to_list(1000)} if cust_ids else {}
    return [serialize_rental(i, eq_map, cust_map.get(i["customer_id"])) for i in items]


@api.post("/rentals")
async def create_rental(payload: RentalIn, user: dict = Depends(get_current_user)):
    cust = await db.customers.find_one({"_id": ObjectId(payload.customer_id)})
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    # dedupe + verify availability for every item
    seen = set()
    items_resolved = []
    eq_map: dict = {}
    for it in payload.items:
        if it.equipment_id in seen:
            raise HTTPException(status_code=400, detail="Same SKU listed twice — merge the rows")
        seen.add(it.equipment_id)
        eq = await db.equipment.find_one({"_id": ObjectId(it.equipment_id)})
        if not eq:
            raise HTTPException(status_code=404, detail=f"Equipment not found: {it.equipment_id}")
        avail = eq.get("available", eq.get("quantity", 1))
        if it.quantity > avail:
            raise HTTPException(status_code=400, detail=f"Only {avail} {eq['name']} available — requested {it.quantity}")
        eq_map[str(eq["_id"])] = eq
        items_resolved.append({
            "equipment_id": it.equipment_id,
            "quantity": it.quantity,
            "returned_quantity": 0,
            "daily_rate": it.daily_rate if it.daily_rate is not None else eq.get("daily_rate", 0),
        })

    doc = {
        "customer_id": payload.customer_id,
        "items": items_resolved,
        "start_date": payload.start_date,
        "due_date": payload.due_date,
        "deposit": payload.deposit,
        "notes": payload.notes,
        "status": "active",
        "created_at": now_utc(),
        "created_by": str(user["_id"]),
    }
    res = await db.rentals.insert_one(doc)
    doc["_id"] = res.inserted_id
    # decrement availability for every item
    for it in items_resolved:
        await db.equipment.update_one({"_id": ObjectId(it["equipment_id"])}, {"$inc": {"available": -it["quantity"]}})
    return serialize_rental(doc, eq_map, cust)


@api.post("/rentals/{rental_id}/return")
async def return_rental(rental_id: str, payload: RentalReturnIn, user: dict = Depends(get_current_user)):
    rental = await db.rentals.find_one({"_id": ObjectId(rental_id)})
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    if rental.get("status") == "returned":
        raise HTTPException(status_code=400, detail="Rental already fully returned")

    items = rental_items(rental)
    # Normalize stored items in DB shape (in case legacy flat doc) so we can update in place
    if not rental.get("items"):
        await db.rentals.update_one({"_id": rental["_id"]}, {"$set": {"items": items}})
        rental["items"] = items

    # Build return plan: equipment_id -> {qty, condition}
    plan: dict = {}
    if payload.items is None:
        # full return — close every outstanding unit
        for it in items:
            outstanding = it.get("quantity", 0) - it.get("returned_quantity", 0)
            if outstanding > 0:
                plan[it["equipment_id"]] = {"qty": outstanding, "condition": payload.condition_on_return}
    else:
        for r in payload.items:
            if r.quantity <= 0:
                continue
            match = next((it for it in items if it["equipment_id"] == r.equipment_id), None)
            if not match:
                raise HTTPException(status_code=400, detail=f"Item {r.equipment_id} not on this rental")
            outstanding = match.get("quantity", 0) - match.get("returned_quantity", 0)
            if r.quantity > outstanding:
                raise HTTPException(
                    status_code=400,
                    detail=f"Returning {r.quantity} of {r.equipment_id} but only {outstanding} outstanding",
                )
            plan[r.equipment_id] = {"qty": r.quantity, "condition": r.condition or payload.condition_on_return}

    if not plan:
        raise HTTPException(status_code=400, detail="Nothing to return — every item has quantity 0")

    # Apply per-item updates: increment returned_quantity, adjust equipment availability
    return_event = {
        "date": payload.return_date,
        "user_email": user["email"],
        "default_condition": payload.condition_on_return,
        "damage_fee": payload.damage_fee,
        "notes": payload.notes,
        "items": [],
    }
    for eq_id, p in plan.items():
        # Update item.returned_quantity inside rental.items array
        await db.rentals.update_one(
            {"_id": rental["_id"], "items.equipment_id": eq_id},
            {"$inc": {"items.$.returned_quantity": p["qty"]}},
        )
        # adjust equipment stock
        if p["condition"] == "lost":
            await db.equipment.update_one(
                {"_id": ObjectId(eq_id)},
                {"$inc": {"quantity": -p["qty"]}},
            )
        else:
            await db.equipment.update_one(
                {"_id": ObjectId(eq_id)},
                {"$inc": {"available": p["qty"]}},
            )
            if p["condition"] in ("fair", "poor", "damaged"):
                cond_to_set = "fair" if p["condition"] == "fair" else "poor"
                await db.equipment.update_one(
                    {"_id": ObjectId(eq_id)},
                    {"$set": {"condition": cond_to_set}},
                )
        return_event["items"].append({
            "equipment_id": eq_id,
            "quantity": p["qty"],
            "condition": p["condition"],
        })

    # Reload rental to compute new status
    rental = await db.rentals.find_one({"_id": rental["_id"]})
    items = rental_items(rental)
    all_done = all((it.get("quantity", 0) - it.get("returned_quantity", 0)) <= 0 for it in items)
    has_partial = any(it.get("returned_quantity", 0) > 0 for it in items)
    new_status = "returned" if all_done else ("partial" if has_partial else rental.get("status", "active"))
    any_lost = any(p["condition"] == "lost" for p in plan.values())
    if all_done and any_lost and not any(p["condition"] != "lost" for p in plan.values()):
        new_status = "lost"

    update = {
        "status": new_status,
        "damage_fee": (rental.get("damage_fee", 0) or 0) + payload.damage_fee,
        "notes": (rental.get("notes") or "") + ("\nReturn: " + payload.notes if payload.notes else ""),
    }
    if all_done:
        update["return_date"] = payload.return_date
        update["condition_on_return"] = payload.condition_on_return

    # Optional: extend the due date for whatever is still out
    if payload.new_due_date and not all_done:
        if payload.new_due_date < payload.return_date:
            raise HTTPException(status_code=400, detail="new_due_date must be on or after return_date")
        old_due = rental.get("due_date", "")
        update["due_date"] = payload.new_due_date
        return_event["due_date_extended_from"] = old_due
        return_event["due_date_extended_to"] = payload.new_due_date

    await db.rentals.update_one(
        {"_id": rental["_id"]},
        {"$set": update, "$push": {"returns": return_event}},
    )

    # Reload to include the latest returns log + items state
    rental = await db.rentals.find_one({"_id": rental["_id"]})
    items = rental_items(rental)
    eq_ids = {ObjectId(it["equipment_id"]) for it in items}
    eq_map = {str(e["_id"]): e for e in await db.equipment.find({"_id": {"$in": list(eq_ids)}}).to_list(1000)} if eq_ids else {}
    cust = await db.customers.find_one({"_id": ObjectId(rental["customer_id"])})
    return serialize_rental(rental, eq_map, cust)


# ----------------------------- Maintenance -----------------------------
def serialize_maint(doc: dict, eq: Optional[dict] = None) -> dict:
    return {
        "id": str(doc["_id"]),
        "equipment_id": doc["equipment_id"],
        "equipment_name": (eq or {}).get("name") if eq else doc.get("equipment_name"),
        "service_date": doc["service_date"],
        "service_type": doc["service_type"],
        "performed_by": doc.get("performed_by"),
        "cost": doc.get("cost", 0),
        "next_service_date": doc.get("next_service_date"),
        "notes": doc.get("notes"),
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@api.get("/maintenance")
async def list_maintenance(user: dict = Depends(get_current_user)):
    items = await db.maintenance.find({}).sort("service_date", -1).to_list(1000)
    eq_ids = {ObjectId(i["equipment_id"]) for i in items}
    eq_map = {str(e["_id"]): e for e in await db.equipment.find({"_id": {"$in": list(eq_ids)}}).to_list(1000)} if eq_ids else {}
    return [serialize_maint(i, eq_map.get(i["equipment_id"])) for i in items]


@api.post("/maintenance")
async def create_maintenance(payload: MaintenanceIn, user: dict = Depends(get_current_user)):
    eq = await db.equipment.find_one({"_id": ObjectId(payload.equipment_id)})
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    doc = payload.model_dump()
    doc["created_at"] = now_utc()
    res = await db.maintenance.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_maint(doc, eq)


# ----------------------------- Bookings (pipeline) --------------------
def serialize_booking(doc: dict, eq: Optional[dict] = None) -> dict:
    return {
        "id": str(doc["_id"]),
        "customer_name": doc["customer_name"],
        "customer_id": doc.get("customer_id"),
        "contact": doc.get("contact"),
        "equipment_id": doc["equipment_id"],
        "equipment_name": (eq or {}).get("name") if eq else doc.get("equipment_name"),
        "quantity": doc.get("quantity", 1),
        "tentative_start_date": doc["tentative_start_date"],
        "tentative_end_date": doc["tentative_end_date"],
        "is_delivery": doc.get("is_delivery", False),
        "delivery_address": doc.get("delivery_address"),
        "estimated_value": doc.get("estimated_value", 0),
        "probability": doc.get("probability", "warm"),
        "status": doc.get("status", "tentative"),
        "notes": doc.get("notes"),
        "converted_rental_id": doc.get("converted_rental_id"),
        "created_at": doc.get("created_at").isoformat() if isinstance(doc.get("created_at"), datetime) else doc.get("created_at"),
    }


@api.get("/bookings")
async def list_bookings(status_filter: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if status_filter:
        q["status"] = status_filter
    items = await db.bookings.find(q).sort("tentative_start_date", 1).to_list(1000)
    eq_ids = {ObjectId(i["equipment_id"]) for i in items if i.get("equipment_id")}
    eq_map = {str(e["_id"]): e for e in await db.equipment.find({"_id": {"$in": list(eq_ids)}}).to_list(1000)} if eq_ids else {}
    return [serialize_booking(i, eq_map.get(i["equipment_id"])) for i in items]


@api.post("/bookings")
async def create_booking(payload: BookingIn, user: dict = Depends(get_current_user)):
    eq = await db.equipment.find_one({"_id": ObjectId(payload.equipment_id)})
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if payload.tentative_end_date < payload.tentative_start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    doc = payload.model_dump()
    doc["status"] = "tentative"
    doc["created_at"] = now_utc()
    doc["created_by"] = str(user["_id"])
    res = await db.bookings.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_booking(doc, eq)


@api.patch("/bookings/{booking_id}")
async def update_booking(booking_id: str, payload: BookingIn, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") == "confirmed":
        raise HTTPException(status_code=400, detail="Cannot edit a confirmed booking — edit its rental instead")
    update = payload.model_dump()
    await db.bookings.update_one({"_id": booking["_id"]}, {"$set": update})
    booking.update(update)
    eq = await db.equipment.find_one({"_id": ObjectId(booking["equipment_id"])})
    return serialize_booking(booking, eq)


@api.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") == "confirmed":
        raise HTTPException(status_code=400, detail="Booking already confirmed — cancel its rental instead")
    await db.bookings.update_one({"_id": booking["_id"]}, {"$set": {"status": "cancelled"}})
    return {"ok": True}


@api.post("/bookings/{booking_id}/confirm")
async def confirm_booking(booking_id: str, user: dict = Depends(get_current_user)):
    """Promote a tentative booking into a real rental. Decrements equipment availability."""
    booking = await db.bookings.find_one({"_id": ObjectId(booking_id)})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") != "tentative":
        raise HTTPException(status_code=400, detail=f"Booking status is '{booking.get('status')}' — only tentative bookings can be confirmed")

    eq = await db.equipment.find_one({"_id": ObjectId(booking["equipment_id"])})
    if not eq:
        raise HTTPException(status_code=404, detail="Equipment no longer exists")

    qty = booking.get("quantity", 1)
    avail = eq.get("available", eq.get("quantity", 1))
    if qty > avail:
        raise HTTPException(status_code=400, detail=f"Only {avail} available — booking needs {qty}")

    # resolve customer: link existing or create from booking customer_name
    customer_id = booking.get("customer_id")
    if not customer_id:
        existing = await db.customers.find_one({"name": booking["customer_name"]})
        if existing:
            customer_id = str(existing["_id"])
        else:
            cust_doc = {
                "name": booking["customer_name"],
                "phone": booking.get("contact") if booking.get("contact") and "@" not in (booking.get("contact") or "") else None,
                "email": booking.get("contact") if booking.get("contact") and "@" in (booking.get("contact") or "") else None,
                "created_at": now_utc(),
            }
            res_c = await db.customers.insert_one(cust_doc)
            customer_id = str(res_c.inserted_id)

    rental_doc = {
        "customer_id": customer_id,
        "items": [{
            "equipment_id": booking["equipment_id"],
            "quantity": qty,
            "daily_rate": eq.get("daily_rate", 0),
        }],
        "start_date": booking["tentative_start_date"],
        "due_date": booking["tentative_end_date"],
        "deposit": 0,
        "notes": (booking.get("notes") or "") + f" (Converted from booking #{booking_id})",
        "status": "active",
        "created_at": now_utc(),
        "created_by": str(user["_id"]),
        "from_booking_id": booking_id,
    }
    res = await db.rentals.insert_one(rental_doc)
    rental_doc["_id"] = res.inserted_id

    await db.equipment.update_one({"_id": eq["_id"]}, {"$inc": {"available": -qty}})
    await db.bookings.update_one(
        {"_id": booking["_id"]},
        {"$set": {"status": "confirmed", "converted_rental_id": str(res.inserted_id), "confirmed_at": now_utc()}},
    )

    cust = await db.customers.find_one({"_id": ObjectId(customer_id)})
    return {
        "rental": serialize_rental(rental_doc, {str(eq["_id"]): eq}, cust),
        "booking_id": booking_id,
    }


class BulkBookingsIn(BaseModel):
    bookings: List[BookingIn] = Field(min_length=1, max_length=30)


@api.post("/bookings/bulk")
async def create_bookings_bulk(payload: BulkBookingsIn, user: dict = Depends(get_current_user)):
    """Create many bookings in one shot (e.g. from a multi-SKU capacity check)."""
    created = []
    errors = []
    for idx, item in enumerate(payload.bookings):
        try:
            eq = await db.equipment.find_one({"_id": ObjectId(item.equipment_id)})
            if not eq:
                raise ValueError("equipment not found")
            if item.tentative_end_date < item.tentative_start_date:
                raise ValueError("end < start")
            doc = item.model_dump()
            doc["status"] = "tentative"
            doc["created_at"] = now_utc()
            doc["created_by"] = str(user["_id"])
            res = await db.bookings.insert_one(doc)
            doc["_id"] = res.inserted_id
            created.append(serialize_booking(doc, eq))
        except Exception as e:
            errors.append({"index": idx, "error": str(e), "customer": item.customer_name})
    return {"created_count": len(created), "error_count": len(errors), "created": created, "errors": errors}


# ----------------------------- Site Content ---------------------------
DEFAULT_CONTENT = {
    "brand_name": "ICF OPS HUB",
    "brand_tagline": "Operations Console",
    "login_headline_a": "Stop guessing.",
    "login_headline_b": "Start bracing right.",
    "login_subhead": "ACI 347 lateral-pressure calcs, live rental tracking, and BOM estimates in one rugged console — built for the trailer and the truck.",
    "login_stat1_value": "30m",
    "login_stat1_label": "Saved per wall layout",
    "login_stat2_value": "2.0×",
    "login_stat2_label": "Default safety factor",
    "login_stat3_value": "100%",
    "login_stat3_label": "Field-ready, mobile-first",
    "dashboard_eyebrow": "Operations · Today",
    "dashboard_title": "Control Room",
    "dashboard_subtitle": "Real-time view of your bracing math, rentals, and crew activity.",
    "bracing_subtitle": "Enter wall specs and pour parameters. Get brace spacing, count, hardware, and safety factor — backed by ACI 347 lateral concrete pressure formulas.",
    "estimator_subtitle": "Wall area → ICF blocks, concrete yardage, rebar tonnage, and a printable BOM.",
    "default_safety_factor": "2.0",
    "default_rebar_size": "#4",
}


async def get_site_content() -> dict:
    doc = await db.site_content.find_one({"_id": "site"})
    data = dict(DEFAULT_CONTENT)
    data["has_logo"] = False
    if doc:
        for k, v in doc.items():
            if k != "_id" and v is not None:
                data[k] = v
        if doc.get("logo_path"):
            data["has_logo"] = True
    return data


@api.get("/content")
async def fetch_content():
    """Public — every page reads brand/copy from here on load."""
    return await get_site_content()


class ContentUpdateIn(BaseModel):
    updates: dict


@api.put("/content")
async def update_content(payload: ContentUpdateIn, user: dict = Depends(require_role("admin"))):
    """Admin-only. Updates whichever keys are provided; unknown keys ignored."""
    valid = {k: v for k, v in payload.updates.items() if k in DEFAULT_CONTENT and isinstance(v, (str, int, float))}
    if not valid:
        raise HTTPException(status_code=400, detail="No valid content keys provided")
    valid = {k: str(v) for k, v in valid.items()}
    await db.site_content.update_one({"_id": "site"}, {"$set": valid}, upsert=True)
    return await get_site_content()


# ----------------------------- Logo (Emergent object storage) ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
STORAGE_APP = os.environ.get("APP_STORAGE_NAME", "icf-ops-hub")
_storage_key: Optional[str] = None


def _ensure_storage_key() -> Optional[str]:
    """Lazy-init the storage session key. Returns None if integration is unavailable."""
    global _storage_key
    if _storage_key:
        return _storage_key
    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        return None
    try:
        r = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": emergent_key}, timeout=20)
        r.raise_for_status()
        _storage_key = r.json().get("storage_key")
        return _storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None


def _put_object(path: str, data: bytes, content_type: str) -> dict:
    key = _ensure_storage_key()
    if not key:
        raise HTTPException(status_code=503, detail="Object storage not available")
    r = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=60,
    )
    if r.status_code == 403:
        # key may be expired — reset and retry once
        global _storage_key
        _storage_key = None
        key = _ensure_storage_key()
        r = requests.put(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key, "Content-Type": content_type},
            data=data, timeout=60,
        )
    r.raise_for_status()
    return r.json()


def _get_object(path: str):
    key = _ensure_storage_key()
    if not key:
        raise HTTPException(status_code=503, detail="Object storage not available")
    r = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=30,
    )
    if r.status_code == 404:
        raise HTTPException(status_code=404, detail="Logo not found")
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "image/png")


LOGO_MIME = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "webp": "image/webp", "svg": "image/svg+xml",
}


@api.post("/content/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(require_role("admin"))):
    fname = (file.filename or "").lower()
    ext = fname.rsplit(".", 1)[-1] if "." in fname else ""
    if ext not in LOGO_MIME:
        raise HTTPException(status_code=400, detail=f"Unsupported logo type — use {', '.join(LOGO_MIME.keys())}")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(data) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Logo must be <= 2 MB")
    path = f"{STORAGE_APP}/logos/{uuid.uuid4()}.{ext}"
    _put_object(path, data, LOGO_MIME[ext])
    await db.site_content.update_one(
        {"_id": "site"},
        {"$set": {"logo_path": path, "logo_content_type": LOGO_MIME[ext]}},
        upsert=True,
    )
    return {"ok": True, "logo_path": path}


@api.delete("/content/logo")
async def remove_logo(user: dict = Depends(require_role("admin"))):
    """Object storage has no delete API — just clear the DB reference."""
    await db.site_content.update_one(
        {"_id": "site"},
        {"$unset": {"logo_path": "", "logo_content_type": ""}},
    )
    return {"ok": True}


@api.get("/content/logo")
async def fetch_logo():
    """Public — fetched by the login page (unauthenticated) and the header."""
    from fastapi.responses import Response
    doc = await db.site_content.find_one({"_id": "site"})
    if not doc or not doc.get("logo_path"):
        raise HTTPException(status_code=404, detail="No logo uploaded")
    data, ctype = _get_object(doc["logo_path"])
    return Response(content=data, media_type=doc.get("logo_content_type") or ctype, headers={"Cache-Control": "public, max-age=60"})


# ----------------------------- Vendors + Quote Analyzer ----------------
class VendorIn(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    categories: List[str] = []  # e.g. ["NUDURA","Fox Block"]
    freight_terms: Optional[Literal["FOB Origin", "FOB Destination", "Prepaid + Add", "Collect", "Other"]] = None
    units_per_truck: Optional[int] = None
    capacity_unit: Optional[Literal["blocks", "lbs", "pallets", "sqft"]] = "blocks"
    freight_cost_per_truck: Optional[float] = None
    lead_time_days: Optional[int] = None
    min_order_for_free_freight: Optional[float] = None
    notes: Optional[str] = None


def serialize_vendor(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        **{k: d.get(k) for k in [
            "name", "contact_name", "phone", "email", "address",
            "categories", "freight_terms", "units_per_truck", "capacity_unit",
            "freight_cost_per_truck", "lead_time_days",
            "min_order_for_free_freight", "notes",
        ]},
        "created_at": d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
    }


@api.get("/vendors")
async def list_vendors(user: dict = Depends(get_current_user)):
    items = await db.vendors.find({}).sort("name", 1).to_list(500)
    return [serialize_vendor(v) for v in items]


@api.post("/vendors")
async def create_vendor(payload: VendorIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["created_at"] = now_utc()
    res = await db.vendors.insert_one(doc)
    doc["_id"] = res.inserted_id
    return serialize_vendor(doc)


@api.patch("/vendors/{vendor_id}")
async def update_vendor(vendor_id: str, payload: VendorIn, user: dict = Depends(get_current_user)):
    update = payload.model_dump()
    res = await db.vendors.find_one_and_update(
        {"_id": ObjectId(vendor_id)}, {"$set": update}, return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return serialize_vendor(res)


@api.delete("/vendors/{vendor_id}")
async def delete_vendor(vendor_id: str, user: dict = Depends(require_role("admin", "foreman"))):
    await db.vendors.delete_one({"_id": ObjectId(vendor_id)})
    return {"ok": True}


# Quote analyzer
QUOTE_PROMPT = (
    "You are a procurement analyst for an ICF (Insulated Concrete Form) contractor. "
    "Extract structured data from the following vendor quote. Return STRICT JSON only "
    "(no prose, no markdown) matching this schema:\n"
    "{\n"
    '  "vendor_guess": str|null,  // vendor name if found in the doc\n'
    '  "quote_date": str|null,    // YYYY-MM-DD if found\n'
    '  "expiration_date": str|null,\n'
    '  "currency": str,           // USD/CAD/etc\n'
    '  "line_items": [ {"description": str, "quantity": number, "unit": str|null, "unit_price": number, "line_total": number} ],\n'
    '  "subtotal": number|null,\n'
    '  "freight": number|null,\n'
    '  "tax": number|null,\n'
    '  "grand_total": number|null,\n'
    '  "freight_terms": str|null,\n'
    '  "lead_time_days": number|null,\n'
    '  "payment_terms": str|null,\n'
    '  "warnings": [str],         // hidden fees, expired items, vague pricing, etc\n'
    '  "summary": str             // 2-3 sentence executive summary\n'
    "}\n"
    "If a field is missing, use null. Be conservative; do not invent numbers."
)


async def _gemini_json(prompt: str, system: str = QUOTE_PROMPT) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    try:
        chat = LlmChat(
            api_key=os.environ["EMERGENT_LLM_KEY"],
            session_id=f"quote-{uuid.uuid4()}",
            system_message=system,
        ).with_model("gemini", "gemini-3-flash-preview")
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as e:
        msg = str(e)
        if "Budget has been exceeded" in msg:
            raise HTTPException(
                status_code=402,
                detail="Universal LLM key budget exceeded. Top up via Profile → Universal Key → Add Balance, then retry.",
            )
        raise HTTPException(status_code=502, detail=f"AI provider error: {msg[:240]}")
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    try:
        return jsonlib.loads(text)
    except Exception:
        return {"raw": raw, "parse_error": True}


def _pdf_to_text(data: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"PDF parse failed: {e}")


@api.post("/quotes")
async def upload_quote(
    text: Optional[str] = Form(None),
    vendor_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    """Accepts paste-text or a PDF, extracts text, sends to Gemini for structured analysis."""
    body = (text or "").strip()
    if file:
        data = await file.read()
        if not data:
            raise HTTPException(status_code=400, detail="File is empty")
        if (file.filename or "").lower().endswith(".pdf"):
            body = (_pdf_to_text(data) + "\n" + body).strip()
        else:
            raise HTTPException(status_code=400, detail="Only .pdf uploads supported (or paste text)")
    if not body or len(body) < 30:
        raise HTTPException(status_code=400, detail="Need at least a paragraph of quote text or a PDF.")

    analysis = await _gemini_json(body[:30000])  # cap input size
    vendor = None
    if vendor_id:
        vendor = await db.vendors.find_one({"_id": ObjectId(vendor_id)})

    doc = {
        "vendor_id": vendor_id,
        "vendor_name": vendor.get("name") if vendor else analysis.get("vendor_guess"),
        "raw_text": body[:30000],
        "analysis": analysis,
        "created_at": now_utc(),
        "created_by": str(user["_id"]),
    }
    res = await db.quotes.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_quote(doc)


def _serialize_quote(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        "vendor_id": d.get("vendor_id"),
        "vendor_name": d.get("vendor_name"),
        "analysis": d.get("analysis", {}),
        "created_at": d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
    }


@api.get("/quotes")
async def list_quotes(user: dict = Depends(get_current_user)):
    items = await db.quotes.find({}).sort("created_at", -1).to_list(200)
    return [_serialize_quote(d) for d in items]


@api.delete("/quotes/{quote_id}")
async def delete_quote(quote_id: str, user: dict = Depends(get_current_user)):
    await db.quotes.delete_one({"_id": ObjectId(quote_id)})
    return {"ok": True}


class CompareQuotesIn(BaseModel):
    quote_ids: List[str] = Field(min_length=2, max_length=5)


@api.post("/quotes/compare")
async def compare_quotes(payload: CompareQuotesIn, user: dict = Depends(get_current_user)):
    docs = await db.quotes.find({"_id": {"$in": [ObjectId(x) for x in payload.quote_ids]}}).to_list(10)
    if len(docs) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 valid quotes to compare")
    summaries = []
    for d in docs:
        a = d.get("analysis", {})
        summaries.append({
            "vendor": d.get("vendor_name") or a.get("vendor_guess") or "Unknown",
            "grand_total": a.get("grand_total"),
            "freight": a.get("freight"),
            "lead_time_days": a.get("lead_time_days"),
            "freight_terms": a.get("freight_terms"),
            "expiration_date": a.get("expiration_date"),
            "summary": a.get("summary"),
            "line_items_count": len(a.get("line_items") or []),
        })
    sys_prompt = (
        "You are a procurement analyst. Compare these ICF block vendor quotes and return STRICT JSON:\n"
        '{ "winner": str, "reason": str, "risks": [str], "ranking": [{"vendor": str, "score": number, "why": str}] }'
        " Score 0-100. Consider total price, freight, lead time, terms, and risks. No markdown, no prose outside JSON."
    )
    result = await _gemini_json(jsonlib.dumps(summaries, indent=2), system=sys_prompt)
    return {"quotes": [_serialize_quote(d) for d in docs], "comparison": result}


async def seed_vendors():
    if await db.vendors.count_documents({}) > 0:
        return
    for name in ["NUDURA", "Fox Blocks", "Amvic", "BuildBlock", "SuperForm", "Quad-Lock"]:
        await db.vendors.insert_one({
            "name": name, "categories": [name], "capacity_unit": "blocks",
            "freight_terms": "FOB Origin", "created_at": now_utc(),
        })


# ----------------------------- Leads / Lead Checklist ------------------
LOST_REASONS = ["Price", "Lost to competitor", "Project cancelled", "No response",
                "Timing / lead time", "Scope mismatch", "Other"]


class LeadIn(BaseModel):
    customer_name: str
    company: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    job_site: Optional[str] = None
    estimated_value: float = Field(ge=0, default=0)
    status: Literal["new", "reviewed", "quoted", "followed_up", "sold", "lost"] = "new"
    lost_reason: Optional[str] = None
    lost_notes: Optional[str] = None
    last_review_date: Optional[str] = None
    next_followup_date: Optional[str] = None
    # Scope checklist — for each item: providing(bool), product (e.g. "NUDURA Gen 2"), notes
    scope: dict = Field(default_factory=dict)
    notes: Optional[str] = None


def _serialize_lead(d: dict) -> dict:
    return {
        "id": str(d["_id"]),
        **{k: d.get(k) for k in [
            "customer_name", "company", "phone", "email", "job_site",
            "estimated_value", "status", "lost_reason", "lost_notes",
            "last_review_date", "next_followup_date", "scope", "notes",
        ]},
        "created_at": d.get("created_at").isoformat() if isinstance(d.get("created_at"), datetime) else d.get("created_at"),
    }


@api.get("/leads")
async def list_leads(user: dict = Depends(get_current_user)):
    items = await db.leads.find({}).sort("created_at", -1).to_list(500)
    return [_serialize_lead(d) for d in items]


@api.post("/leads")
async def create_lead(payload: LeadIn, user: dict = Depends(get_current_user)):
    doc = payload.model_dump()
    doc["created_at"] = now_utc()
    doc["created_by"] = str(user["_id"])
    res = await db.leads.insert_one(doc)
    doc["_id"] = res.inserted_id
    return _serialize_lead(doc)


@api.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: LeadIn, user: dict = Depends(get_current_user)):
    update = payload.model_dump()
    res = await db.leads.find_one_and_update(
        {"_id": ObjectId(lead_id)}, {"$set": update}, return_document=True,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Lead not found")
    return _serialize_lead(res)


@api.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, user: dict = Depends(require_role("admin", "foreman"))):
    await db.leads.delete_one({"_id": ObjectId(lead_id)})
    return {"ok": True}


@api.get("/leads/lost-reasons")
async def list_lost_reasons(user: dict = Depends(get_current_user)):
    return LOST_REASONS


# ----------------------------- Dashboard -------------------------------
@api.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    total_eq = await db.equipment.count_documents({})
    eq_docs = await db.equipment.find({}).to_list(2000)
    total_units = sum(e.get("quantity", 1) for e in eq_docs)
    available_units = sum(e.get("available", e.get("quantity", 1)) for e in eq_docs)
    on_rent = total_units - available_units
    active_rentals = await db.rentals.count_documents({"status": {"$in": ["active", "partial"]}})

    today_iso = now_utc().date().isoformat()
    overdue = await db.rentals.count_documents({"status": {"$in": ["active", "partial"]}, "due_date": {"$lt": today_iso}})

    # Due in next 7 days
    soon = (now_utc() + timedelta(days=7)).date().isoformat()
    due_soon = await db.rentals.count_documents({"status": {"$in": ["active", "partial"]}, "due_date": {"$gte": today_iso, "$lte": soon}})

    # Maintenance due
    maint_due = await db.maintenance.count_documents({"next_service_date": {"$lte": today_iso}})

    # Bookings pipeline
    tentative_bookings = await db.bookings.count_documents({"status": "tentative"})
    soon_starts = await db.bookings.count_documents({
        "status": "tentative",
        "tentative_start_date": {"$gte": today_iso, "$lte": soon},
    })

    # Recent calculations
    recent_calcs = await db.calculations.find({}).sort("created_at", -1).limit(5).to_list(5)
    recent = [{
        "type": c["type"],
        "user": c.get("user_email", ""),
        "created_at": c["created_at"].isoformat() if isinstance(c["created_at"], datetime) else c["created_at"],
    } for c in recent_calcs]

    # Inventory by category
    cat_breakdown = {}
    for e in eq_docs:
        cat_breakdown[e["category"]] = cat_breakdown.get(e["category"], 0) + e.get("quantity", 1)

    return {
        "total_equipment_skus": total_eq,
        "total_units": total_units,
        "available_units": available_units,
        "on_rent_units": on_rent,
        "active_rentals": active_rentals,
        "overdue_rentals": overdue,
        "due_soon_rentals": due_soon,
        "maintenance_due": maint_due,
        "tentative_bookings": tentative_bookings,
        "bookings_starting_soon": soon_starts,
        "recent_calculations": recent,
        "category_breakdown": [{"category": k, "count": v} for k, v in cat_breakdown.items()],
    }


# ----------------------------- App wiring ------------------------------
app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_URL", "*"), "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("icf-hub")


async def seed_admin():
    email = os.environ.get("ADMIN_EMAIL", "admin@icfhub.com").lower()
    pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": email})
    if not existing:
        await db.users.insert_one({
            "email": email,
            "password_hash": hash_password(pw),
            "name": "Admin",
            "role": "admin",
            "created_at": now_utc(),
        })
        logger.info(f"Seeded admin: {email}")
    elif not verify_password(pw, existing["password_hash"]):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(pw)}})
        logger.info("Admin password updated from .env")

    # seed a foreman test user
    fm_email = "foreman@icfhub.com"
    if not await db.users.find_one({"email": fm_email}):
        await db.users.insert_one({
            "email": fm_email,
            "password_hash": hash_password("foreman123"),
            "name": "Mike Foreman",
            "role": "foreman",
            "created_at": now_utc(),
        })


REAL_INVENTORY = [
    {"name": "NUDURA Gen 1 Strongback",  "category": "strongback", "condition": "good",      "location": "Yard", "daily_rate": 7.25, "quantity": 50},
    {"name": "NUDURA Gen 2 Strongback",  "category": "strongback", "condition": "excellent", "location": "Yard", "daily_rate": 7.50, "quantity": 80},
    {"name": "Reachcraft Gen 1 Strongback","category": "strongback", "condition": "good",    "location": "Yard", "daily_rate": 7.00, "quantity": 40},
    {"name": "Reachcraft Gen 2 Strongback","category": "strongback", "condition": "excellent","location": "Yard", "daily_rate": 7.50, "quantity": 60},
    {"name": "Walkboard Bracket",        "category": "scaffold",   "condition": "good",      "location": "Yard", "daily_rate": 3.00, "quantity": 100},
    {"name": "Handrail",                 "category": "scaffold",   "condition": "good",      "location": "Yard", "daily_rate": 2.50, "quantity": 100},
    {"name": "7' Brace Extension",       "category": "strongback", "condition": "good",      "location": "Yard", "daily_rate": 4.00, "quantity": 50},
    {"name": "20' Brace Extension",      "category": "strongback", "condition": "good",      "location": "Yard", "daily_rate": 9.00, "quantity": 30},
]

OLD_DEMO_NAMES = {
    "Wafer Brace - 9ft", "Strongback Brace - 12ft", "Waler 8ft Aluminum",
    "Turnbuckle Brace 14ft", "Alignment Tool Set", "Scaffold Plank 16ft",
    "Concrete Vibrator",
}


async def migrate_demo_inventory():
    """One-time wipe of v1 wafer-themed demo data + reseed with real ICF fleet."""
    flag = await db.meta.find_one({"_id": "inventory_v2_migrated"})
    if flag:
        return

    # Find any equipment matching old demo names
    old = await db.equipment.find({"name": {"$in": list(OLD_DEMO_NAMES)}}).to_list(100)
    old_ids = [str(d["_id"]) for d in old]

    if old_ids:
        # Wipe equipment + any data that depends on those equipment_ids
        await db.equipment.delete_many({"name": {"$in": list(OLD_DEMO_NAMES)}})
        # rentals: delete docs where every item is old demo equipment, OR flat doc with old equipment_id
        await db.rentals.delete_many({
            "$or": [
                {"equipment_id": {"$in": old_ids}},  # legacy flat
                {"items.equipment_id": {"$in": old_ids}},
            ],
        })
        await db.bookings.delete_many({"equipment_id": {"$in": old_ids}})
        await db.maintenance.delete_many({"equipment_id": {"$in": old_ids}})
        await db.stock_adjustments.delete_many({"equipment_id": {"$in": old_ids}})
        logger.info(f"Wiped {len(old_ids)} legacy demo equipment SKUs and their dependent data.")

    # Seed real fleet for any names not already present
    existing_names = {e["name"] async for e in db.equipment.find({}, {"name": 1})}
    to_insert = []
    for s in REAL_INVENTORY:
        if s["name"] in existing_names:
            continue
        s = {**s, "available": s["quantity"], "created_at": now_utc()}
        to_insert.append(s)
    if to_insert:
        res = await db.equipment.insert_many(to_insert)
        for inserted_id, doc in zip(res.inserted_ids, to_insert):
            await db.stock_adjustments.insert_one({
                "equipment_id": str(inserted_id),
                "delta": doc["quantity"],
                "reason": "Initial stock — seeded real fleet",
                "user_id": "system",
                "user_email": "system@icfhub",
                "created_at": now_utc(),
            })
        logger.info(f"Seeded {len(to_insert)} real fleet SKUs.")

    # Seed demo customers if missing
    if await db.customers.count_documents({}) == 0:
        await db.customers.insert_many([
            {"name": "Big Sky Concrete", "company": "Big Sky Concrete LLC", "phone": "555-0101", "email": "ops@bigsky.com", "address": "Bozeman, MT", "created_at": now_utc()},
            {"name": "Stonebridge Homes", "company": "Stonebridge Homes Inc.", "phone": "555-0144", "email": "build@stonebridge.com", "address": "Boise, ID", "created_at": now_utc()},
        ])

    await db.meta.update_one({"_id": "inventory_v2_migrated"}, {"$set": {"at": now_utc()}}, upsert=True)


async def seed_demo_inventory():
    # First boot only — no real fleet yet at all
    if await db.equipment.count_documents({}) > 0:
        return
    samples = [{**s, "available": s["quantity"], "created_at": now_utc()} for s in REAL_INVENTORY]
    await db.equipment.insert_many(samples)
    if await db.customers.count_documents({}) == 0:
        await db.customers.insert_many([
            {"name": "Big Sky Concrete", "company": "Big Sky Concrete LLC", "phone": "555-0101", "email": "ops@bigsky.com", "address": "Bozeman, MT", "created_at": now_utc()},
            {"name": "Stonebridge Homes", "company": "Stonebridge Homes Inc.", "phone": "555-0144", "email": "build@stonebridge.com", "address": "Boise, ID", "created_at": now_utc()},
        ])


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.equipment.create_index("name")
    await db.rentals.create_index("status")
    await db.rentals.create_index("due_date")
    await db.maintenance.create_index("next_service_date")
    await db.bookings.create_index("status")
    await db.bookings.create_index("tentative_start_date")
    await seed_admin()
    await seed_demo_inventory()
    await migrate_demo_inventory()
    await seed_vendors()
    try:
        if _ensure_storage_key():
            logger.info("Object storage initialized")
    except Exception as e:
        logger.warning(f"Object storage not available: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()


@api.get("/")
async def root():
    return {"name": "ICF Operations Hub API", "version": "1.0"}
