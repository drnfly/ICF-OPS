"""
Backend API tests for NEW modules: Vendors, Quotes, Leads.
Quotes AI analyze is expected to return 402 (budget exceeded) — verified gracefully.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@icfhub.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    return s


# ---------------------- VENDORS ----------------------
class TestVendors:
    def test_list_vendors_seeded(self, admin_session):
        r = admin_session.get(f"{API}/vendors")
        assert r.status_code == 200
        items = r.json()
        # Seeded vendors: NUDURA, Fox Blocks, Amvic, BuildBlock, SuperForm, Quad-Lock
        assert isinstance(items, list)
        assert len(items) >= 6, f"Expected >=6 seeded vendors, got {len(items)}"
        names = [v["name"] for v in items]
        for expected in ["NUDURA", "Fox Blocks", "Amvic"]:
            assert expected in names, f"missing seeded vendor {expected}"
        v0 = items[0]
        for f in ("id", "name", "categories", "freight_terms", "capacity_unit"):
            assert f in v0

    def test_vendors_unauth(self):
        r = requests.get(f"{API}/vendors")
        assert r.status_code == 401

    def test_vendor_crud(self, admin_session):
        # CREATE
        payload = {
            "name": "TEST_Vendor_Alpha",
            "contact_name": "John Doe",
            "phone": "555-1111",
            "email": "vendor@test.com",
            "categories": ["NUDURA", "Fox Blocks"],
            "freight_terms": "FOB Origin",
            "units_per_truck": 480,
            "capacity_unit": "blocks",
            "freight_cost_per_truck": 1200.0,
            "lead_time_days": 14,
            "notes": "TEST vendor",
        }
        r = admin_session.post(f"{API}/vendors", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        vid = created["id"]
        assert created["name"] == "TEST_Vendor_Alpha"
        assert created["units_per_truck"] == 480
        assert created["freight_terms"] == "FOB Origin"
        assert "NUDURA" in created["categories"]

        # Verify persistence via list
        r_list = admin_session.get(f"{API}/vendors")
        assert any(v["id"] == vid for v in r_list.json())

        # PATCH
        payload["units_per_truck"] = 500
        payload["notes"] = "TEST vendor updated"
        r2 = admin_session.patch(f"{API}/vendors/{vid}", json=payload)
        assert r2.status_code == 200, r2.text
        assert r2.json()["units_per_truck"] == 500
        assert r2.json()["notes"] == "TEST vendor updated"

        # DELETE
        r3 = admin_session.delete(f"{API}/vendors/{vid}")
        assert r3.status_code == 200

        # Verify removal
        r4 = admin_session.get(f"{API}/vendors")
        assert not any(v["id"] == vid for v in r4.json())


# ---------------------- QUOTES ----------------------
class TestQuotes:
    def test_list_quotes(self, admin_session):
        r = admin_session.get(f"{API}/quotes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_quotes_unauth(self):
        r = requests.get(f"{API}/quotes")
        assert r.status_code == 401

    def test_upload_quote_budget_exceeded_clean(self):
        """Cleaner multipart call without JSON header baked in."""
        s = requests.Session()
        login = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert login.status_code == 200

        sample_text = (
            "Vendor: NUDURA Inc.\nQuote #4421\n"
            "Date: 2026-01-10\n"
            "Item: 6 inch NUDURA Gen2 Form Block, Qty 480, Unit Price $22.50, Total $10800.\n"
            "Freight $1200 FOB Origin, Lead time 14 days. Payment Net 30. Grand Total $12000.\n"
        )
        r = s.post(f"{API}/quotes", data={"text": sample_text})
        # Budget is known to be exceeded for this environment.
        assert r.status_code == 402, f"Expected 402 budget exceeded, got {r.status_code}: {r.text[:300]}"
        body = r.json()
        assert "detail" in body
        assert "budget" in body["detail"].lower(), f"detail should mention budget: {body}"

    def test_upload_quote_too_short(self):
        s = requests.Session()
        login = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert login.status_code == 200
        r = s.post(f"{API}/quotes", data={"text": "short"})
        assert r.status_code == 400
        assert "paragraph" in r.json().get("detail", "").lower() or "least" in r.json().get("detail", "").lower()

    def test_compare_quotes_validation(self, admin_session):
        # Need at least 2 quote IDs to pass schema; if none exist, should 400 ("Need at least 2 valid")
        r = admin_session.post(f"{API}/quotes/compare", json={"quote_ids": ["507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012"]})
        # Either 400 (not enough valid quotes found) is acceptable since DB likely has 0 quotes
        assert r.status_code in (400, 402), f"Unexpected: {r.status_code} {r.text[:300]}"

    def test_compare_quotes_min_items_schema(self, admin_session):
        # Only 1 id -> pydantic min_length=2 should reject (422)
        r = admin_session.post(f"{API}/quotes/compare", json={"quote_ids": ["507f1f77bcf86cd799439011"]})
        assert r.status_code == 422


# ---------------------- LEADS ----------------------
class TestLeads:
    def test_list_leads(self, admin_session):
        r = admin_session.get(f"{API}/leads")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_leads_unauth(self):
        r = requests.get(f"{API}/leads")
        assert r.status_code == 401

    def test_lost_reasons(self, admin_session):
        r = admin_session.get(f"{API}/leads/lost-reasons")
        assert r.status_code == 200
        reasons = r.json()
        assert isinstance(reasons, list)
        assert "Price" in reasons
        assert "Lost to competitor" in reasons
        assert len(reasons) >= 5

    def test_lead_crud_with_scope_and_lost(self, admin_session):
        # CREATE
        payload = {
            "customer_name": "TEST_Lead_Customer",
            "company": "TEST Co",
            "phone": "555-2222",
            "email": "lead@test.com",
            "job_site": "123 Test St",
            "estimated_value": 50000.0,
            "status": "new",
            "scope": {
                "blocks": {"providing": True, "product": "NUDURA Gen 2", "notes": ""},
                "rebar": {"providing": False, "product": "", "notes": "Client supplied"},
            },
            "notes": "TEST lead notes",
        }
        r = admin_session.post(f"{API}/leads", json=payload)
        assert r.status_code == 200, r.text
        created = r.json()
        lid = created["id"]
        assert created["customer_name"] == "TEST_Lead_Customer"
        assert created["estimated_value"] == 50000.0
        assert created["status"] == "new"
        assert created["scope"]["blocks"]["providing"] is True
        assert created["scope"]["blocks"]["product"] == "NUDURA Gen 2"

        # Verify persistence via list
        r_list = admin_session.get(f"{API}/leads")
        assert any(le["id"] == lid for le in r_list.json())

        # PATCH to status=lost with reason
        payload["status"] = "lost"
        payload["lost_reason"] = "Price"
        payload["lost_notes"] = "Cheaper competitor"
        r2 = admin_session.patch(f"{API}/leads/{lid}", json=payload)
        assert r2.status_code == 200, r2.text
        upd = r2.json()
        assert upd["status"] == "lost"
        assert upd["lost_reason"] == "Price"
        assert upd["lost_notes"] == "Cheaper competitor"

        # Toggle scope item: turn rebar to providing=true
        payload["scope"]["rebar"]["providing"] = True
        payload["scope"]["rebar"]["product"] = "#5 Grade 60"
        r3 = admin_session.patch(f"{API}/leads/{lid}", json=payload)
        assert r3.status_code == 200, r3.text
        assert r3.json()["scope"]["rebar"]["providing"] is True
        assert r3.json()["scope"]["rebar"]["product"] == "#5 Grade 60"

        # DELETE
        r4 = admin_session.delete(f"{API}/leads/{lid}")
        assert r4.status_code == 200

        # Verify removal
        r5 = admin_session.get(f"{API}/leads")
        assert not any(le["id"] == lid for le in r5.json())

    def test_lead_invalid_status(self, admin_session):
        payload = {"customer_name": "X", "status": "garbage"}
        r = admin_session.post(f"{API}/leads", json=payload)
        assert r.status_code == 422
