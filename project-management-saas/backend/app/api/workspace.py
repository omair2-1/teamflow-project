from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.models import Activity, Comment, Project, Task, User, project_members
from app.schemas import (
    CommentCreate,
    CommentOut,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    TaskCreate,
    TaskOut,
    TaskUpdate,
    UserCreate,
    UserOut,
)
from app.security import hash_password

router = APIRouter(tags=["Workspace"])


def visible_project_ids(db: Session, user: User) -> list[int]:
    if user.role == "admin":
        return list(db.scalars(select(Project.id)).all())
    return list(
        db.scalars(
            select(Project.id)
            .outerjoin(project_members, project_members.c.project_id == Project.id)
            .where(or_(Project.created_by_id == user.id, project_members.c.user_id == user.id))
            .distinct()
        ).all()
    )


def can_manage_project(project: Project, user: User) -> bool:
    return user.role == "admin" or project.created_by_id == user.id


def get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.scalar(
        select(Project).options(selectinload(Project.members)).where(Project.id == project_id)
    )
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found.")
    return project


def get_task_or_404(db: Session, task_id: int) -> Task:
    task = db.scalar(
        select(Task).options(selectinload(Task.assignee), selectinload(Task.project)).where(Task.id == task_id)
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return task


def ensure_can_view_project(project: Project, user: User) -> None:
    if user.role == "admin":
        return
    if project.created_by_id == user.id or any(member.id == user.id for member in project.members):
        return
    raise HTTPException(status_code=404, detail="Project not found.")


def log_activity(db: Session, user: User, project_id: int, message: str) -> None:
    db.add(Activity(actor_id=user.id, project_id=project_id, message=message))


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    return db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.full_name)).all()


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    email = payload.email.lower()
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    new_user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ids = visible_project_ids(db, user)
    if not ids:
        return []
    return db.scalars(
        select(Project)
        .options(selectinload(Project.members))
        .where(Project.id.in_(ids))
        .order_by(Project.created_at.desc())
    ).all()


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    members = []
    if payload.member_ids:
        members = db.scalars(
            select(User).where(User.id.in_(set(payload.member_ids)), User.is_active.is_(True))
        ).all()
        if len({member.id for member in members}) != len(set(payload.member_ids)):
            raise HTTPException(status_code=422, detail="One or more selected team members are invalid.")
    if all(member.id != user.id for member in members):
        members.append(user)
    project = Project(
        name=payload.name.strip(),
        description=payload.description.strip(),
        due_date=payload.due_date,
        created_by_id=user.id,
        members=members,
    )
    db.add(project)
    db.flush()
    log_activity(db, user, project.id, f"created the project {project.name}")
    db.commit()
    return get_project_or_404(db, project.id)


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = get_project_or_404(db, project_id)
    ensure_can_view_project(project, user)
    return project


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    project = get_project_or_404(db, project_id)
    if not can_manage_project(project, user):
        raise HTTPException(status_code=403, detail="Only the project owner or an admin can edit this project.")
    values = payload.model_dump(exclude_unset=True)
    member_ids = values.pop("member_ids", None)
    for key, value in values.items():
        if value is None and key != "due_date":
            raise HTTPException(status_code=422, detail=f"{key} cannot be null.")
        setattr(project, key, value)
    if member_ids is not None:
        members = db.scalars(
            select(User).where(User.id.in_(set(member_ids)), User.is_active.is_(True))
        ).all() if member_ids else []
        if len({member.id for member in members}) != len(set(member_ids)):
            raise HTTPException(status_code=422, detail="One or more selected team members are invalid.")
        if all(member.id != project.created_by_id for member in members):
            owner = db.get(User, project.created_by_id)
            if owner:
                members.append(owner)
        project.members = members
    log_activity(db, user, project.id, f"updated the project {project.name}")
    db.commit()
    return get_project_or_404(db, project.id)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    project = get_project_or_404(db, project_id)
    if not can_manage_project(project, user):
        raise HTTPException(status_code=403, detail="Only the project owner or an admin can delete this project.")
    db.delete(project)
    db.commit()


@router.get("/tasks", response_model=list[TaskOut])
def list_tasks(
    project_id: int | None = None,
    mine: bool = False,
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ids = visible_project_ids(db, user)
    if not ids:
        return []
    query = select(Task).options(selectinload(Task.assignee)).where(Task.project_id.in_(ids))
    if project_id is not None:
        query = query.where(Task.project_id == project_id)
    if mine:
        query = query.where(Task.assignee_id == user.id)
    if status_filter:
        if status_filter not in {"todo", "in_progress", "in_review", "done"}:
            raise HTTPException(status_code=422, detail="Invalid task status.")
        query = query.where(Task.status == status_filter)
    if search:
        query = query.where(or_(Task.title.ilike(f"%{search}%"), Task.description.ilike(f"%{search}%")))
    return db.scalars(query.order_by(Task.due_date.is_(None), Task.due_date, Task.created_at.desc()).limit(300)).all()


@router.post("/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    project = get_project_or_404(db, payload.project_id)
    if not can_manage_project(project, user):
        raise HTTPException(status_code=403, detail="You can only add tasks to projects you manage.")
    member_ids = {member.id for member in project.members}
    if payload.assignee_id is not None and payload.assignee_id not in member_ids:
        raise HTTPException(status_code=422, detail="The assignee must be a member of this project.")
    task = Task(
        title=payload.title.strip(),
        description=payload.description.strip(),
        project_id=project.id,
        assignee_id=payload.assignee_id,
        status=payload.status,
        priority=payload.priority,
        due_date=payload.due_date,
        created_by_id=user.id,
    )
    db.add(task)
    db.flush()
    log_activity(db, user, project.id, f"created the task {task.title}")
    db.commit()
    return get_task_or_404(db, task.id)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    ensure_can_view_project(task.project, user)
    changes = payload.model_dump(exclude_unset=True)
    if user.role == "employee":
        if task.assignee_id != user.id or set(changes) != {"status"}:
            raise HTTPException(status_code=403, detail="Employees can only update the status of their own tasks.")
    elif not can_manage_project(task.project, user):
        raise HTTPException(status_code=403, detail="Only the project owner or an admin can edit this task.")
    if "assignee_id" in changes and changes["assignee_id"] is not None:
        member_ids = {member.id for member in task.project.members}
        if changes["assignee_id"] not in member_ids:
            raise HTTPException(status_code=422, detail="The assignee must be a member of this project.")
    for key, value in changes.items():
        if value is None and key not in {"assignee_id", "due_date"}:
            raise HTTPException(status_code=422, detail=f"{key} cannot be null.")
    previous_status = task.status
    for key, value in changes.items():
        setattr(task, key, value.strip() if key in {"title", "description"} and value is not None else value)
    if "status" in changes and task.status != previous_status:
        log_activity(db, user, task.project_id, f"moved {task.title} to {task.status.replace('_', ' ')}")
    db.commit()
    return get_task_or_404(db, task.id)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    task = get_task_or_404(db, task_id)
    if not can_manage_project(task.project, user):
        raise HTTPException(status_code=403, detail="Only the project owner or an admin can delete this task.")
    db.delete(task)
    db.commit()


@router.get("/tasks/{task_id}/comments", response_model=list[CommentOut])
def list_comments(
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    ensure_can_view_project(task.project, user)
    return db.scalars(
        select(Comment).options(selectinload(Comment.author)).where(Comment.task_id == task_id).order_by(Comment.created_at)
    ).all()


@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=status.HTTP_201_CREATED)
def add_comment(
    task_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = get_task_or_404(db, task_id)
    ensure_can_view_project(task.project, user)
    comment = Comment(task_id=task_id, author_id=user.id, body=payload.body.strip())
    db.add(comment)
    log_activity(db, user, task.project_id, f"commented on {task.title}")
    db.commit()
    return db.scalar(
        select(Comment).options(selectinload(Comment.author)).where(Comment.id == comment.id)
    )
