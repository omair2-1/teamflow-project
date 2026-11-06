import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import './App.css'
import {
  apiRequest,
  clearAccessToken,
  getAccessToken,
  saveAccessToken,
} from './api/client'

type Role = 'admin' | 'manager' | 'employee'
type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done'
type Priority = 'low' | 'medium' | 'high'
type ProjectStatus = 'active' | 'completed' | 'on_hold'
type Page = 'dashboard' | 'projects' | 'board' | 'my-tasks' | 'team' | 'activity' | 'settings'
type Theme = 'light' | 'dark'

type User = {
  id: number
  full_name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
}

type Project = {
  id: number
  name: string
  description: string
  status: ProjectStatus
  due_date: string | null
  created_by_id: number
  created_at: string
  members: User[]
}

type Task = {
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

type Comment = {
  id: number
  task_id: number
  body: string
  created_at: string
  author: User
}

type Activity = {
  id: number
  message: string
  actor_name: string
  created_at: string
}

type DashboardSummary = {
  active_projects: number
  my_tasks: number
  completed_tasks: number
  overdue_tasks: number
  projects: Array<{
    id: number
    name: string
    status: ProjectStatus
    due_date: string | null
    member_count: number
    task_count: number
    completed_count: number
    progress: number
  }>
  activity: Activity[]
}

type WorkspaceData = {
  user: User
  summary: DashboardSummary
  projects: Project[]
  tasks: Task[]
  users: User[]
}

type TaskForm = {
  id: number | null
  title: string
  description: string
  project_id: string
  assignee_id: string
  status: TaskStatus
  priority: Priority
  due_date: string
}

type ProjectForm = {
  id: number | null
  name: string
  description: string
  status: ProjectStatus
  due_date: string
  member_ids: string[]
}

type UserForm = {
  full_name: string
  email: string
  password: string
  role: 'manager' | 'employee'
}

const TASK_COLUMNS: Array<{ id: TaskStatus; label: string }> = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'in_review', label: 'In review' },
  { id: 'done', label: 'Done' },
]

const EMPTY_TASK: TaskForm = {
  id: null,
  title: '',
  description: '',
  project_id: '',
  assignee_id: '',
  status: 'todo',
  priority: 'medium',
  due_date: '',
}

const EMPTY_PROJECT: ProjectForm = {
  id: null,
  name: '',
  description: '',
  status: 'active',
  due_date: '',
  member_ids: [],
}

const EMPTY_USER: UserForm = {
  full_name: '',
  email: '',
  password: '',
  role: 'employee',
}

async function fetchWorkspaceData(): Promise<WorkspaceData> {
  const user = await apiRequest<User>('/api/v1/auth/me')
  const [summary, projects, tasks] = await Promise.all([
    apiRequest<DashboardSummary>('/api/v1/dashboard/summary'),
    apiRequest<Project[]>('/api/v1/projects'),
    apiRequest<Task[]>('/api/v1/tasks'),
  ])
  let users: User[] = []
  if (user.role === 'admin' || user.role === 'manager') {
    users = await apiRequest<User[]>('/api/v1/users')
  }
  return { user, summary, projects, tasks, users }
}

function isApiUnauthorized(error: unknown): boolean {
  return error instanceof Error && 'status' in error && (error as { status: number }).status === 401
}

function formatDate(value: string | null | undefined): string {
  if (!value) return 'No due date'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? 'No due date'
    : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date)
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U'
}

function canManageProject(project: Project | undefined, user: User | null): boolean {
  return Boolean(project && user && (user.role === 'admin' || project.created_by_id === user.id))
}

function pageTitle(page: Page): string {
  const titles: Record<Page, string> = {
    dashboard: 'Dashboard',
    projects: 'Projects',
    board: 'Task board',
    'my-tasks': 'My tasks',
    team: 'Team members',
    activity: 'Activity',
    settings: 'Settings',
  }
  return titles[page]
}

function App() {
  const [token, setToken] = useState<string | null>(() => getAccessToken())
  const [user, setUser] = useState<User | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()))
  const [refreshing, setRefreshing] = useState(false)
  const [loginBusy, setLoginBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [appError, setAppError] = useState('')
  const [page, setPage] = useState<Page>('dashboard')
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem('teamflow_theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  const [taskSearch, setTaskSearch] = useState('')
  const [taskStatusFilter, setTaskStatusFilter] = useState('all')
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('all')
  const [taskProjectFilter, setTaskProjectFilter] = useState('all')
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState('all')

  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [projectForm, setProjectForm] = useState<ProjectForm>(EMPTY_PROJECT)
  const [projectSaving, setProjectSaving] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskForm, setTaskForm] = useState<TaskForm>(EMPTY_TASK)
  const [taskSaving, setTaskSaving] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentBody, setCommentBody] = useState('')
  const [commentSaving, setCommentSaving] = useState(false)
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [userForm, setUserForm] = useState<UserForm>(EMPTY_USER)
  const [userSaving, setUserSaving] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('teamflow_theme', theme)
    } catch {
      // The theme still applies for this tab when browser storage is unavailable.
    }
  }, [theme])

  useEffect(() => {
    if (!token) return
    let active = true

    async function loadWorkspace() {
      setLoading(true)
      try {
        const data = await fetchWorkspaceData()
        if (!active) return
        setUser(data.user)
        setSummary(data.summary)
        setProjects(data.projects)
        setTasks(data.tasks)
        setUsers(data.users)
        setAppError('')
      } catch (error) {
        if (!active) return
        if (isApiUnauthorized(error)) {
          clearAccessToken()
          setToken(null)
          setUser(null)
          setLoginError('Your session expired. Please sign in again.')
        } else {
          setAppError(error instanceof Error ? error.message : 'Could not load your workspace.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadWorkspace()
    return () => {
      active = false
    }
  }, [token])

  async function reloadWorkspace() {
    setRefreshing(true)
    try {
      const data = await fetchWorkspaceData()
      setUser(data.user)
      setSummary(data.summary)
      setProjects(data.projects)
      setTasks(data.tasks)
      setUsers(data.users)
      setAppError('')
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not refresh your workspace.')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginBusy(true)
    try {
      const result = await apiRequest<{ access_token: string; token_type: string }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      saveAccessToken(result.access_token)
      setPassword('')
      setLoading(true)
      setToken(result.access_token)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'Unable to sign in.')
    } finally {
      setLoginBusy(false)
    }
  }

  function handleLogout() {
    clearAccessToken()
    setToken(null)
    setUser(null)
    setSummary(null)
    setProjects([])
    setTasks([])
    setUsers([])
    setLoginError('')
    setAppError('')
    setPassword('')
    setLoading(false)
    setPage('dashboard')
  }

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])

  const filteredTasks = useMemo(() => {
    const query = taskSearch.trim().toLowerCase()
    return tasks.filter((task) => {
      if (page === 'my-tasks' && task.assignee_id !== user?.id) return false
      if (taskStatusFilter !== 'all' && task.status !== taskStatusFilter) return false
      if (taskPriorityFilter !== 'all' && task.priority !== taskPriorityFilter) return false
      if (taskProjectFilter !== 'all' && String(task.project_id) !== taskProjectFilter) return false
      if (taskAssigneeFilter !== 'all' && String(task.assignee_id ?? '') !== taskAssigneeFilter) return false
      if (query) {
        const projectName = projectById.get(task.project_id)?.name ?? ''
        const assigneeName = task.assignee?.full_name ?? ''
        const haystack = `${task.title} ${task.description} ${projectName} ${assigneeName}`.toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [tasks, user, page, taskSearch, taskStatusFilter, taskPriorityFilter, taskProjectFilter, taskAssigneeFilter, projectById])

  function resetTaskFilters() {
    setTaskSearch('')
    setTaskStatusFilter('all')
    setTaskPriorityFilter('all')
    setTaskProjectFilter('all')
    setTaskAssigneeFilter('all')
  }

  function openNewProject() {
    setProjectForm({ ...EMPTY_PROJECT, member_ids: [] })
    setProjectModalOpen(true)
  }

  function openEditProject(project: Project) {
    setProjectForm({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      due_date: project.due_date ?? '',
      member_ids: project.members.map((member) => String(member.id)),
    })
    setProjectModalOpen(true)
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectForm.name.trim()) return
    setProjectSaving(true)
    try {
      const payload = {
        name: projectForm.name.trim(),
        description: projectForm.description.trim(),
        due_date: projectForm.due_date || null,
        member_ids: projectForm.member_ids.map(Number),
      }
      if (projectForm.id) {
        await apiRequest<Project>(`/api/v1/projects/${projectForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...payload, status: projectForm.status }),
        })
      } else {
        await apiRequest<Project>('/api/v1/projects', {
          method: 'POST',
          body: JSON.stringify(payload),
        })
      }
      setProjectModalOpen(false)
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not save the project.')
    } finally {
      setProjectSaving(false)
    }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete “${project.name}” and all of its tasks? This cannot be undone.`)) return
    try {
      await apiRequest<null>(`/api/v1/projects/${project.id}`, { method: 'DELETE' })
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not delete the project.')
    }
  }

  function openNewTask(projectId?: number) {
    const manageable = projects.filter((project) => canManageProject(project, user))
    const defaultProject = projectId && manageable.some((project) => project.id === projectId)
      ? String(projectId)
      : manageable[0]
        ? String(manageable[0].id)
        : ''
    setTaskForm({ ...EMPTY_TASK, project_id: defaultProject })
    setComments([])
    setCommentBody('')
    setTaskModalOpen(true)
  }

  async function openExistingTask(task: Task) {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description,
      project_id: String(task.project_id),
      assignee_id: task.assignee_id ? String(task.assignee_id) : '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ?? '',
    })
    setComments([])
    setCommentBody('')
    setTaskModalOpen(true)
    setCommentsLoading(true)
    try {
      const data = await apiRequest<Comment[]>(`/api/v1/tasks/${task.id}/comments`)
      setComments(data)
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not load comments.')
    } finally {
      setCommentsLoading(false)
    }
  }

  const selectedTaskProject = taskForm.project_id ? projectById.get(Number(taskForm.project_id)) : undefined
  const canEditSelectedTask = Boolean(taskForm.id && user && canManageProject(selectedTaskProject, user))
  const canEmployeeUpdateSelectedTask = Boolean(
    taskForm.id && user?.role === 'employee' && tasks.find((task) => task.id === taskForm.id)?.assignee_id === user.id,
  )

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!taskForm.title.trim() || !taskForm.project_id) return
    setTaskSaving(true)
    try {
      if (taskForm.id) {
        const payload = canEmployeeUpdateSelectedTask
          ? { status: taskForm.status }
          : {
              title: taskForm.title.trim(),
              description: taskForm.description.trim(),
              assignee_id: taskForm.assignee_id ? Number(taskForm.assignee_id) : null,
              status: taskForm.status,
              priority: taskForm.priority,
              due_date: taskForm.due_date || null,
            }
        await apiRequest<Task>(`/api/v1/tasks/${taskForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      } else {
        await apiRequest<Task>('/api/v1/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: taskForm.title.trim(),
            description: taskForm.description.trim(),
            project_id: Number(taskForm.project_id),
            assignee_id: taskForm.assignee_id ? Number(taskForm.assignee_id) : null,
            status: taskForm.status,
            priority: taskForm.priority,
            due_date: taskForm.due_date || null,
          }),
        })
      }
      setTaskModalOpen(false)
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not save the task.')
    } finally {
      setTaskSaving(false)
    }
  }

  async function updateTaskStatus(task: Task, nextStatus: TaskStatus) {
    if (task.status === nextStatus) return
    const project = projectById.get(task.project_id)
    const permitted = canManageProject(project, user) || (user?.role === 'employee' && task.assignee_id === user.id)
    if (!permitted) return
    try {
      const updated = await apiRequest<Task>(`/api/v1/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not update the task status.')
    }
  }

  async function deleteTask(task: Task) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return
    try {
      await apiRequest<null>(`/api/v1/tasks/${task.id}`, { method: 'DELETE' })
      setTaskModalOpen(false)
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not delete the task.')
    }
  }

  async function addComment() {
    if (!taskForm.id || !commentBody.trim()) return
    setCommentSaving(true)
    try {
      const comment = await apiRequest<Comment>(`/api/v1/tasks/${taskForm.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: commentBody.trim() }),
      })
      setComments((current) => [...current, comment])
      setCommentBody('')
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not add your comment.')
    } finally {
      setCommentSaving(false)
    }
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setUserSaving(true)
    try {
      await apiRequest<User>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: userForm.full_name.trim(),
          email: userForm.email.trim().toLowerCase(),
          password: userForm.password,
          role: userForm.role,
        }),
      })
      setTeamModalOpen(false)
      setUserForm(EMPTY_USER)
      await reloadWorkspace()
    } catch (error) {
      setAppError(error instanceof Error ? error.message : 'Could not create the account.')
    } finally {
      setUserSaving(false)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, status: TaskStatus) {
    event.preventDefault()
    const id = Number(event.dataTransfer.getData('text/plain'))
    const task = tasks.find((item) => item.id === id)
    if (task) void updateTaskStatus(task, status)
  }

  if (!token) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="login-brand"><span className="brand-mark">T</span><span>TeamFlow</span></div>
          <div className="login-heading">
            <span className="eyebrow">YOUR TEAM WORKSPACE</span>
            <h1>Welcome back</h1>
            <p>Sign in to bring your team's work together.</p>
          </div>
          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            <label htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            {loginError && <div className="alert alert-error" role="alert">{loginError}</div>}
            <button className="button button-primary button-wide" type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in'}</button>
          </form>
          <p className="login-note">TeamFlow · One clear place for better teamwork</p>
        </section>
      </main>
    )
  }

  if (loading || !user) {
    if (!loading && appError) {
      return <main className="loading-page"><section className="login-card load-error-card"><span className="brand-mark">T</span><h1>Workspace unavailable</h1><p>{appError}</p><button className="button button-primary button-wide" onClick={() => { setLoading(true); setAppError(''); void fetchWorkspaceData().then((data) => { setUser(data.user); setSummary(data.summary); setProjects(data.projects); setTasks(data.tasks); setUsers(data.users) }).catch((error: unknown) => setAppError(error instanceof Error ? error.message : 'Could not load your workspace.')).finally(() => setLoading(false)) }}>Try again</button><button className="button button-quiet button-wide" onClick={handleLogout}>Back to sign in</button></section></main>
    }
    return <main className="loading-page"><span className="brand-mark">T</span><p>Loading your TeamFlow workspace…</p></main>
  }

  const isAdmin = user.role === 'admin'
  const canCreateProject = user.role === 'admin' || user.role === 'manager'
  const canCreateTask = canCreateProject && projects.some((project) => canManageProject(project, user))
  const projectForTask = (task: Task) => projectById.get(task.project_id)
  const openTaskCount = tasks.filter((task) => task.assignee_id === user.id && task.status !== 'done').length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#dashboard" onClick={(event) => { event.preventDefault(); setPage('dashboard') }}>
          <span className="brand-mark">T</span><span>TeamFlow</span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Workspace navigation">
          <NavItem active={page === 'dashboard'} label="Dashboard" icon="⌂" onClick={() => setPage('dashboard')} />
          <NavItem active={page === 'projects'} label="Projects" icon="▦" onClick={() => setPage('projects')} />
          <NavItem active={page === 'board'} label="Task board" icon="▤" onClick={() => setPage('board')} />
          <NavItem active={page === 'my-tasks'} label="My tasks" icon="✓" onClick={() => setPage('my-tasks')} count={openTaskCount} />
          {(user.role === 'admin' || user.role === 'manager') && <NavItem active={page === 'team'} label="Team members" icon="♙" onClick={() => setPage('team')} />}
          <div className="sidebar-section-label sidebar-section-spaced">INSIGHTS</div>
          <NavItem active={page === 'activity'} label="Activity" icon="◷" onClick={() => setPage('activity')} />
          <NavItem active={page === 'settings'} label="Settings" icon="⚙" onClick={() => setPage('settings')} />
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar avatar-large">{initials(user.full_name)}</div>
          <div className="sidebar-user"><strong>{user.full_name}</strong><span>{user.role}</span></div>
          <button className="icon-button sidebar-logout" onClick={handleLogout} title="Log out" aria-label="Log out">↪</button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div><div className="breadcrumb">Workspace <span>/</span> {pageTitle(page)}</div><h1>{pageTitle(page)}</h1></div>
          <div className="topbar-actions">
            <span className="today-label">{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date())}</span>
            <button className="icon-button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} title="Switch theme">{theme === 'light' ? '☾' : '☀'}</button>
            <button className="button button-quiet refresh-button" onClick={() => void reloadWorkspace()} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button>
            <div className="avatar">{initials(user.full_name)}</div>
          </div>
        </header>

        {appError && <div className="alert alert-error page-alert" role="alert"><span>{appError}</span><button className="alert-dismiss" onClick={() => setAppError('')} aria-label="Dismiss error">×</button></div>}

        {page === 'dashboard' && (
          <>
            <section className="welcome-panel">
              <div><span className="eyebrow">YOUR WORKSPACE AT A GLANCE</span><h2>Good to see you, {user.full_name.split(' ')[0]}.</h2><p>Here's what's moving across your team today.</p></div>
              <div className="welcome-actions">
                {canCreateProject && <button className="button button-primary" onClick={openNewProject}>＋ New project</button>}
                {canCreateTask && <button className="button button-outline" onClick={() => openNewTask()}>＋ Add task</button>}
              </div>
            </section>
            <section className="stats-grid" aria-label="Workspace statistics">
              <StatCard label="Active projects" value={summary?.active_projects ?? 0} icon="▦" tone="purple" detail="Across your workspace" />
              <StatCard label="My pending tasks" value={summary?.my_tasks ?? 0} icon="✓" tone="blue" detail="Assigned and not completed" />
              <StatCard label="Completed tasks" value={summary?.completed_tasks ?? 0} icon="↗" tone="green" detail="Completed in visible projects" />
              <StatCard label="Overdue tasks" value={summary?.overdue_tasks ?? 0} icon="◷" tone="orange" detail="Past due and still open" />
            </section>
            <section className="content-section">
              <div className="section-heading"><div><h2>Recent projects</h2><p>Keep track of the work your team is moving forward.</p></div><button className="text-button" onClick={() => setPage('projects')}>View all projects →</button></div>
              <div className="project-grid">
                {(summary?.projects ?? []).length === 0 && <EmptyState title="No projects yet" text="Create your first project to start coordinating work." action={canCreateProject ? <button className="button button-primary" onClick={openNewProject}>Create project</button> : undefined} />}
                {(summary?.projects ?? []).map((project, index) => <article className="project-card" key={project.id}>
                  <div className="project-card-top"><span className={`project-symbol symbol-${index % 4}`}>{initials(project.name).slice(0, 1)}</span><span className={`status-pill status-${project.status}`}>{project.status.replace('_', ' ')}</span></div>
                  <h3>{project.name}</h3><p className="project-meta">{project.member_count} members <span>·</span> {project.task_count} tasks</p>
                  <div className="progress-heading"><span>Overall progress</span><strong>{project.progress}%</strong></div><div className="progress-track"><span style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} /></div>
                  <div className="project-card-footer"><span>Due {formatDate(project.due_date)}</span><button className="text-button" onClick={() => { setTaskProjectFilter(String(project.id)); setPage('board') }}>Open board →</button></div>
                </article>)}
              </div>
            </section>
            <ActivityPanel activity={summary?.activity ?? []} />
          </>
        )}

        {page === 'projects' && (
          <section className="content-section page-section">
            <div className="section-heading"><div><h2>All projects</h2><p>{projects.length} projects in the workspace you can access.</p></div>{canCreateProject && <button className="button button-primary" onClick={openNewProject}>＋ New project</button>}</div>
            <div className="project-grid project-grid-large">
              {projects.length === 0 && <EmptyState title="Nothing here yet" text="Projects you create or are added to will appear here." action={canCreateProject ? <button className="button button-primary" onClick={openNewProject}>Create a project</button> : undefined} />}
              {projects.map((project, index) => {
                const related = tasks.filter((task) => task.project_id === project.id)
                const done = related.filter((task) => task.status === 'done').length
                const progress = related.length ? Math.round((done / related.length) * 100) : 0
                const canManage = canManageProject(project, user)
                return <article className="project-card" key={project.id}>
                  <div className="project-card-top"><span className={`project-symbol symbol-${index % 4}`}>{initials(project.name).slice(0, 1)}</span><span className={`status-pill status-${project.status}`}>{project.status.replace('_', ' ')}</span></div>
                  <h3>{project.name}</h3><p className="project-description">{project.description || 'No project description has been added yet.'}</p>
                  <div className="member-stack" aria-label={`${project.members.length} project members`}>{project.members.slice(0, 4).map((member) => <span className="avatar avatar-small" title={member.full_name} key={member.id}>{initials(member.full_name)}</span>)}<span className="member-count">{project.members.length} members</span></div>
                  <div className="progress-heading"><span>{done} of {related.length} tasks complete</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                  <div className="project-card-footer"><span>Due {formatDate(project.due_date)}</span><button className="text-button" onClick={() => { setTaskProjectFilter(String(project.id)); setPage('board') }}>View tasks →</button></div>
                  {canManage && <div className="project-card-actions"><button className="button button-quiet button-small" onClick={() => openEditProject(project)}>Edit project</button><button className="button button-danger-quiet button-small" onClick={() => void deleteProject(project)}>Delete</button></div>}
                </article>
              })}
            </div>
          </section>
        )}

        {(page === 'board' || page === 'my-tasks') && (
          <section className="content-section page-section">
            <div className="section-heading"><div><h2>{page === 'my-tasks' ? 'Work assigned to me' : 'Move work forward'}</h2><p>{page === 'my-tasks' ? 'Your tasks across the projects you can access.' : 'Drag a task to another column to update its status.'}</p></div>{canCreateTask && <button className="button button-primary" onClick={() => openNewTask(taskProjectFilter === 'all' ? undefined : Number(taskProjectFilter))}>＋ Add task</button>}</div>
            <div className="filter-bar">
              <label className="search-field"><span>⌕</span><input aria-label="Search tasks" placeholder="Search tasks, projects, people…" value={taskSearch} onChange={(event) => setTaskSearch(event.target.value)} /></label>
              <select aria-label="Filter by project" value={taskProjectFilter} onChange={(event) => setTaskProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select>
              <select aria-label="Filter by status" value={taskStatusFilter} onChange={(event) => setTaskStatusFilter(event.target.value)}><option value="all">All statuses</option>{TASK_COLUMNS.map((column) => <option value={column.id} key={column.id}>{column.label}</option>)}</select>
              <select aria-label="Filter by priority" value={taskPriorityFilter} onChange={(event) => setTaskPriorityFilter(event.target.value)}><option value="all">All priorities</option><option value="high">High priority</option><option value="medium">Medium priority</option><option value="low">Low priority</option></select>
              {(user.role === 'admin' || user.role === 'manager') && <select aria-label="Filter by assignee" value={taskAssigneeFilter} onChange={(event) => setTaskAssigneeFilter(event.target.value)}><option value="all">All assignees</option><option value="">Unassigned</option>{users.map((member) => <option value={member.id} key={member.id}>{member.full_name}</option>)}</select>}
              <button className="text-button clear-filters" onClick={resetTaskFilters}>Clear</button>
            </div>
            <div className="board-grid">
              {TASK_COLUMNS.map((column) => {
                const columnTasks = filteredTasks.filter((task) => task.status === column.id)
                return <div className="board-column" key={column.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleDrop(event, column.id)}>
                  <div className="column-heading"><span className={`column-dot dot-${column.id}`} /><h3>{column.label}</h3><span className="column-count">{columnTasks.length}</span></div>
                  <div className="column-cards">
                    {columnTasks.map((task) => {
                      const project = projectForTask(task)
                      const canMove = canManageProject(project, user) || (user.role === 'employee' && task.assignee_id === user.id)
                      return <article className="task-card" key={task.id} draggable={canMove} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(task.id))} onClick={() => void openExistingTask(task)}>
                        <div className="task-card-top"><span className={`priority-label priority-${task.priority}`}>{task.priority} priority</span><span className="task-menu-mark">•••</span></div>
                        <h4>{task.title}</h4><p className="task-project-name">{project?.name ?? 'Project'}</p>
                        {task.description && <p className="task-description-preview">{task.description}</p>}
                        <div className="task-card-footer"><span className="task-assignee"><span className="avatar avatar-tiny">{task.assignee ? initials(task.assignee.full_name) : '—'}</span>{task.assignee?.full_name ?? 'Unassigned'}</span><span className={task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'done' ? 'due-date due-overdue' : 'due-date'}>{task.due_date ? formatDate(task.due_date) : 'No date'}</span></div>
                      </article>
                    })}
                    {columnTasks.length === 0 && <div className="column-empty">No tasks in this stage</div>}
                  </div>
                </div>
              })}
            </div>
            <p className="board-footnote">Showing up to 300 tasks. Task updates are checked by the API using your role and project access.</p>
          </section>
        )}

        {page === 'team' && (user.role === 'admin' || user.role === 'manager') && (
          <section className="content-section page-section">
            <div className="section-heading"><div><h2>Your teammates</h2><p>People with active accounts in this company workspace.</p></div>{isAdmin && <button className="button button-primary" onClick={() => { setUserForm(EMPTY_USER); setTeamModalOpen(true) }}>＋ Add team member</button>}</div>
            <div className="table-card"><div className="team-table-head"><span>Member</span><span>Role</span><span>Joined</span><span>Status</span></div>
              {users.map((member) => <div className="team-row" key={member.id}><div className="team-member"><span className="avatar">{initials(member.full_name)}</span><div><strong>{member.full_name}</strong><small>{member.email}</small></div></div><span className={`role-pill role-${member.role}`}>{member.role}</span><span className="team-date">{formatDate(member.created_at.slice(0, 10))}</span><span className="member-active"><i /> Active</span></div>)}
              {users.length === 0 && <EmptyState title="No team members found" text="Active team accounts will appear here." />}
            </div>
            {!isAdmin && <p className="permission-note">Only an Admin can create or manage team accounts.</p>}
          </section>
        )}

        {page === 'activity' && <section className="content-section page-section"><div className="section-heading"><div><h2>Recent activity</h2><p>A shared timeline of updates from the projects you can access.</p></div></div><ActivityPanel activity={summary?.activity ?? []} /></section>}

        {page === 'settings' && (
          <section className="content-section page-section settings-layout">
            <article className="settings-card"><div><h2>Appearance</h2><p>Choose how TeamFlow looks on this device.</p></div><div className="theme-options"><button className={`theme-option ${theme === 'light' ? 'selected' : ''}`} onClick={() => setTheme('light')}><span className="theme-preview theme-preview-light" /><strong>Light</strong><small>Bright workspace</small></button><button className={`theme-option ${theme === 'dark' ? 'selected' : ''}`} onClick={() => setTheme('dark')}><span className="theme-preview theme-preview-dark" /><strong>Dark</strong><small>Easy on the eyes</small></button></div></article>
            <article className="settings-card"><div><h2>Your account</h2><p>Profile details associated with your sign-in.</p></div><div className="profile-details"><div className="avatar avatar-large">{initials(user.full_name)}</div><div><strong>{user.full_name}</strong><span>{user.email}</span><span className={`role-pill role-${user.role}`}>{user.role}</span></div></div></article>
            <article className="settings-card"><div><h2>Session</h2><p>Sign out of this browser session.</p></div><button className="button button-outline" onClick={handleLogout}>Log out</button></article>
          </section>
        )}

        <footer className="app-footer">TeamFlow <span>·</span> Built for clearer teamwork</footer>
      </main>

      {projectModalOpen && <Modal title={projectForm.id ? 'Edit project' : 'Create a project'} onClose={() => setProjectModalOpen(false)}>
        <form className="modal-form" onSubmit={saveProject}>
          <label>Project name<input value={projectForm.name} onChange={(event) => setProjectForm({ ...projectForm, name: event.target.value })} minLength={3} maxLength={140} required placeholder="e.g. Website redesign" /></label>
          <label>Description<textarea value={projectForm.description} onChange={(event) => setProjectForm({ ...projectForm, description: event.target.value })} maxLength={3000} rows={3} placeholder="What is this project about?" /></label>
          <div className="form-row"><label>Due date<input type="date" value={projectForm.due_date} onChange={(event) => setProjectForm({ ...projectForm, due_date: event.target.value })} /></label>{projectForm.id && <label>Status<select value={projectForm.status} onChange={(event) => setProjectForm({ ...projectForm, status: event.target.value as ProjectStatus })}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option></select></label>}</div>
          <label>Project members<select multiple className="multi-select" value={projectForm.member_ids} onChange={(event) => setProjectForm({ ...projectForm, member_ids: Array.from(event.target.selectedOptions, (option) => option.value) })}>{users.map((member) => <option value={member.id} key={member.id}>{member.full_name} · {member.role}</option>)}</select><small className="field-help">Hold Ctrl (Windows) or Command (Mac) to select more than one person. You will be included as project owner.</small></label>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setProjectModalOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={projectSaving}>{projectSaving ? 'Saving…' : projectForm.id ? 'Save changes' : 'Create project'}</button></div>
        </form>
      </Modal>}

      {taskModalOpen && <Modal title={taskForm.id ? 'Task details' : 'Create a task'} onClose={() => setTaskModalOpen(false)} wide>
        <form className="modal-form" onSubmit={saveTask}>
          <label>Task title<input value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} minLength={3} maxLength={180} required disabled={Boolean(taskForm.id && !canEditSelectedTask)} /></label>
          <label>Project<select value={taskForm.project_id} onChange={(event) => setTaskForm({ ...taskForm, project_id: event.target.value, assignee_id: '' })} required disabled={Boolean(taskForm.id)}>{(taskForm.id ? projects : projects.filter((project) => canManageProject(project, user))).map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <label>Description<textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} rows={3} maxLength={5000} disabled={Boolean(taskForm.id && !canEditSelectedTask)} /></label>
          <div className="form-row form-row-three">
            <label>Status<select value={taskForm.status} onChange={(event) => setTaskForm({ ...taskForm, status: event.target.value as TaskStatus })} disabled={Boolean(taskForm.id && !canEditSelectedTask && !canEmployeeUpdateSelectedTask)}>{TASK_COLUMNS.map((column) => <option value={column.id} key={column.id}>{column.label}</option>)}</select></label>
            <label>Priority<select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value as Priority })} disabled={Boolean(taskForm.id && !canEditSelectedTask)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            <label>Due date<input type="date" value={taskForm.due_date} onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })} disabled={Boolean(taskForm.id && !canEditSelectedTask)} /></label>
          </div>
          <label>Assignee<select value={taskForm.assignee_id} onChange={(event) => setTaskForm({ ...taskForm, assignee_id: event.target.value })} disabled={Boolean(taskForm.id && !canEditSelectedTask)}><option value="">Unassigned</option>{(selectedTaskProject?.members ?? []).map((member) => <option value={member.id} key={member.id}>{member.full_name}</option>)}</select></label>
          {taskForm.id && <section className="comments-section"><div className="comments-heading"><h3>Conversation</h3><span>{comments.length} comments</span></div>{commentsLoading ? <p className="muted-text">Loading comments…</p> : comments.length === 0 ? <p className="muted-text">No comments yet. Start the conversation.</p> : <div className="comments-list">{comments.map((comment) => <article className="comment-item" key={comment.id}><span className="avatar avatar-small">{initials(comment.author.full_name)}</span><div><div className="comment-meta"><strong>{comment.author.full_name}</strong><time>{formatDateTime(comment.created_at)}</time></div><p>{comment.body}</p></div></article>)}</div>}
            <div className="comment-form"><input aria-label="Write a comment" placeholder="Write a comment…" value={commentBody} onChange={(event) => setCommentBody(event.target.value)} maxLength={2000} /><button className="button button-primary" type="button" onClick={() => void addComment()} disabled={commentSaving || !commentBody.trim()}>{commentSaving ? 'Posting…' : 'Post'}</button></div>
          </section>}
          <div className="modal-actions modal-actions-spread">{taskForm.id && canEditSelectedTask ? <button type="button" className="button button-danger-quiet" onClick={() => { const task = tasks.find((item) => item.id === taskForm.id); if (task) void deleteTask(task) }}>Delete task</button> : <span />}
            <div><button type="button" className="button button-quiet" onClick={() => setTaskModalOpen(false)}>Close</button>{(!taskForm.id || canEditSelectedTask || canEmployeeUpdateSelectedTask) && <button type="submit" className="button button-primary" disabled={taskSaving}>{taskSaving ? 'Saving…' : taskForm.id ? 'Save changes' : 'Create task'}</button>}</div>
          </div>
          {taskForm.id && !canEditSelectedTask && !canEmployeeUpdateSelectedTask && <p className="permission-note">You can comment on this task, but only the project owner or an Admin can edit it.</p>}
        </form>
      </Modal>}

      {teamModalOpen && <Modal title="Add team member" onClose={() => setTeamModalOpen(false)}>
        <form className="modal-form" onSubmit={saveUser}>
          <p className="modal-intro">Create an account for someone in your company. They can sign in with the email and temporary password you provide.</p>
          <label>Full name<input value={userForm.full_name} onChange={(event) => setUserForm({ ...userForm, full_name: event.target.value })} minLength={2} maxLength={120} required /></label>
          <label>Email address<input type="email" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} required /></label>
          <label>Temporary password<input type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} minLength={10} maxLength={128} autoComplete="new-password" required /><small className="field-help">Use at least 10 characters and share it with the teammate securely.</small></label>
          <label>Role<select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value as 'manager' | 'employee' })}><option value="employee">Employee</option><option value="manager">Manager</option></select></label>
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setTeamModalOpen(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={userSaving}>{userSaving ? 'Creating…' : 'Create account'}</button></div>
        </form>
      </Modal>}
    </div>
  )
}

function NavItem({ active, label, icon, onClick, count }: { active: boolean; label: string; icon: string; onClick: () => void; count?: number }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span>{count !== undefined && count > 0 && <small className="nav-count">{count}</small>}</button>
}

function StatCard({ label, value, icon, tone, detail }: { label: string; value: number; icon: string; tone: string; detail: string }) {
  return <article className="stat-card"><div className="stat-card-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}>{icon}</span></div><strong className="stat-value">{value}</strong><small>{detail}</small></article>
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-state-icon">◇</span><h3>{title}</h3><p>{text}</p>{action}</div>
}

function ActivityPanel({ activity }: { activity: Activity[] }) {
  return <section className="content-section activity-section"><div className="section-heading"><div><h2>Recent activity</h2><p>Stay up to date with the latest team updates.</p></div></div><div className="activity-card">
    {activity.length === 0 ? <p className="muted-text">No recent activity yet.</p> : activity.map((item) => <article className="activity-item" key={item.id}><span className="activity-marker" /><div><strong>{item.actor_name}</strong><p>{item.message}</p><time>{formatDateTime(item.created_at)}</time></div></article>)}
  </div></section>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><header className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></header>{children}</section></div>
}

export default App
