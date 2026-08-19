import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FiActivity, FiArrowLeft, FiBarChart2, FiCalendar, FiChevronLeft, FiClock, FiGrid, FiKey, FiLogIn, FiLogOut, FiMenu, FiMoon, FiPlus, FiSun, FiUsers, FiX } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'

const activity = ['/activity', FiActivity, 'Activity']
const navByRole = {
  administrator: [['/dashboard/admin', FiGrid, 'Overview'], ['/users', FiUsers, 'People & access'], ['/visitors', FiUsers, 'Visitor Requests'], ['/reports', FiBarChart2, 'Reports'], activity, ['/settings', FiClock, 'Operations settings']],
  receptionist: [['/dashboard/receptionist', FiGrid, 'Receptionist dashboard'], ['/appointments', FiClock, "Today's appointments"], ['/visitors/register', FiPlus, 'Register visitor'], ['/visitors?status=approved', FiLogIn, 'Check in'], ['/visitors?status=checked_in', FiLogOut, 'Check out'], activity],
  employee: [['/dashboard/employee', FiGrid, 'My dashboard'], ['/visitors?status=pending', FiUsers, 'My visitor requests'], ['/my-visitors', FiCalendar, 'My visitors & passes'], activity],
}

const primaryPaths = new Set([
  '/dashboard/admin',
  '/dashboard/receptionist',
  '/dashboard/employee',
  '/users',
  '/visitors',
  '/visitors/register',
  '/reports',
  '/activity',
  '/change-password',
  '/settings',
  '/appointments',
  '/my-visitors',
])

export default function AppShell() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const location = useLocation()
  const navigate = useNavigate()
  const roleHome = { administrator: '/dashboard/admin', receptionist: '/dashboard/receptionist', employee: '/dashboard/employee' }
  const showBack = !primaryPaths.has(location.pathname)

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(roleHome[user.role], { replace: true })
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => setMobileOpen(false), [location.pathname, location.search])

  return <div className={`app ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'nav-open' : ''}`}>
    <button className="nav-scrim" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
    <aside aria-label="Application sidebar">
      <div className="brand"><img className="brand-logo" src="/vp-mark.svg" alt="" /><span><b>Visitor Pass</b><small>Management System</small></span></div>
      <nav aria-label="Primary navigation">{(navByRole[user.role] || []).map(([to, Icon, label]) => <NavLink key={to} to={to} title={collapsed ? label : undefined}><Icon /><span>{label}</span></NavLink>)}<NavLink to="/change-password" title={collapsed ? 'Security' : undefined}><FiKey /><span>Security</span></NavLink></nav>
      <div className="sidebar-foot">
        <button className="desktop-collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><FiChevronLeft /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button>
        <button className="mobile-close" type="button" onClick={() => setMobileOpen(false)}><FiX /><span>Close navigation</span></button>
        <div className="profile-mini"><div className="avatar">{user.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</div><span><b>{user.name}</b><small>{user.role}</small></span><button aria-label="Log out" title="Log out" onClick={() => logout()}><FiLogOut /></button></div>
      </div>
    </aside>
    <main>
      <header>
        <div className="header-location">
          <button className="mobile-menu" type="button" aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><FiMenu /></button>
          {showBack && <button className="header-back" type="button" onClick={goBack} aria-label="Go to previous page" title="Go to previous page"><FiArrowLeft /><span>Back</span></button>}
          <div className="crumb"><span>Workspace</span><b>/</b><strong>{location.pathname.split('/').filter(Boolean).join(' / ') || 'Dashboard'}</strong></div>
        </div>
        <Link className="mobile-header-brand" to={roleHome[user.role]} aria-label="Go to dashboard"><img src="/vp-mark.svg" alt="" /><span>Visitor Pass</span></Link>
        <div className="header-actions"><button aria-label="Toggle theme" title="Toggle light or dark theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <FiMoon /> : <FiSun />}</button><Link className="secondary" aria-label="Security settings" title="Security settings" to="/change-password"><FiKey /></Link></div>
      </header>
      <Outlet />
    </main>
  </div>
}
