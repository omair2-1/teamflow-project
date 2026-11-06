from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Activity, Project, Task, User
from app.api.workspace import visible_project_ids

router = APIRouter(tags=["Dashboard"])


@router.get("/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    project_ids = visible_project_ids(db, user)
    if not project_ids:
        return {
            "active_projects": 0,
            "my_tasks": 0,
            "completed_tasks": 0,
            "overdue_tasks": 0,
            "projects": [],
            "activity": [],
        }

    active_projects = db.scalar(
        select(func.count(Project.id)).where(Project.id.in_(project_ids), Project.status == "active")
    ) or 0
    my_tasks = db.scalar(
        select(func.count(Task.id)).where(Task.project_id.in_(project_ids), Task.assignee_id == user.id, Task.status != "done")
    ) or 0
    completed_tasks = db.scalar(
        select(func.count(Task.id)).where(Task.project_id.in_(project_ids), Task.status == "done")
    ) or 0
    overdue_tasks = db.scalar(
        select(func.count(Task.id)).where(
            Task.project_id.in_(project_ids), Task.due_date < date.today(), Task.status != "done"
        )
    ) or 0

    projects = db.scalars(
        select(Project).options(selectinload(Project.members)).where(Project.id.in_(project_ids))
        .order_by(Project.created_at.desc()).limit(4)
    ).all()
    task_counts = db.execute(
        select(
            Task.project_id,
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == "done", 1), else_=0)).label("done"),
        )
        .where(Task.project_id.in_([project.id for project in projects]))
        .group_by(Task.project_id)
    ).all()
    counts_by_project = {row.project_id: (row.total, row.done or 0) for row in task_counts}
    project_cards = []
    for project in projects:
        total, done_count = counts_by_project.get(project.id, (0, 0))
        project_cards.append({
            "id": project.id,
            "name": project.name,
            "status": project.status,
            "due_date": project.due_date,
            "member_count": len(project.members),
            "task_count": total,
            "completed_count": done_count,
            "progress": round((done_count / total) * 100) if total else 0,
        })

    activity = db.scalars(
        select(Activity).options(selectinload(Activity.actor))
        .where(Activity.project_id.in_(project_ids))
        .order_by(Activity.created_at.desc()).limit(8)
    ).all()
    activity_items = [
        {
            "id": item.id,
            "message": item.message,
            "actor_name": item.actor.full_name,
            "created_at": item.created_at,
        }
        for item in activity
    ]
    return {
        "active_projects": active_projects,
        "my_tasks": my_tasks,
        "completed_tasks": completed_tasks,
        "overdue_tasks": overdue_tasks,
        "projects": project_cards,
        "activity": activity_items,
    }
