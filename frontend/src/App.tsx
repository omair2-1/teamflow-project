
import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import {
  apiRequest,
  clearAccessToken,
  getAccessToken,
  saveAccessToken,
} from './api/client'

type LoginResponse = {
  access_token: string
  token_type: string
}

type UserProfile = {
  full_name: string
  email: string
  role: string
}

type Project = {
  id: number
  name: string
  status: string
  member_count: number
  task_count: number
  completed_count: number
  progress: number
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
  projects: Project[]
  activity: Activity[]
}

function App() {
  const [token, setToken] = useState<string | null>(() => getAccessToken())
  const [user, setUser] = useState<UserProfile | null>(null)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [appError, setAppError] = useState('')

  const [loginBusy, setLoginBusy] = useState(false)
  const [loading, setLoading] = useState(() => Boolean(getAccessToken()))

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    let active = true

    async function loadDashboard() {
      setLoading(true)

      try {
        const profile = await apiRequest<UserProfile>('/api/v1/auth/me')

        if (!active) return
        setUser(profile)

        try {
          const dashboard = await apiRequest<DashboardSummary>(
            '/api/v1/dashboard/summary'
          )

          if (active) {
            setSummary(dashboard)
            setAppError('')
          }
        } catch (error) {
          if (active) {
            setAppError(
              error instanceof Error
                ? error.message
                : 'Could not load dashboard data.'
            )
          }
        }
      } catch {
        if (active) {
          clearAccessToken()
          setToken(null)
          setUser(null)
          setSummary(null)
          setLoginError('Your session expired. Please sign in again.')
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadDashboard()

    return () => {
      active = false
    }
  }, [token])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginError('')
    setLoginBusy(true)

    try {
      const result = await apiRequest<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      })

      saveAccessToken(result.access_token)
      setToken(result.access_token)
      setPassword('')
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Unable to sign in.'
      )
    } finally {
      setLoginBusy(false)
    }
  }

  function handleLogout() {
    clearAccessToken()
    setToken(null)
    setUser(null)
    setSummary(null)
    setLoginError('')
    setAppError('')
    setPassword('')
  }

  if (!token) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="login-brand">
            <div className="brand-icon">T</div>
            <span>TeamFlow</span>
          </div>

          <div className="login-heading">
            <h1>Welcome back</h1>
            <p>Sign in to manage your team's work.</p>
          </div>

          <form onSubmit={handleLogin} className="login-form">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />

            {loginError && (
              <div className="error-message" role="alert">
                {loginError}
              </div>
            )}

            <button className="login-button" type="submit" disabled={loginBusy}>
              {loginBusy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="login-footer">
            TeamFlow · Project management made simple
          </p>
        </section>
      </main>
    )
  }

  if (loading || !user) {
    return (
      <main className="loading-page">
        <div className="loading-brand">T</div>
        <p>Loading your TeamFlow workspace...</p>
      </main>
    )
  }

  const stats = [
    {
      label: 'Active Projects',
      value: summary?.active_projects ?? 0,
      icon: '▦',
    },
    {
      label: 'My Pending Tasks',
      value: summary?.my_tasks ?? 0,
      icon: '☑',
    },
    {
      label: 'Completed Tasks',
      value: summary?.completed_tasks ?? 0,
      icon: '✓',
    },
    {
      label: 'Overdue Tasks',
      value: summary?.overdue_tasks ?? 0,
      icon: '◷',
    },
  ]

  const colors = ['purple', 'blue', 'orange', 'green']
  const firstName = user.full_name.split(' ')[0]

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">T</div>
          <span>TeamFlow</span>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <nav>
          <a className="nav-item active" href="#dashboard">
            ▦ <span>Dashboard</span>
          </a>
          <a className="nav-item" href="#tasks">
            ▤ <span>My Tasks</span>
          </a>
          <a className="nav-item" href="#projects">
            ◫ <span>Projects</span>
          </a>
          <a className="nav-item" href="#team">
            ♙ <span>Team Members</span>
          </a>
        </nav>

        <p className="nav-label management-label">MANAGEMENT</p>

        <nav>
          <a className="nav-item" href="#activity">
            ◷ <span>Activity</span>
          </a>
          <a className="nav-item" href="#settings">
            ⚙ <span>Settings</span>
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-avatar">
            {firstName.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user">
            <strong>{user.full_name}</strong>
            <small>{user.role}</small>
          </div>
        </div>
      </aside>

      <main className="main-content" id="dashboard">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Workspace / Dashboard</span>
            <h1>Dashboard</h1>
          </div>

          <div className="topbar-right">
            <span className="today">
              {new Intl.DateTimeFormat('en-IN', {
                month: 'long',
                year: 'numeric',
              }).format(new Date())}
            </span>

            <div className="header-avatar">
              {firstName.charAt(0).toUpperCase()}
            </div>

            <button className="logout-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </header>

        <section className="welcome">
          <div>
            <h2>Welcome back, {firstName}! 👋</h2>
            <p>Here's what's happening with your team today.</p>
          </div>
        </section>

        {appError && (
          <div className="error-message dashboard-error">
            Dashboard data could not be loaded: {appError}
          </div>
        )}

        <section className="stats-grid">
          {stats.map((stat) => (
            <div className="stat-card" key={stat.label}>
              <div className="stat-top">
                <span>{stat.label}</span>
                <div className="stat-icon">{stat.icon}</div>
              </div>
              <h3>{stat.value}</h3>
            </div>
          ))}
        </section>

        <section className="projects-section" id="projects">
          <div className="section-heading">
            <div>
              <h2>Recent Projects</h2>
              <p>Latest projects in your workspace.</p>
            </div>
          </div>

          <div className="project-list">
            {(summary?.projects ?? []).length === 0 && (
              <div className="empty-state">
                <h3>No projects yet</h3>
                <p>Your projects will appear here once they are created.</p>
              </div>
            )}

            {(summary?.projects ?? []).map((project, index) => (
              <article className="project-card" key={project.id}>
                <div className="project-info">
                  <div className={`project-icon ${colors[index % colors.length]}`}>
                    {project.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3>{project.name}</h3>
                    <small>
                      {project.member_count} team members
                    </small>
                  </div>
                </div>

                <div className="project-progress">
                  <div className="progress-label">
                    <span>Progress</span>
                    <strong>{project.progress}%</strong>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-fill ${colors[index % colors.length]}`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                <div className="task-count">
                  <strong>
                    {project.completed_count}/{project.task_count}
                  </strong>
                  <small>Tasks done</small>
                </div>

                <span className="status-badge">
                  {project.status}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="activity-section" id="activity">
          <div className="section-heading">
            <div>
              <h2>Recent Activity</h2>
              <p>What's happening across your projects.</p>
            </div>
          </div>

          <div className="activity-list">
            {(summary?.activity ?? []).length === 0 && (
              <p className="empty-activity">No recent activity yet.</p>
            )}

            {(summary?.activity ?? []).map((item) => (
              <div className="activity-item" key={item.id}>
                <div className="activity-dot" />
                <div className="activity-content">
                  <strong>{item.actor_name}</strong>
                  <span>{item.message}</span>
                  <small>
                    {new Date(item.created_at).toLocaleString()}
                  </small>
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer>© 2026 TeamFlow. Built for better teamwork.</footer>
      </main>
    </div>
  )
}

export default App
