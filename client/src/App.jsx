import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppShell from './components/layout/AppShell';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import Login from './pages/Login';
import Unauthorized from './pages/Unauthorized';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Visitors = lazy(() => import('./pages/Visitors'));
const Register = lazy(() => import('./pages/RegisterVisitor'));
const Users = lazy(() => import('./pages/UserManagement'));
const ChangePassword = lazy(() => import('./pages/ChangePassword'));
const VisitDesk = lazy(() => import('./pages/VisitDesk'));
const Reports = lazy(() => import('./pages/Reports'));
const ActivityHistory = lazy(() => import('./pages/ActivityHistory'));

const home = { administrator: '/dashboard/admin', receptionist: '/dashboard/receptionist', employee: '/dashboard/employee' };
const pageMeta = [
  ['/login', 'Sign in', 'Secure sign in to the workplace visitor management portal.'],
  ['/dashboard', 'Dashboard', 'Live visitor operations, approvals, arrivals, and workplace activity.'],
  ['/users', 'People & Access', 'Manage employee records, user accounts, roles, and access status.'],
  ['/visitors/register', 'Register Visitor', 'Register a workplace visitor and submit the visit for host approval.'],
  ['/visitors', 'Visitor Requests', 'Review visitor requests, approvals, check-ins, and visit history.'],
  ['/reports', 'Reports', 'Analyze and export visitor operations and workplace access reports.'],
  ['/activity', 'Activity History', 'Review the complete visitor and account audit history.'],
  ['/change-password', 'Security', 'Update account credentials and protect active sessions.'],
  ['/unauthorized', 'Unauthorized', 'This account does not have permission to access the requested page.'],
];

function AppMetadata() {
  const { pathname } = useLocation();
  const [, title, description] = pageMeta.find(([path]) => pathname === path || (path !== '/login' && pathname.startsWith(`${path}/`))) || ['', 'Visitor Pass Management System', 'Secure workplace visitor management portal.'];
  const canonical = `${window.location.origin}${pathname}`;
  const fullTitle = title === 'Visitor Pass Management System' ? title : `${title} | Visitor Pass`;
  return <Helmet><title>{fullTitle}</title><meta name="description" content={description}/><link rel="canonical" href={canonical}/><meta property="og:title" content={fullTitle}/><meta property="og:description" content={description}/><meta property="og:url" content={canonical}/><meta name="twitter:title" content={fullTitle}/><meta name="twitter:description" content={description}/></Helmet>;
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot"><span className="brand-mark">V</span><div className="loader" /></div>;
  return user ? <AppShell /> : <Navigate to="/login" replace />;
}

function RoleRoute({ roles, children }) {
  const { user } = useAuth();
  const location = useLocation();
  return roles.includes(user?.role) ? children : <Navigate to="/unauthorized" replace state={{ from: location }} />;
}

function Home() {
  const { user } = useAuth();
  return <Navigate to={home[user?.role] || '/login'} replace />;
}

function RoleAwareVisitors() {
  const { user } = useAuth();
  const location = useLocation();
  const status = new URLSearchParams(location.search).get('status');
  if (user?.role === 'receptionist' && ['approved', 'checked_in'].includes(status)) return <VisitDesk key={status} />;
  return <Visitors />;
}

export default function App() {
  return (
    <AppErrorBoundary><HelmetProvider><BrowserRouter><AuthProvider><AppMetadata />
      <Suspense fallback={<div className="page-loader" />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Protected />}>
            <Route index element={<Home />} />
            <Route path="/unauthorized" element={<Unauthorized />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/dashboard/admin" element={<RoleRoute roles={['administrator']}><Dashboard /></RoleRoute>} />
            <Route path="/dashboard/receptionist" element={<RoleRoute roles={['receptionist']}><Dashboard /></RoleRoute>} />
            <Route path="/dashboard/employee" element={<RoleRoute roles={['employee']}><Dashboard /></RoleRoute>} />
            <Route path="/users" element={<RoleRoute roles={['administrator']}><Users /></RoleRoute>} />
            <Route path="/register" element={<Navigate to="/visitors/register" replace />} />
            <Route path="/visitors/register" element={<RoleRoute roles={['administrator', 'receptionist']}><Register /></RoleRoute>} />
            <Route path="/check-in" element={<RoleRoute roles={['receptionist']}><VisitDesk /></RoleRoute>} />
            <Route path="/visitors" element={<RoleAwareVisitors />} />
            <Route path="/reports" element={<RoleRoute roles={['administrator']}><Reports /></RoleRoute>} />
            <Route path="/activity" element={<RoleRoute roles={['administrator', 'receptionist', 'employee']}><ActivityHistory /></RoleRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
      <Toaster position="top-right" />
    </AuthProvider></BrowserRouter></HelmetProvider></AppErrorBoundary>
  );
}
