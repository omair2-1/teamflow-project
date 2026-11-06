import { FormEvent, ReactNode, useEffect, useState } from 'react'
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  LogOut,
  MessageCircle,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { request } from './api'
import type { Comment, DashboardSummary, Project, Task, TaskStatus, User } from './types'

const statusLabels: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
}
const statusOrder: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done']

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

function prettyDate(value?: string | null) {
  if (!value) return 'No due date'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function relativeDate(value: string) {
  const date = new Date(value)
  const days = Math.round((date.getTime() - Date.now()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)} days ago`
  if (days < 7) return `In ${days} days`
  return prettyDate(value.slice(0, 10))
}

function canManageProject(project: Project, user: User) {
  return user.role === 'admin' || (user.role === 'manager' && project.created_by_id === user.id)
}

function App() {
  const [token, setToken] = useState(() => sessionStorage.getItem('teamflow_token'))
  const [user, setUser] = useState<User | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(Boolean(sessionStorage.getItem('teamflow_token')))
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('teamflow_theme')
    return saved === 'dark' ? 'dark' : 'light'
  })
  const [activePage, setActivePage] = useState<'overview' | 'projects' | 'tasks' | 'team' | 'settings'>('overview')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loadingData, setLoadingData] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [globalError, setGlobalError] = useState('')
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [userModalOpen, setUserModalOpen] = useState(false)
  const [taskModal, setTaskModal] = useState<{ task: Task | null; project: Project } | null>(null)
  const [taskSearch, setTaskSearch] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('teamflow_theme', theme)
  }, [theme])

  useEffect(() => {
    const onUnauthorized = () => {
      setToken(null)
      setUser(null)
      setSummary(null)
      setProjects([])
      setTasks([])
      setUsers([])
    }
    window.addEventListener('teamflow:unauthorized', onUnauthorized)
    return () => window.removeEventListener('teamflow:unauthorized', onUnauthorized)
  }, [])

  useEffect(() => {
    if (!token) {
      setCheckingAuth(false)
      setUser(null)
      return
    }
    setCheckingAuth(true)
    request<User>('/auth/me')
      .then(setUser)
      .catch(() => {
        sessionStorage.removeItem('teamflow_token')
        setToken(null)
        setUser(null)
      })
      .finally(() => setCheckingAuth(false))
  }, [token])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoadingData(true)
    setGlobalError('')
    Promise.all([
      request<DashboardSummary>('/dashboard/summary'),
      request<Project[]>('/projects'),
      request<Task[]>('/tasks'),
      user.role === 'admin' || user.role === 'manager' ? request<User[]>('/users') : Promise.resolve([]),
    ])
      .then(([nextSummary, nextProjects, nextTasks, nextUsers]) => {
        if (cancelled) return
        setSummary(nextSummary)
        setProjects(nextProjects)
        setTasks(nextTasks)
        setUsers(nextUsers)
        if (selectedProjectId && !nextProjects.some((project) => project.id === selectedProjectId)) {
          setSelectedProjectId(null)
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setGlobalError(error instanceof Error ? error.message : 'Could not load workspace data.')
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false)
      })
    return () => { cancelled = true }
  }, [user, refreshKey])

  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null

  async function handleLogin(email: string, password: string) {
    const result = await request<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    sessionStorage.setItem('teamflow_token', result.access_token)
    setToken(result.access_token)
    setCheckingAuth(true)
  }

  function logout() {
    sessionStorage.removeItem('teamflow_token')
    setToken(null)
    setUser(null)
    setSelectedProjectId(null)
    setSummary(null)
    setProjects([])
    setTasks([])
    setUsers([])
  }

  function refresh() {
    setRefreshKey((value) => value + 1)
  }

  function navigate(page: typeof activePage) {
    setActivePage(page)
    setSelectedProjectId(null)
  }

  if (checkingAuth) return <div className="page-loader"><div className="loader-ring" /><span>Opening your workspace…</span></div>
  if (!token || !user) return <LoginPage onLogin={handleLogin} theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} />

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        user={user}
        onNavigate={navigate}
        onLogout={logout}
      />
      <main className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            {selectedProject ? (
              <>
                <button className="back-button" onClick={() => setSelectedProjectId(null)} aria-label="Back to projects"><ChevronLeft size={17} /></button>
                <div>
                  <div className="eyebrow">PROJECT WORKSPACE</div>
                  <h1>{selectedProject.name}</h1>
                </div>
              </>
            ) : (
              <div>
                <div className="eyebrow">TEAMFLOW WORKSPACE</div>
                <h1>{({ overview: 'Overview', projects: 'Projects', tasks: 'My tasks', team: 'Team', settings: 'Settings' } as const)[activePage]}</h1>
              </div>
            )}
          </div>
          <div className="topbar-actions">
            <button className="icon-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`} aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="user-chip">
              <div className="avatar avatar-small">{initials(user.full_name)}</div>
              <div className="user-chip-copy"><strong>{user.full_name}</strong><span>{user.role}</span></div>
            </div>
          </div>
        </header>

        <div className="content-area">
          {globalError && <div className="alert alert-error"><AlertCircle size={16} />{globalError}<button onClick={() => setGlobalError('')} aria-label="Dismiss"><X size={15} /></button></div>}
          {loadingData && !summary ? <div className="content-loading"><div className="loader-ring" />Loading workspace…</div> : null}
          {selectedProject && user ? (
            <ProjectBoard
              project={selectedProject}
              tasks={tasks.filter((task) => task.project_id === selectedProject.id)}
              currentUser={user}
              onCreateTask={() => setTaskModal({ task: null, project: selectedProject })}
              onOpenTask={(task) => setTaskModal({ task, project: selectedProject })}
              onRefresh={refresh}
              onDeleteProject={async () => {
                if (!window.confirm(`Delete “${selectedProject.name}” and all of its tasks? This cannot be undone.`)) return
                try {
                  await request<void>(`/projects/${selectedProject.id}`, { method: 'DELETE' })
                  setSelectedProjectId(null)
                  refresh()
                } catch (error) {
                  setGlobalError(error instanceof Error ? error.message : 'Could not delete project.')
                }
              }}
            />
          ) : activePage === 'overview' ? (
            <DashboardPage
              user={user}
              summary={summary}
              tasks={tasks}
              projects={projects}
              onOpenProject={(id) => { setSelectedProjectId(id); setActivePage('projects') }}
              onOpenTasks={() => navigate('tasks')}
            />
          ) : activePage === 'projects' ? (
            <ProjectsPage
              projects={projects}
              tasks={tasks}
              user={user}
              onCreate={() => setProjectModalOpen(true)}
              onOpen={(id) => setSelectedProjectId(id)}
            />
          ) : activePage === 'tasks' ? (
            <MyTasksPage
              tasks={tasks.filter((task) => task.assignee_id === user.id)}
              projects={projects}
              search={taskSearch}
              onSearch={setTaskSearch}
              onOpenTask={(task) => {
                const project = projects.find((item) => item.id === task.project_id)
                if (project) setTaskModal({ task, project })
              }}
            />
          ) : activePage === 'team' ? (
            <TeamPage users={users} currentUser={user} onAdd={() => setUserModalOpen(true)} />
          ) : (
            <SettingsPage user={user} theme={theme} onTheme={setTheme} />
          )}
        </div>
      </main>

      {projectModalOpen && (
        <ProjectModal
          users={users}
          onClose={() => setProjectModalOpen(false)}
          onSave={async (payload) => {
            await request<Project>('/projects', { method: 'POST', body: JSON.stringify(payload) })
            setProjectModalOpen(false)
            refresh()
          }}
        />
      )}
      {userModalOpen && (
        <UserModal
          onClose={() => setUserModalOpen(false)}
          onSave={async (payload) => {
            await request<User>('/users', { method: 'POST', body: JSON.stringify(payload) })
            setUserModalOpen(false)
            refresh()
          }}
        />
      )}
      {taskModal && (
        <TaskModal
          key={taskModal.task?.id ?? 'new-task'}
          task={taskModal.task}
          project={taskModal.project}
          user={user}
          onClose={() => setTaskModal(null)}
          onSaved={() => { setTaskModal(null); refresh() }}
          onDeleted={() => { setTaskModal(null); refresh() }}
        />
      )}
    </div>
  )
}

function Sidebar({
  activePage,
  user,
  onNavigate,
  onLogout,
}: {
  activePage: string
  user: User
  onNavigate: (page: 'overview' | 'projects' | 'tasks' | 'team' | 'settings') => void
  onLogout: () => void
}) {
  const items = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'projects', label: 'Projects', icon: FolderKanban },
    { id: 'tasks', label: 'My tasks', icon: ListTodo },
    ...(user.role === 'admin' || user.role === 'manager' ? [{ id: 'team', label: 'Team', icon: Users }] : []),
  ] as const
  return (
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><span /></div><span>teamflow</span><small>WORKSPACE</small></div>
      <div className="workspace-switcher"><div className="workspace-icon">T</div><div><strong>Team workspace</strong><span>Company account</span></div><ChevronRight size={15} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="nav-list">
        {items.map((item) => {
          const Icon = item.icon
          return <button key={item.id} className={`nav-item ${activePage === item.id ? 'active' : ''}`} onClick={() => onNavigate(item.id as 'overview' | 'projects' | 'tasks' | 'team' | 'settings')}><Icon size={18} /><span>{item.label}</span>{item.id === 'tasks' && <span className="nav-dot" />}</button>
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="nav-label">PREFERENCES</div>
        <button className={`nav-item ${activePage === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}><Settings size={18} /><span>Settings</span></button>
        <div className="sidebar-profile">
          <div className="avatar">{initials(user.full_name)}</div>
          <div className="profile-copy"><strong>{user.full_name}</strong><span>{user.role}</span></div>
          <button className="icon-button quiet" onClick={onLogout} title="Sign out" aria-label="Sign out"><LogOut size={17} /></button>
        </div>
        <div className="sidebar-footer"><span className="online-dot" />All systems operational</div>
      </div>
    </aside>
  )
}

function LoginPage({ onLogin, theme, onTheme }: { onLogin: (email: string, password: string) => Promise<void>; theme: 'light' | 'dark'; onTheme: () => void }) {
  const [email, setEmail] = useState('admin@example.com')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onLogin(email.trim(), password)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <div className="login-top"><div className="brand"><div className="brand-mark"><span /></div><span>teamflow</span></div><button className="icon-button" onClick={onTheme} aria-label="Toggle theme">{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button></div>
      <div className="login-layout">
        <div className="login-promo">
          <div className="promo-kicker"><span className="online-dot" />A clearer way to work together</div>
          <h1>Good work happens<br /><em>in sync.</em></h1>
          <p>Bring projects, people, and daily work into one calm, focused workspace.</p>
          <div className="promo-board">
            <div className="promo-board-top"><span>Website refresh</span><span className="tiny-pill">On track</span></div>
            <div className="promo-progress"><span /></div>
            <div className="promo-mini-columns">
              <div><small>TO DO</small><b>Design review</b><b>Update copy</b></div>
              <div><small>IN PROGRESS</small><b>Build homepage</b><b>Mobile layout</b></div>
              <div><small>DONE</small><b>Set up repo</b><b>Kick-off</b></div>
            </div>
          </div>
          <div className="promo-footnote"><ShieldCheck size={15} />Keep the team aligned without more meetings.</div>
        </div>
        <div className="login-card-wrap">
          <form className="login-card" onSubmit={submit}>
            <div className="login-card-icon"><ShieldCheck size={21} /></div>
            <div className="eyebrow">WELCOME BACK</div>
            <h2>Sign in to TeamFlow</h2>
            <p className="muted">Use your company account to continue.</p>
            {error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}
            <label className="field-label">Work email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="field-label">Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="button button-primary button-full" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}<ArrowUpRight size={16} /></button>
            <div className="login-note">New here? Ask your workspace admin to create your account.</div>
          </form>
        </div>
      </div>
      <div className="login-footer"><span>© {new Date().getFullYear()} TeamFlow</span><span>Simple tools for thoughtful teams</span></div>
    </div>
  )
}

function PageIntro({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><h2>{title}</h2><p>{description}</p></div>{action}</div>
}

function DashboardPage({
  user,
  summary,
  tasks,
  projects,
  onOpenProject,
  onOpenTasks,
}: {
  user: User
  summary: DashboardSummary | null
  tasks: Task[]
  projects: Project[]
  onOpenProject: (id: number) => void
  onOpenTasks: () => void
}) {
  const myTasks = tasks.filter((task) => task.assignee_id === user.id && task.status !== 'done').slice(0, 5)
  const firstName = user.full_name.split(' ')[0]
  return (
    <div className="page-stack">
      <section className="welcome-row"><div><div className="eyebrow">{new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</div><h2>Good to see you, {firstName}<span className="wave">✦</span></h2><p>Here’s what’s happening across your workspace today.</p></div><div className="welcome-side-note"><div className="note-orb">✳</div><span>One thing at a time.<br /><strong>You’ve got this.</strong></span></div></section>
      <div className="stats-grid">
        <StatCard label="Active projects" value={summary?.active_projects ?? 0} icon={<FolderKanban size={18} />} tone="violet" foot="Across your workspace" />
        <StatCard label="My open tasks" value={summary?.my_tasks ?? 0} icon={<ListTodo size={18} />} tone="blue" foot="Assigned to you" />
        <StatCard label="Tasks completed" value={summary?.completed_tasks ?? 0} icon={<CheckCircle2 size={18} />} tone="green" foot="All-time completed" />
        <StatCard label="Overdue tasks" value={summary?.overdue_tasks ?? 0} icon={<Clock3 size={18} />} tone="orange" foot="Needs a quick look" />
      </div>
      <div className="dashboard-grid">
        <section className="panel projects-panel">
          <div className="panel-heading"><div><h3>Recent projects</h3><p>Keep an eye on the work in motion.</p></div><button className="text-button" onClick={() => onOpenProject(projects[0]?.id ?? 0)}>View workspace <ArrowUpRight size={14} /></button></div>
          {summary?.projects.length ? <div className="recent-project-list">{summary.projects.map((project, index) => <button className="recent-project" key={project.id} onClick={() => onOpenProject(project.id)}><div className={`project-glyph glyph-${index % 4}`}>{project.name.slice(0, 1).toUpperCase()}</div><div className="recent-project-main"><div className="recent-project-title"><strong>{project.name}</strong><span>{project.progress}%</span></div><div className="progress-track"><span style={{ width: `${project.progress}%` }} /></div><div className="project-meta"><span>{project.task_count} tasks</span><span>{project.member_count} members</span><span>{project.due_date ? `Due ${prettyDate(project.due_date)}` : 'No deadline'}</span></div></div><ChevronRight size={16} /></button>)}</div> : <EmptyState icon={<FolderKanban />} title="No projects yet" text="Create a project to give your team a place to work." />}
        </section>
        <section className="panel mytasks-panel">
          <div className="panel-heading"><div><h3>My focus</h3><p>Tasks that need your attention.</p></div><button className="icon-button subtle" onClick={onOpenTasks} aria-label="View my tasks"><ArrowUpRight size={16} /></button></div>
          {myTasks.length ? <div className="focus-list">{myTasks.map((task) => <button key={task.id} className="focus-item" onClick={onOpenTasks}><span className={`priority-mark ${task.priority}`} /><span className="focus-copy"><strong>{task.title}</strong><small>{projects.find((project) => project.id === task.project_id)?.name ?? 'Project'}</small></span><span className={`task-status status-${task.status}`}>{statusLabels[task.status]}</span></button>)}</div> : <EmptyState icon={<CheckCircle2 />} title="You're all caught up" text="Assigned tasks will show here." />}
          <button className="panel-bottom-link" onClick={onOpenTasks}>See all my tasks <ArrowUpRight size={14} /></button>
        </section>
      </div>
      <section className="panel activity-panel">
        <div className="panel-heading"><div><h3>Recent activity</h3><p>A little context from around the team.</p></div><span className="activity-heading-icon"><Activity size={17} /></span></div>
        {summary?.activity.length ? <div className="activity-list">{summary.activity.map((item) => <div className="activity-row" key={item.id}><div className="avatar avatar-tiny">{initials(item.actor_name)}</div><div className="activity-message"><strong>{item.actor_name}</strong> {item.message}<small>{relativeDate(item.created_at)}</small></div></div>)}</div> : <EmptyState icon={<Activity />} title="No activity yet" text="Project and task updates will appear here." />}
      </section>
    </div>
  )
}

function StatCard({ label, value, icon, tone, foot }: { label: string; value: number; icon: ReactNode; tone: string; foot: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value.toLocaleString()}</div><div className="stat-foot">{foot}</div></div>
}

function ProjectsPage({
  projects,
  tasks,
  user,
  onCreate,
  onOpen,
}: {
  projects: Project[]
  tasks: Task[]
  user: User
  onCreate: () => void
  onOpen: (id: number) => void
}) {
  const canCreate = user.role === 'admin' || user.role === 'manager'
  return (
    <div className="page-stack">
      <PageIntro title="Your projects" description="A shared view of the projects your team is working on." action={canCreate ? <button className="button button-primary" onClick={onCreate}><Plus size={16} />New project</button> : undefined} />
      {projects.length ? <div className="project-grid">{projects.map((project, index) => {
        const projectTasks = tasks.filter((task) => task.project_id === project.id)
        const done = projectTasks.filter((task) => task.status === 'done').length
        const progress = projectTasks.length ? Math.round(done / projectTasks.length * 100) : 0
        return <button className="project-card" key={project.id} onClick={() => onOpen(project.id)}><div className="project-card-top"><div className={`project-glyph glyph-${index % 4}`}>{project.name.slice(0, 1).toUpperCase()}</div><span className={`project-state state-${project.status}`}>{project.status.replace('_', ' ')}</span></div><h3>{project.name}</h3><p>{project.description || 'No project description added yet.'}</p><div className="project-card-meta"><span><ListTodo size={14} />{projectTasks.length} tasks</span><span><Users size={14} />{project.members.length} members</span></div><div className="project-card-progress"><div className="progress-caption"><span>Progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div><div className="project-card-bottom"><div className="avatar-stack">{project.members.slice(0, 4).map((member) => <span className="avatar avatar-mini" title={member.full_name} key={member.id}>{initials(member.full_name)}</span>)}{project.members.length > 4 && <span className="avatar avatar-mini avatar-extra">+{project.members.length - 4}</span>}</div><span className="due-label"><CalendarDays size={13} />{project.due_date ? prettyDate(project.due_date) : 'No deadline'}</span></div></button>
      })}</div> : <EmptyState icon={<FolderKanban />} title="Start with your first project" text="Create a project, add teammates, and start assigning work." action={canCreate ? <button className="button button-primary" onClick={onCreate}><Plus size={16} />Create project</button> : undefined} />}
    </div>
  )
}

function ProjectBoard({
  project,
  tasks,
  currentUser,
  onCreateTask,
  onOpenTask,
  onRefresh,
  onDeleteProject,
}: {
  project: Project
  tasks: Task[]
  currentUser: User
  onCreateTask: () => void
  onOpenTask: (task: Task) => void
  onRefresh: () => void
  onDeleteProject: () => void
}) {
  const [search, setSearch] = useState('')
  const [savingTaskId, setSavingTaskId] = useState<number | null>(null)
  const canManage = canManageProject(project, currentUser)
  const done = tasks.filter((task) => task.status === 'done').length
  const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0

  async function moveTask(taskId: number, status: TaskStatus) {
    const task = tasks.find((item) => item.id === taskId)
    if (!task || task.status === status) return
    if (!canManage && task.assignee_id !== currentUser.id) return
    setSavingTaskId(taskId)
    try {
      await request<Task>(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      onRefresh()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not update task status.')
    } finally {
      setSavingTaskId(null)
    }
  }

  return (
    <div className="page-stack board-page">
      <div className="board-summary panel"><div className="board-summary-copy"><span className="eyebrow">PROJECT OVERVIEW</span><h2>{project.name}</h2><p>{project.description || 'Keep the team aligned on the work that matters.'}</p><div className="board-summary-meta"><span><Users size={14} />{project.members.length} members</span><span><ListTodo size={14} />{tasks.length} tasks</span><span><CalendarDays size={14} />{project.due_date ? `Due ${prettyDate(project.due_date)}` : 'No deadline'}</span></div></div><div className="board-progress"><div className="board-progress-top"><span>Project progress</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>{done} of {tasks.length} tasks completed</small></div></div>
      <div className="board-toolbar"><div className="board-toolbar-left"><div className="search-field compact"><Search size={16} /><input placeholder="Find a task…" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="member-stack">{project.members.slice(0, 5).map((member) => <span className="avatar avatar-mini" title={member.full_name} key={member.id}>{initials(member.full_name)}</span>)}</div></div><div className="board-toolbar-right">{canManage && <><button className="button button-secondary" onClick={onDeleteProject}>Delete project</button><button className="button button-primary" onClick={onCreateTask}><Plus size={16} />Add task</button></>}</div></div>
      <div className="kanban-board">{statusOrder.map((status) => {
        const columnTasks = tasks.filter((task) => task.status === status && `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase()))
        return <section className="kanban-column" key={status} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const id = Number(event.dataTransfer.getData('text/plain')); if (id) void moveTask(id, status) }}><div className="kanban-column-head"><span className={`column-dot dot-${status}`} /><strong>{statusLabels[status]}</strong><span className="column-count">{columnTasks.length}</span>{status === 'todo' && canManage && <button className="column-add" onClick={onCreateTask} aria-label="Add task"><Plus size={15} /></button>}</div><div className="kanban-cards">{columnTasks.map((task) => {
          const draggable = canManage || task.assignee_id === currentUser.id
          return <article key={task.id} draggable={draggable} onDragStart={(event) => { if (!draggable) { event.preventDefault(); return } event.dataTransfer.setData('text/plain', String(task.id)); event.dataTransfer.effectAllowed = 'move' }} className={`task-card ${savingTaskId === task.id ? 'saving' : ''}`} onClick={() => onOpenTask(task)}><div className="task-card-top"><span className={`priority-label ${task.priority}`}><span />{task.priority}</span></div><h4>{task.title}</h4>{task.description && <p>{task.description}</p>}<div className="task-card-footer"><div className="task-assignee">{task.assignee ? <><span className="avatar avatar-mini">{initials(task.assignee.full_name)}</span><span>{task.assignee.full_name.split(' ')[0]}</span></> : <span className="unassigned">Unassigned</span>}</div>{task.due_date && <span className={`task-due ${task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'done' ? 'overdue' : ''}`}><CalendarDays size={12} />{prettyDate(task.due_date)}</span>}</div></article>
        })}{columnTasks.length === 0 && <div className="column-empty">No tasks here yet</div>}</div></section>
      })}</div>
    </div>
  )
}

function MyTasksPage({
  tasks,
  projects,
  search,
  onSearch,
  onOpenTask,
}: {
  tasks: Task[]
  projects: Project[]
  search: string
  onSearch: (value: string) => void
  onOpenTask: (task: Task) => void
}) {
  const filtered = tasks.filter((task) => `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase()))
  const open = filtered.filter((task) => task.status !== 'done')
  return (
    <div className="page-stack">
      <PageIntro title="My tasks" description="Your assigned work, with the next step always in view." />
      <div className="task-list-toolbar"><div className="search-field"><Search size={16} /><input placeholder="Search your tasks…" value={search} onChange={(event) => onSearch(event.target.value)} /></div><span className="muted small-text">{open.length} open · {filtered.length - open.length} completed</span></div>
      <section className="panel task-table-panel">
        {filtered.length ? <div className="task-table-wrap"><table className="data-table"><thead><tr><th>Task</th><th>Project</th><th>Priority</th><th>Status</th><th>Due date</th><th /></tr></thead><tbody>{filtered.map((task) => <tr key={task.id} onClick={() => onOpenTask(task)}><td><div className="table-task-title"><span className={`priority-mark ${task.priority}`} /><strong>{task.title}</strong></div></td><td>{projects.find((project) => project.id === task.project_id)?.name ?? '—'}</td><td><span className={`priority-label ${task.priority}`}><span />{task.priority}</span></td><td><span className={`task-status status-${task.status}`}>{statusLabels[task.status]}</span></td><td className={task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== 'done' ? 'text-danger' : ''}>{prettyDate(task.due_date)}</td><td><ChevronRight size={16} className="table-chevron" /></td></tr>)}</tbody></table></div> : <EmptyState icon={<ListTodo />} title="No assigned tasks" text="Tasks assigned to you will appear here. Check back after your manager adds work." />}
      </section>
    </div>
  )
}

function TeamPage({ users, currentUser, onAdd }: { users: User[]; currentUser: User; onAdd: () => void }) {
  return (
    <div className="page-stack">
      <PageIntro title="Team members" description="The people working together in this workspace." action={currentUser.role === 'admin' ? <button className="button button-primary" onClick={onAdd}><Plus size={16} />Add member</button> : undefined} />
      <section className="panel team-panel"><div className="team-panel-top"><div><h3>Workspace people</h3><p>{users.length} active team members</p></div><span className="team-count"><Users size={15} />{users.length}</span></div>{users.length ? <div className="team-list">{users.map((member) => <div className="team-row" key={member.id}><div className="avatar">{initials(member.full_name)}</div><div className="team-person"><strong>{member.full_name}</strong><span>{member.email}</span></div><span className={`role-pill role-${member.role}`}>{member.role}</span><span className="member-active"><span />Active</span></div>)}</div> : <EmptyState icon={<Users />} title="No team members yet" text="Add teammates to start collaborating." />}</section>
      <div className="permission-note"><ShieldCheck size={17} /><div><strong>Roles keep work organized</strong><span>Admins manage team accounts, managers coordinate projects, and employees update the tasks assigned to them.</span></div></div>
    </div>
  )
}

function SettingsPage({ user, theme, onTheme }: { user: User; theme: 'light' | 'dark'; onTheme: (theme: 'light' | 'dark') => void }) {
  return <div className="page-stack"><PageIntro title="Settings" description="A few preferences for your workspace." /><div className="settings-grid"><section className="panel settings-card"><div className="settings-card-title"><div className="settings-icon"><Sun size={18} /></div><div><h3>Appearance</h3><p>Choose how TeamFlow looks on this device.</p></div></div><div className="theme-options"><button className={`theme-option ${theme === 'light' ? 'selected' : ''}`} onClick={() => onTheme('light')}><div className="theme-preview light-preview"><span /><span /><span /></div><div><strong>Light</strong><small>Bright and clear</small></div>{theme === 'light' && <Check size={16} />}</button><button className={`theme-option ${theme === 'dark' ? 'selected' : ''}`} onClick={() => onTheme('dark')}><div className="theme-preview dark-preview"><span /><span /><span /></div><div><strong>Dark</strong><small>Easy on the eyes</small></div>{theme === 'dark' && <Check size={16} />}</button></div></section><section className="panel settings-card"><div className="settings-card-title"><div className="settings-icon"><Users size={18} /></div><div><h3>Your profile</h3><p>Account information from your workspace.</p></div></div><div className="profile-detail"><div className="avatar avatar-large">{initials(user.full_name)}</div><div><strong>{user.full_name}</strong><span>{user.email}</span><span className={`role-pill role-${user.role}`}>{user.role}</span></div></div></section></div><div className="settings-footnote"><CircleHelp size={15} />Your theme preference is saved in this browser and does not change other team members’ settings.</div></div>
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><strong>{title}</strong><p>{text}</p>{action}</div>
}

function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className={`modal-card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true"><div className="modal-header"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>{children}</div></div>
}

function ProjectModal({ users, onClose, onSave }: { users: User[]; onClose: () => void; onSave: (payload: { name: string; description: string; due_date: string | null; member_ids: number[] }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [memberIds, setMemberIds] = useState<number[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave({ name, description, due_date: dueDate || null, member_ids: memberIds })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create project.')
    } finally {
      setSaving(false)
    }
  }
  return <Modal title="Create a project" subtitle="Give the team a clear place to coordinate this work." onClose={onClose}><form className="modal-form" onSubmit={submit}>{error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}<label className="field-label">Project name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Website refresh" minLength={3} maxLength={140} required /></label><label className="field-label">Description <span className="optional">Optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this project about?" maxLength={3000} /></label><label className="field-label">Target date <span className="optional">Optional</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label><div className="field-label">Add team members <span className="optional">You can change this later</span><div className="member-picker">{users.map((member) => <label className="member-choice" key={member.id}><input type="checkbox" checked={memberIds.includes(member.id)} onChange={(event) => setMemberIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} /><span className="avatar avatar-mini">{initials(member.full_name)}</span><span>{member.full_name}</span><small>{member.role}</small></label>)}</div></div><div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving || name.trim().length < 3}>{saving ? 'Creating…' : 'Create project'}<ArrowUpRight size={15} /></button></div></form></Modal>
}

function UserModal({ onClose, onSave }: { onClose: () => void; onSave: (payload: { full_name: string; email: string; password: string; role: 'manager' | 'employee' }) => Promise<void> }) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'manager' | 'employee'>('employee')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try { await onSave({ full_name: fullName, email, password, role }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create member.') }
    finally { setSaving(false) }
  }
  return <Modal title="Add a team member" subtitle="Create an account so they can sign in to TeamFlow." onClose={onClose}><form className="modal-form" onSubmit={submit}>{error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}<label className="field-label">Full name<input autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} maxLength={120} /></label><label className="field-label">Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label className="field-label">Temporary password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={10} required /><small className="field-hint">At least 10 characters. Share it securely and ask them to change it after signing in.</small></label><label className="field-label">Role<select value={role} onChange={(event) => setRole(event.target.value as 'manager' | 'employee')}><option value="employee">Employee</option><option value="manager">Manager</option></select></label><div className="modal-actions"><button type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={saving}>{saving ? 'Adding…' : 'Add member'}<Plus size={15} /></button></div></form></Modal>
}

function TaskModal({
  task,
  project,
  user,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: Task | null
  project: Project
  user: User
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const canManage = canManageProject(project, user)
  const canUpdateOwn = Boolean(task && user.role === 'employee' && task.assignee_id === user.id)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id ? String(task.assignee_id) : '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [priority, setPriority] = useState(task?.priority ?? 'medium')
  const [dueDate, setDueDate] = useState(task?.due_date ?? '')
  const [comments, setComments] = useState<Comment[]>([])
  const [commentText, setCommentText] = useState('')
  const [saving, setSaving] = useState(false)
  const [commentSaving, setCommentSaving] = useState(false)
  const [error, setError] = useState('')
  const canEdit = canManage || canUpdateOwn

  useEffect(() => {
    if (!task) return
    request<Comment[]>(`/tasks/${task.id}/comments`).then(setComments).catch(() => setComments([]))
  }, [task])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (!task) {
        await request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title, description, project_id: project.id, assignee_id: assigneeId ? Number(assigneeId) : null, status, priority, due_date: dueDate || null }) })
      } else {
        const payload = canManage
          ? { title, description, assignee_id: assigneeId ? Number(assigneeId) : null, status, priority, due_date: dueDate || null }
          : { status }
        await request<Task>(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      }
      onSaved()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save task.')
    } finally {
      setSaving(false)
    }
  }

  async function addComment(event: FormEvent) {
    event.preventDefault()
    if (!task || !commentText.trim()) return
    setCommentSaving(true)
    try {
      const comment = await request<Comment>(`/tasks/${task.id}/comments`, { method: 'POST', body: JSON.stringify({ body: commentText }) })
      setComments((current) => [...current, comment])
      setCommentText('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add comment.')
    } finally {
      setCommentSaving(false)
    }
  }

  async function deleteTask() {
    if (!task || !window.confirm('Delete this task? This cannot be undone.')) return
    setSaving(true)
    try {
      await request<void>(`/tasks/${task.id}`, { method: 'DELETE' })
      onDeleted()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete task.')
      setSaving(false)
    }
  }

  return <Modal title={task ? 'Task details' : 'Create a task'} subtitle={project.name} onClose={onClose} wide><div className="task-modal-layout"><form className="modal-form task-edit-form" onSubmit={submit}>{error && <div className="alert alert-error"><AlertCircle size={15} />{error}</div>}<label className="field-label">Task title<input autoFocus={!task} value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={180} disabled={Boolean(task) && !canManage} /></label><label className="field-label">Description <span className="optional">Optional</span><textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} disabled={Boolean(task) && !canManage} /></label><div className="form-row"><label className="field-label">Status<select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} disabled={!canEdit}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="in_review">In review</option><option value="done">Done</option></select></label><label className="field-label">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as 'low' | 'medium' | 'high')} disabled={Boolean(task) && !canManage}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label></div>{canManage && <><label className="field-label">Assignee<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{project.members.map((member) => <option value={member.id} key={member.id}>{member.full_name}</option>)}</select></label><label className="field-label">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label></>}{task && !canManage && <div className="task-readonly-note">{user.role === 'employee' ? 'You can update the status of tasks assigned to you. Ask the project owner to change other details.' : 'Only the project owner or an Admin can edit this project’s tasks.'}</div>}<div className="modal-actions modal-actions-split">{task && canManage ? <button type="button" className="button button-danger-quiet" onClick={deleteTask} disabled={saving}>Delete task</button> : <span />}{canEdit || !task ? <button className="button button-primary" disabled={saving || (canManage && title.trim().length < 3)}>{saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}<Check size={15} /></button> : <button type="button" className="button button-secondary" onClick={onClose}>Close</button>}</div></form>{task && <section className="comments-panel"><div className="comments-heading"><div><h3>Conversation</h3><p>{comments.length} comments</p></div><MessageCircle size={18} /></div><div className="comments-list">{comments.length ? comments.map((comment) => <div className="comment-item" key={comment.id}><div className="avatar avatar-mini">{initials(comment.author.full_name)}</div><div><div className="comment-meta"><strong>{comment.author.full_name}</strong><span>{relativeDate(comment.created_at)}</span></div><p>{comment.body}</p></div></div>) : <div className="comments-empty">No comments yet. Start the conversation.</div>}</div><form className="comment-composer" onSubmit={addComment}><textarea rows={2} placeholder="Write a comment…" value={commentText} onChange={(event) => setCommentText(event.target.value)} maxLength={2000} /><div><span>{user.full_name.split(' ')[0]}</span><button className="button button-primary button-small" disabled={!commentText.trim() || commentSaving}>{commentSaving ? 'Sending…' : 'Send'}<ArrowUpRight size={13} /></button></div></form></section>}</div></Modal>
}

export default App
