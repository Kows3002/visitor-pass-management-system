import { useCallback, useEffect, useMemo, useState } from 'react'
import { FiActivity, FiCalendar, FiCheck, FiChevronDown, FiChevronLeft, FiChevronRight, FiClock, FiDownload, FiFileText, FiKey, FiLogIn, FiSearch, FiShield, FiTrash2, FiUserPlus, FiUsers, FiX } from 'react-icons/fi'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from '../context/AuthContext'

const visitorActions = new Set(['created', 'approved', 'rejected', 'cancelled', 'checked_in', 'checked_out', 'remarks_added', 'arrival_confirmed', 'not_arrived', 'next_visit_scheduled'])
const accountActions = new Set(['login', 'password_changed', 'user_created', 'user_deleted'])
const actionCategories = [
  ['', 'All'],
  ['visitor', 'Visitor Events'],
  ['authentication', 'Authentication'],
  ['user_management', 'User Management'],
  ['employee_management', 'Employee Management'],
]
const categoryActions = {
  visitor: visitorActions,
  authentication: new Set(['login', 'password_changed']),
  user_management: new Set(['user_created', 'user_deleted']),
  employee_management: new Set(['employee_created', 'employee_updated', 'employee_deleted']),
}
const copy = {
  created: ['Visitor Registered', 'A visitor request was created and sent to the host.'],
  approved: ['Visit Approved', 'The host approved this visitor request.'],
  rejected: ['Visit Rejected', 'The host declined this visitor request.'],
  checked_in: ['Check In', 'Reception recorded the visitor entering the workplace.'],
  checked_out: ['Check Out', 'Reception recorded the visitor leaving the workplace.'],
  cancelled: ['Visit Cancelled', 'The visitor request was removed from active operations.'],
  password_changed: ['Password Changed', 'Account credentials were securely updated.'],
  user_created: ['User Created', 'A new workspace account was provisioned.'],
  user_deleted: ['User Deleted', 'A workspace account was removed.'],
  employee_created: ['Employee Created', 'A new employee profile was created.'],
  employee_updated: ['Employee Updated', 'An employee profile was updated.'],
  employee_deleted: ['Employee Deleted', 'An employee profile was removed.'],
  remarks_added: ['Remark Added', 'Additional context was added to the visitor record.'],
  login: ['User Signed In', 'A secure workspace session was started.'],
  arrival_confirmed: ['Arrival Confirmed', 'Reception confirmed that the visitor arrived and alerted the employee.'],
  not_arrived: ['Visitor Not Arrived', 'Reception recorded a missed appointment and sent notifications.'],
  next_visit_scheduled: ['Next Visit Scheduled', 'The employee set and emailed the next visiting date.'],
}

export default function ActivityHistory() {
  const { user } = useAuth()
  const [filters, setFilters] = useState({ search: '', role: '', from: '', to: '', page: 1, limit: 15 })
  const [actionCategory, setActionCategory] = useState('')
  const [items, setItems] = useState([])
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, actionCounts: {} })
  const [todayTotal, setTodayTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState('')
  const [sort, setSort] = useState('newest')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.get('/activities', { params: filters })
      setItems(response.data)
      setMeta(response.meta)
    } catch (error) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 280 : 0)
    return () => clearTimeout(timer)
  }, [load, filters.search])

  useEffect(() => {
    const date = localDate()
    Promise.all([
      api.get('/activities', { params: { from: date, to: date, page: 1, limit: 1 } }),
      api.get('/activities', { params: { from: date, to: date, action: 'login', page: 1, limit: 1 } }),
    ]).then(([all, signIns]) => {
      setTodayTotal(Math.max(0, all.meta.total - signIns.meta.total))
    }).catch(() => {})
  }, [])

  const change = (key, value) => setFilters(current => ({ ...current, [key]: value, page: 1 }))
  const changeCategory = value => {
    setActionCategory(value)
    setExpanded('')
  }
  const reset = () => {
    setFilters(current => ({ ...current, search: '', role: '', from: '', to: '', page: 1 }))
    setActionCategory('')
  }
  const exportAudit = async () => {
    try {
      const blob = await api.get('/activities/export/csv', { params: filters, responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `activity-audit-${localDate()}.csv`
      anchor.click()
      URL.revokeObjectURL(url)
      toast.success('Audit report downloaded')
    } catch (error) { toast.error(error.message || 'Audit export failed') }
  }
  const counts = meta.actionCounts || {}
  const totalActivities = Object.values(counts).reduce((sum, value) => sum + value, 0)
  const visitorTotal = Object.entries(counts).reduce((sum, [action, value]) => sum + (visitorActions.has(action) ? value : 0), 0)
  const accountTotal = Object.entries(counts).reduce((sum, [action, value]) => sum + (accountActions.has(action) ? value : 0), 0)
  const visibleItems = useMemo(() => {
    const allowed = categoryActions[actionCategory]
    return [...items]
      .filter(item => !allowed || allowed.has(item.action))
      .sort((a, b) => sort === 'newest' ? new Date(b.createdAt) - new Date(a.createdAt) : new Date(a.createdAt) - new Date(b.createdAt))
  }, [items, sort, actionCategory])

  return <main className="audit-page">
    <header className="audit-heading">
      <div><span>Governance / Audit</span><h1>Activity History</h1><p>{user.role === 'administrator' ? 'Review workspace events, visitor decisions, and account activity from one accountable record.' : 'Review the actions performed through your account.'}</p></div>
      <div className="audit-heading-actions">{user.role === 'administrator' && <button onClick={exportAudit}><FiDownload />Export audit CSV</button>}<div className="audit-integrity"><FiShield /><span><b>Audit logging active</b><small>Records are stored in MongoDB</small></span></div></div>
    </header>
    <section className="audit-summary">
      <Summary label="Total Activities" value={totalActivities} icon={FiActivity} />
      <Summary label="Today's Activities" value={todayTotal} icon={FiClock} note="Excludes sign-ins" />
      <Summary label="Visitor Events" value={visitorTotal} icon={FiFileText} />
      <Summary label="Authentication & Account Events" value={accountTotal} icon={FiUsers} />
    </section>
    <section className="audit-toolbar">
      <div className="audit-search"><FiSearch /><input value={filters.search} onChange={event => change('search', event.target.value)} placeholder="Search user, visitor, company, or remarks" />{filters.search && <button onClick={() => change('search', '')} aria-label="Clear search"><FiX /></button>}</div>
      <label><select value={actionCategory} onChange={event => changeCategory(event.target.value)}>{actionCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><FiChevronDown /></label>
      {user.role === 'administrator' && <label><select value={filters.role} onChange={event => change('role', event.target.value)}><option value="">All user roles</option><option value="administrator">Administrator</option><option value="receptionist">Receptionist</option><option value="employee">Employee</option></select><FiChevronDown /></label>}
      <div className="audit-dates"><FiCalendar /><input type="date" value={filters.from} onChange={event => change('from', event.target.value)} /><span>to</span><input type="date" min={filters.from} value={filters.to} onChange={event => change('to', event.target.value)} /></div>
      <label className="sort-filter"><select value={sort} onChange={event => setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select><FiChevronDown /></label>
      <button className="audit-reset" onClick={reset} disabled={!filters.search && !actionCategory && !filters.role && !filters.from && !filters.to}>Reset filters</button>
    </section>
    <section className="audit-panel">
      <header><div><h2>Audit log</h2><span>{actionCategory ? `${visibleItems.length} shown on this page` : `${meta.total} matching ${meta.total === 1 ? 'record' : 'records'}`}</span></div><small>Page {meta.page} of {meta.pages}</small></header>
      <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Visitor / Employee</th><th>Description</th><th>Status</th><th aria-label="Expand" /></tr></thead><tbody>{loading ? <AuditSkeleton /> : visibleItems.length ? visibleItems.map((item, index) => <AuditRow key={item._id} item={item} mutedLogin={isRepeatedLogin(item, visibleItems[index - 1])} open={expanded === item._id} onToggle={() => setExpanded(current => current === item._id ? '' : item._id)} />) : <AuditEmpty />}</tbody></table></div>
      <footer><span>Showing {visibleItems.length} of {meta.total} activities</span><div><button disabled={meta.page <= 1} onClick={() => setFilters(current => ({ ...current, page: current.page - 1 }))}><FiChevronLeft />Previous</button><button disabled={meta.page >= meta.pages} onClick={() => setFilters(current => ({ ...current, page: current.page + 1 }))}>Next<FiChevronRight /></button></div></footer>
    </section>
  </main>
}

function Summary({ label, value, icon: Icon, note }) {
  return <article><span><Icon /></span><div><small>{label}</small><strong>{value}</strong>{note && <em>{note}</em>}</div></article>
}

function AuditRow({ item, open, onToggle, mutedLogin }) {
  const [actionTitle, description] = copy[item.action] || [title(item.action), 'Recorded workspace activity.']
  const person = item.performedBy?.name || 'System user'
  const target = item.visitor?.visitorName || item.metadata?.targetName || '—'
  const date = new Date(item.createdAt)
  return <>
    <tr className={`audit-row ${open ? 'expanded' : ''} ${mutedLogin ? 'repeated-login' : ''}`} onClick={onToggle}>
      <td data-label="Time"><time><b>{relativeTime(date)}</b><span>{fullTimestamp(date)}</span></time></td>
      <td data-label="User"><div className="audit-user"><span>{initials(person)}</span><div><b>{person}</b><small>{item.performedBy?.email || 'Workspace account'}</small></div></div></td>
      <td data-label="Role"><span className={`audit-role ${item.role}`}>{title(item.role)}</span></td>
      <td data-label="Action"><span className={`audit-action ${item.action}`}>{actionIcon(item.action)}{actionTitle}</span></td>
      <td data-label="Visitor / Employee"><b className="audit-target">{target}</b></td>
      <td data-label="Description"><p className="audit-description">{description}</p></td>
      <td data-label="Status"><span className="audit-recorded"><i />Recorded</span></td>
      <td><button className="row-expand" aria-label="Toggle activity details"><FiChevronDown /></button></td>
    </tr>
    {open && <tr className="audit-detail-row"><td colSpan="8"><div className="audit-detail"><div><span>Full timestamp</span><b>{date.toLocaleString()}</b></div><div><span>Activity ID</span><b>{item._id}</b></div><div><span>Related record</span><b>{item.visitor?._id || item.metadata?.targetId || 'Not applicable'}</b></div><div><span>Role at event</span><b>{title(item.role)}</b></div>{item.remarks && <blockquote><span>Remarks</span><p>{item.remarks}</p></blockquote>}</div></td></tr>}
  </>
}

function AuditSkeleton() { return [1, 2, 3, 4, 5].map(item => <tr className="audit-skeleton" key={item}><td><i /></td><td><i /></td><td><i /></td><td><i /></td><td><i /></td><td><i /></td><td><i /></td><td /></tr>) }
function AuditEmpty() { return <tr><td colSpan="8"><div className="audit-empty"><span><FiActivity /></span><h2>No matching activity events</h2><p>Try changing the search phrase, category, role, or date range.</p></div></td></tr> }
function actionIcon(action) { if (action === 'approved') return <FiCheck />; if (['rejected', 'cancelled'].includes(action)) return <FiX />; if (action === 'checked_in') return <FiLogIn />; if (action === 'password_changed') return <FiKey />; if (action === 'user_created') return <FiUserPlus />; if (action === 'user_deleted') return <FiTrash2 />; return <FiActivity /> }
function isRepeatedLogin(item, previous) { return item.action === 'login' && previous?.action === 'login' && actorId(item) === actorId(previous) }
function actorId(item) { return String(item?.performedBy?._id || item?.performedBy || item?.userName || '') }
const localDate = () => { const date = new Date(), offset = date.getTimezoneOffset(); return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10) }
const title = value => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
const initials = name => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
const relativeTime = date => { const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000)); if (seconds < 60) return 'Just now'; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`; return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) }
const fullTimestamp = date => date.toLocaleString([], { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
