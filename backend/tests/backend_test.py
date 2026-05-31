"""
Backend API tests for ICF Operations Hub.
Covers auth, bracing, estimator, equipment, customers, rentals, maintenance, dashboard.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://operations-analyzer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@icfhub.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def admin_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert data["role"] == "admin"
    # cookies should be set
    assert "access_token" in s.cookies
    assert "refresh_token" in s.cookies
    return s


# ---------------------- AUTH ----------------------
class TestAuth:
    def test_login_admin(self, admin_session):
        r = admin_session.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"})
        assert r.status_code == 401

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_register_new_user(self):
        ts = int(time.time())
        email = f"test_user_{ts}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "test1234", "name": "Test User", "role": "crew"
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email.lower()
        assert data["role"] == "crew"

    def test_logout(self, admin_session):
        s = requests.Session()
        s.headers.update({"Content-Type": "application/json"})
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        r2 = s.post(f"{API}/auth/logout")
        assert r2.status_code == 200
        # After logout, /me should fail
        r3 = s.get(f"{API}/auth/me")
        assert r3.status_code == 401


# ---------------------- BRACING ----------------------
class TestBracing:
    def test_bracing_calculate(self, admin_session):
        payload = {
            "wall_height_ft": 9, "wall_length_ft": 40, "wind_exposure": "B",
            "pour_rate_ft_hr": 4, "concrete_temp_f": 70, "concrete_slump_in": 5,
            "core_thickness_in": 6, "safety_factor": 2.0
        }
        r = admin_session.post(f"{API}/bracing/calculate", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        # Expected values per problem statement
        assert abs(data["lateral_pressure_psf"] - 664.3) < 1.0
        assert data["brace_count"] == 12
        assert abs(data["recommended_spacing_ft"] - 3.8) < 0.2
        # Hardware fields
        assert "wedge_anchors" in data
        assert "tiedown_anchors" in data
        assert "lag_screws" in data
        assert isinstance(data["pressure_profile"], list)
        assert len(data["pressure_profile"]) > 0
        assert isinstance(data["warnings"], list)


# ---------------------- ESTIMATOR ----------------------
class TestEstimator:
    def test_estimator_calculate(self, admin_session):
        payload = {
            "wall_height_ft": 9, "wall_length_ft": 40, "core_thickness_in": 6,
            "openings_sqft": 0, "rebar_spacing_in": 16, "rebar_size": "#4",
            "block_face_sqft": 5.33
        }
        r = admin_session.post(f"{API}/estimator/calculate", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["block_count"] > 0
        assert data["concrete_cy_with_waste"] > 0
        assert data["rebar_total_tons"] > 0
        assert isinstance(data["bom"], list) and len(data["bom"]) >= 5


# ---------------------- EQUIPMENT ----------------------
class TestEquipment:
    def test_list_equipment_seeded(self, admin_session):
        r = admin_session.get(f"{API}/equipment")
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 7, f"Expected >=7 seeded equipment, got {len(items)}"
        # Validate fields
        item = items[0]
        for f in ("id", "name", "category", "quantity", "available"):
            assert f in item

    def test_equipment_crud(self, admin_session):
        # Create
        payload = {"name": "TEST_Brace_X", "category": "brace", "condition": "good",
                   "location": "Yard Z", "daily_rate": 5.0, "quantity": 10}
        r = admin_session.post(f"{API}/equipment", json=payload)
        assert r.status_code == 200, r.text
        eq = r.json()
        eid = eq["id"]
        assert eq["name"] == "TEST_Brace_X"
        assert eq["available"] == 10

        # Update (PATCH)
        payload["daily_rate"] = 6.5
        payload["quantity"] = 15
        r2 = admin_session.patch(f"{API}/equipment/{eid}", json=payload)
        assert r2.status_code == 200, r2.text
        assert r2.json()["daily_rate"] == 6.5
        assert r2.json()["quantity"] == 15

        # Delete
        r3 = admin_session.delete(f"{API}/equipment/{eid}")
        assert r3.status_code == 200


# ---------------------- CUSTOMERS & RENTALS ----------------------
class TestRentalsFlow:
    def test_full_rental_flow(self, admin_session):
        # Create customer
        cust_payload = {"name": "TEST_Customer", "company": "TC Inc", "phone": "555-0000",
                        "email": "test@test.com", "address": "Test Address"}
        r = admin_session.post(f"{API}/customers", json=cust_payload)
        assert r.status_code == 200, r.text
        cust_id = r.json()["id"]

        # Get equipment to rent
        eq_resp = admin_session.get(f"{API}/equipment")
        equipment = eq_resp.json()
        eq = next((e for e in equipment if e["available"] >= 2), equipment[0])
        eq_id = eq["id"]
        before_avail = eq["available"]

        # Create rental
        rental_payload = {
            "customer_id": cust_id, "equipment_id": eq_id, "quantity": 2,
            "start_date": "2026-01-01", "due_date": "2026-01-15",
            "deposit": 100, "daily_rate": 5.0, "notes": "TEST rental"
        }
        r2 = admin_session.post(f"{API}/rentals", json=rental_payload)
        assert r2.status_code == 200, r2.text
        rental = r2.json()
        rid = rental["id"]
        assert rental["status"] == "active"

        # Verify availability decremented
        eq_after = admin_session.get(f"{API}/equipment").json()
        new_avail = next(e["available"] for e in eq_after if e["id"] == eq_id)
        assert new_avail == before_avail - 2

        # Return rental
        ret_payload = {"return_date": "2026-01-10", "condition_on_return": "good", "damage_fee": 0}
        r3 = admin_session.post(f"{API}/rentals/{rid}/return", json=ret_payload)
        assert r3.status_code == 200, r3.text
        assert r3.json()["status"] == "returned"

        # Verify availability restored
        eq_final = admin_session.get(f"{API}/equipment").json()
        final_avail = next(e["available"] for e in eq_final if e["id"] == eq_id)
        assert final_avail == before_avail

    def test_rental_invalid_customer(self, admin_session):
        equipment = admin_session.get(f"{API}/equipment").json()
        bad_cust = "507f1f77bcf86cd799439011"
        rental_payload = {
            "customer_id": bad_cust, "equipment_id": equipment[0]["id"],
            "quantity": 1, "start_date": "2026-01-01", "due_date": "2026-01-15",
            "deposit": 0
        }
        r = admin_session.post(f"{API}/rentals", json=rental_payload)
        assert r.status_code == 404


# ---------------------- MAINTENANCE ----------------------
class TestMaintenance:
    def test_create_and_list_maintenance(self, admin_session):
        equipment = admin_session.get(f"{API}/equipment").json()
        eq_id = equipment[0]["id"]
        payload = {
            "equipment_id": eq_id, "service_date": "2026-01-05",
            "service_type": "inspection", "performed_by": "Tester",
            "cost": 50.0, "next_service_date": "2026-04-05",
            "notes": "TEST maintenance"
        }
        r = admin_session.post(f"{API}/maintenance", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["next_service_date"] == "2026-04-05"

        r2 = admin_session.get(f"{API}/maintenance")
        assert r2.status_code == 200
        assert len(r2.json()) >= 1


# ---------------------- DASHBOARD ----------------------
class TestDashboard:
    def test_dashboard_stats(self, admin_session):
        r = admin_session.get(f"{API}/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for key in ("total_equipment_skus", "total_units", "available_units",
                    "on_rent_units", "active_rentals", "overdue_rentals",
                    "due_soon_rentals", "maintenance_due", "recent_calculations",
                    "category_breakdown"):
            assert key in d, f"missing field: {key}"
        assert isinstance(d["recent_calculations"], list)
        assert isinstance(d["category_breakdown"], list)
