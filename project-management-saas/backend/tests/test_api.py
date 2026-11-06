import os

os.environ["SECRET_KEY"] = "test-secret-key-with-enough-entropy-for-tests"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import User
from app.security import hash_password


@pytest.fixture()
def client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestSession = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestSession() as db:
        users = [
            User(full_name="Avery Admin", email="admin@example.com", password_hash=hash_password("Admin-pass-123"), role="admin"),
            User(full_name="Morgan Manager", email="manager@example.com", password_hash=hash_password("Manager-pass-123"), role="manager"),
            User(full_name="Elliot Employee", email="employee@example.com", password_hash=hash_password("Employee-pass-123"), role="employee"),
        ]
        db.add_all(users)
        db.commit()
        db.refresh(users[0])
        db.refresh(users[1])
        db.refresh(users[2])
        ids = {"admin": users[0].id, "manager": users[1].id, "employee": users[2].id}

    with TestClient(app) as test_client:
        test_client.user_ids = ids
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def token_for(client: TestClient, email: str, password: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_login_rejects_wrong_password(client: TestClient):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "incorrect-password"},
    )
    assert response.status_code == 401


def test_admin_can_create_project_and_task(client: TestClient):
    headers = token_for(client, "admin@example.com", "Admin-pass-123")
    employee_id = client.user_ids["employee"]
    project_response = client.post(
        "/api/v1/projects",
        headers=headers,
        json={"name": "Website refresh", "description": "Refresh the company website", "member_ids": [employee_id]},
    )
    assert project_response.status_code == 201, project_response.text
    project_id = project_response.json()["id"]

    task_response = client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Build the landing page", "project_id": project_id, "assignee_id": employee_id},
    )
    assert task_response.status_code == 201, task_response.text
    assert task_response.json()["assignee"]["id"] == employee_id


def test_employee_cannot_create_project_or_edit_another_users_task(client: TestClient):
    admin_headers = token_for(client, "admin@example.com", "Admin-pass-123")
    employee_headers = token_for(client, "employee@example.com", "Employee-pass-123")
    employee_id = client.user_ids["employee"]
    project = client.post(
        "/api/v1/projects",
        headers=admin_headers,
        json={"name": "Internal tool", "member_ids": [employee_id]},
    ).json()
    task = client.post(
        "/api/v1/tasks",
        headers=admin_headers,
        json={"title": "Create dashboard", "project_id": project["id"], "assignee_id": employee_id},
    ).json()

    forbidden_project = client.post(
        "/api/v1/projects", headers=employee_headers, json={"name": "Not allowed"}
    )
    assert forbidden_project.status_code == 403

    forbidden_edit = client.patch(
        f"/api/v1/tasks/{task['id']}", headers=employee_headers, json={"title": "Take over task"}
    )
    assert forbidden_edit.status_code == 403


def test_employee_can_update_status_of_assigned_task(client: TestClient):
    admin_headers = token_for(client, "admin@example.com", "Admin-pass-123")
    employee_headers = token_for(client, "employee@example.com", "Employee-pass-123")
    employee_id = client.user_ids["employee"]
    project = client.post(
        "/api/v1/projects", headers=admin_headers,
        json={"name": "Mobile app", "member_ids": [employee_id]},
    ).json()
    task = client.post(
        "/api/v1/tasks", headers=admin_headers,
        json={"title": "Fix sign in screen", "project_id": project["id"], "assignee_id": employee_id},
    ).json()

    response = client.patch(
        f"/api/v1/tasks/{task['id']}", headers=employee_headers, json={"status": "in_progress"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "in_progress"


def test_task_assignee_must_be_a_project_member(client: TestClient):
    headers = token_for(client, "admin@example.com", "Admin-pass-123")
    project = client.post(
        "/api/v1/projects", headers=headers, json={"name": "Private project", "member_ids": []}
    ).json()
    response = client.post(
        "/api/v1/tasks", headers=headers,
        json={"title": "Assign outside team", "project_id": project["id"], "assignee_id": client.user_ids["employee"]},
    )
    assert response.status_code == 422


def test_manager_can_manage_only_projects_they_created(client: TestClient):
    admin_headers = token_for(client, "admin@example.com", "Admin-pass-123")
    manager_headers = token_for(client, "manager@example.com", "Manager-pass-123")
    other_project = client.post(
        "/api/v1/projects", headers=admin_headers, json={"name": "Admin project"}
    ).json()
    forbidden = client.patch(
        f"/api/v1/projects/{other_project['id']}", headers=manager_headers,
        json={"name": "Changed by manager"},
    )
    assert forbidden.status_code == 403

    own_project = client.post(
        "/api/v1/projects", headers=manager_headers, json={"name": "Manager project"}
    )
    assert own_project.status_code == 201
    updated = client.patch(
        f"/api/v1/projects/{own_project.json()['id']}", headers=manager_headers,
        json={"description": "Updated project brief"},
    )
    assert updated.status_code == 200, updated.text


def test_employee_can_comment_on_a_project_they_belong_to(client: TestClient):
    admin_headers = token_for(client, "admin@example.com", "Admin-pass-123")
    employee_headers = token_for(client, "employee@example.com", "Employee-pass-123")
    employee_id = client.user_ids["employee"]
    project = client.post(
        "/api/v1/projects", headers=admin_headers,
        json={"name": "Team collaboration", "member_ids": [employee_id]},
    ).json()
    task = client.post(
        "/api/v1/tasks", headers=admin_headers,
        json={"title": "Prepare project notes", "project_id": project["id"], "assignee_id": employee_id},
    ).json()
    response = client.post(
        f"/api/v1/tasks/{task['id']}/comments", headers=employee_headers,
        json={"body": "I have started on this."},
    )
    assert response.status_code == 201, response.text
    assert response.json()["author"]["id"] == employee_id


def test_employee_cannot_read_a_project_they_do_not_belong_to(client: TestClient):
    admin_headers = token_for(client, "admin@example.com", "Admin-pass-123")
    employee_headers = token_for(client, "employee@example.com", "Employee-pass-123")
    project = client.post(
        "/api/v1/projects", headers=admin_headers, json={"name": "Admin only project"}
    ).json()
    response = client.get(f"/api/v1/projects/{project['id']}", headers=employee_headers)
    assert response.status_code == 404


def test_deleting_project_removes_its_tasks(client: TestClient):
    headers = token_for(client, "admin@example.com", "Admin-pass-123")
    project = client.post(
        "/api/v1/projects", headers=headers, json={"name": "Cleanup test"}
    ).json()
    task = client.post(
        "/api/v1/tasks", headers=headers,
        json={"title": "Temporary task", "project_id": project["id"]},
    )
    assert task.status_code == 201
    deleted = client.delete(f"/api/v1/projects/{project['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/api/v1/tasks", headers=headers).json() == []
