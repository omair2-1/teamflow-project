from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Role = Literal["admin", "manager", "employee"]
ProjectStatus = Literal["active", "completed", "on_hold"]
TaskStatus = Literal["todo", "in_progress", "in_review", "done"]
Priority = Literal["low", "medium", "high"]


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Literal["manager", "employee"] = "employee"

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Full name must contain at least 2 characters.")
        return value


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: Role
    is_active: bool
    created_at: datetime


class ProjectCreate(BaseModel):
    name: str = Field(min_length=3, max_length=140)
    description: str = Field(default="", max_length=3000)
    due_date: date | None = None
    member_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Project name must contain at least 3 characters.")
        return value


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=3, max_length=140)
    description: str | None = Field(default=None, max_length=3000)
    status: ProjectStatus | None = None
    due_date: date | None = None
    member_ids: list[int] | None = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Project name must contain at least 3 characters.")
        return value


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    status: ProjectStatus
    due_date: date | None
    created_by_id: int
    created_at: datetime
    members: list[UserOut] = Field(default_factory=list)


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=5000)
    project_id: int
    assignee_id: int | None = None
    status: TaskStatus = "todo"
    priority: Priority = "medium"
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Task title must contain at least 3 characters.")
        return value


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=180)
    description: str | None = Field(default=None, max_length=5000)
    assignee_id: int | None = None
    status: TaskStatus | None = None
    priority: Priority | None = None
    due_date: date | None = None

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Task title must contain at least 3 characters.")
        return value


class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str
    status: TaskStatus
    priority: Priority
    due_date: date | None
    project_id: int
    assignee_id: int | None
    created_by_id: int
    created_at: datetime
    updated_at: datetime
    assignee: UserOut | None = None


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comment cannot be empty.")
        return value


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    body: str
    created_at: datetime
    author: UserOut
