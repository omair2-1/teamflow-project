export type Role = 'admin' | 'manager' | 'employee'
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
export type Priority = 'low' | 'medium' | 'high'

export interface User {
  id: number
  full_name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}

export interface Project {
  id: number
  name: string
  description: string
  status: 'active' | 'completed' | 'on_hold'
  due_date: string | null
  created_by_id: number
  created_at: string
  members: User[]
}

export interface Task {
  id: number
  title: string
  description: string
  status: TaskStatus
  priority: Priority
  due_date: string | null
  project_id: number
  assignee_id: number | null
  created_by_id: number
  created_at: string
  updated_at: string
  assignee: User | null
}

export interface Comment {
  id: number
  task_id: number
  body: string
  created_at: string
  author: User
}

export interface DashboardSummary {
  active_projects: number
  my_tasks: number
  completed_tasks: number
  overdue_tasks: number
  projects: Array<{
    id: number
    name: string
    status: Project['status']
    due_date: string | null
    member_count: number
    task_count: number
    completed_count: number
    progress: number
  }>
  activity: Array<{
    id: number
    message: string
    actor_name: string
    created_at: string
  }>
}
