import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { FiArrowRight, FiEye, FiEyeOff } from 'react-icons/fi'
import { Helmet } from 'react-helmet-async'
import toast from 'react-hot-toast'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const schema = z.object({ email: z.string().min(1, 'Email is required').email('Enter a valid work email'), password: z.string().min(8, 'Password must be at least 8 characters'), rememberMe: z.boolean() })
const home = { administrator: '/dashboard/admin', receptionist: '/dashboard/receptionist', employee: '/dashboard/employee' }

export default function Login() {
  const { user, login } = useAuth()
  const [show, setShow] = useState(false)
  const [serverError, setServerError] = useState('')
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', rememberMe: false } })
  if (user) return <Navigate to={home[user.role]} replace />
  const submit = async values => { setServerError(''); try { const signedIn = await login(values); toast.success('Login successful'); location.assign(home[signedIn.role]) } catch (error) { setServerError(error.message || 'Unable to sign in') } }
  return <main className="access-login">
    <Helmet><title>Sign in | Visitor Pass</title><meta name="description" content="Secure sign in to the Visitor Pass Management System." /></Helmet>
    <section className="login-identity" aria-labelledby="product-name">
      <div className="login-product"><img src="/vp-mark.svg" alt="" /><span><b>Visitor Pass</b><small>Management System</small></span></div>
      <div className="entry-blueprint" aria-hidden="true"><span className="blueprint-label">ENTRY CONTROL / 01</span><div className="floor-zone zone-a"/><div className="floor-zone zone-b"/><div className="floor-zone zone-c"/><div className="route-line"><i/><i/><i/></div><div className="checkpoint"><span>RECEPTION</span><b>Access verified</b><small>Visitor record active</small></div></div>
      <div className="identity-copy"><span>Workplace access operations</span><h1 id="product-name">Visitor access under control.</h1><p>Manage registrations, host decisions, arrivals, departures, and audit records from one accountable workplace system.</p></div>
      <div className="identity-status"><i/><span>Secure system access</span><small>For authorized personnel</small></div>
    </section>
    <section className="access-form-side" aria-labelledby="login-title"><div className="access-form-wrap">
      <div className="login-mobile-product"><img src="/vp-mark.svg" alt="" /><span><b>Visitor Pass</b><small>Management System</small></span></div>
      <header className="access-form-heading"><span>Account access</span><h2 id="login-title">Sign in to your workspace</h2><p>Enter your company-issued credentials to continue.</p></header>
      <form onSubmit={handleSubmit(submit)} noValidate>{serverError && <div className="auth-error" role="alert">{serverError}</div>}<label className={`access-field ${errors.email ? 'invalid' : ''}`}><span>Email address</span><input {...register('email')} placeholder="name@company.com" autoComplete="email" /><small>{errors.email?.message}</small></label><label className={`access-field ${errors.password ? 'invalid' : ''}`}><span>Password</span><div className="access-password"><input {...register('password')} type={show ? 'text' : 'password'} autoComplete="current-password" /><button type="button" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(current => !current)}>{show ? <FiEyeOff /> : <FiEye />}</button></div><small>{errors.password?.message}</small></label><div className="access-options"><label><input {...register('rememberMe')} type="checkbox" /><span>Remember me</span></label><a href="mailto:admin@visitorpass.com">Forgot password?</a></div><button className="access-submit" disabled={isSubmitting}>{isSubmitting ? <><span className="spinner" />Signing in</> : <>Sign In <FiArrowRight /></>}</button></form>
      <footer className="access-support"><span>Visitor Pass Management System</span><small>Protected company environment</small></footer>
    </div></section>
  </main>
}
