import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FiActivity, FiArrowLeft, FiBarChart2, FiChevronLeft, FiGrid, FiKey, FiLogIn, FiLogOut, FiMenu, FiMoon, FiPlus, FiSun, FiUsers } from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'

const activity = ['/activity', FiActivity, 'Activity']
const navByRole = {
  administrator: [['/dashboard/admin', FiGrid, 'Overview'], ['/users', FiUsers, 'People & access'], ['/visitors', FiUsers, 'Visitor Requests'], ['/reports', FiBarChart2, 'Reports'], activity],
  receptionist: [['/dashboard/receptionist', FiGrid, 'Receptionist dashboard'], ['/visitors/register', FiPlus, 'Register visitor'], ['/visitors?status=approved', FiLogIn, 'Check in'], ['/visitors?status=checked_in', FiLogOut, 'Check out'], ['/visitors?today=true', FiUsers, "Today's visitors"], activity],
  employee: [['/dashboard/employee', FiGrid, 'My dashboard'], ['/visitors?status=pending', FiUsers, 'My visitor requests'], ['/visitors', FiUsers, 'View my visitors'], activity],
}

export default function AppShell() {
  const { user, logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light')
  const location = useLocation()
  const navigate = useNavigate()
  const roleHome = { administrator: '/dashboard/admin', receptionist: '/dashboard/receptionist', employee: '/dashboard/employee' }
  const goBack = () => window.history.length > 1 ? navigate(-1) : navigate(roleHome[user.role], { replace: true })
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme) }, [theme])
  return <div className={`app ${collapsed ? 'collapsed' : ''}`}>
    <aside aria-label="Application sidebar">
      <div className="brand"><img className="brand-logo" src="/vp-mark.svg" alt="" /><span><b>Visitor Pass</b><small>Management System</small></span></div>
      <nav aria-label="Primary navigation">{(navByRole[user.role] || []).map(([to, Icon, label]) => <NavLink key={to} to={to} title={collapsed ? label : undefined}><Icon /><span>{label}</span></NavLink>)}<NavLink to="/change-password" title={collapsed ? 'Security' : undefined}><FiKey /><span>Security</span></NavLink></nav>
      <div className="sidebar-foot"><button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}><FiChevronLeft /><span>{collapsed ? 'Expand' : 'Collapse'}</span></button><div className="profile-mini"><div className="avatar">{user.name.split(' ').map(part => part[0]).join('').slice(0, 2)}</div><span><b>{user.name}</b><small>{user.role}</small></span><button aria-label="Log out" title="Log out" onClick={() => logout()}><FiLogOut /></button></div></div>
    </aside>
    <main><header><button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setCollapsed(!collapsed)}><FiMenu /></button><div className="header-location"><button className="header-back" type="button" onClick={goBack} aria-label="Go back" title="Go back"><FiArrowLeft /><span>Back</span></button><div className="crumb"><span>Workspace</span><b>/</b><strong>{location.pathname.split('/').filter(Boolean).join(' / ') || 'Dashboard'}</strong></div></div><div className="header-actions"><button aria-label="Toggle theme" title="Toggle light or dark theme" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <FiMoon /> : <FiSun />}</button><Link className="secondary" aria-label="Security settings" title="Security settings" to="/change-password"><FiKey /></Link></div></header><Outlet /></main>
  </div>
}
