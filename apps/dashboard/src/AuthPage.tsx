import { ArrowLeftIcon, ArrowRightIcon, CheckCircle2Icon } from "lucide-react"
import { useEffect, useState, type FormEvent } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"

import { initializeAuth, readAuthSession, type AuthClient, type AuthSession } from "@/auth-client"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { createDashboardApi } from "@/dashboard-api"

type AuthMode = "sign-in" | "sign-up"
type AuthIntent = "sync" | "disable" | null
type SocialProvider = "google" | "github"

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.8h3.5c2-1.9 3.2-4.6 3.2-7.9Z" />
      <path fill="#34a853" d="M12 22c2.9 0 5.3-1 7-2.6l-3.5-2.8c-1 .7-2.2 1-3.5 1a6.1 6.1 0 0 1-5.8-4.2H2.7v2.8A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.2 13.4a6 6 0 0 1 0-3.8V6.8H2.7a10 10 0 0 0 0 9.4l3.5-2.8Z" />
      <path fill="#ea4335" d="M12 6.4c1.6 0 3 .5 4.1 1.6l3.1-3.1A10 10 0 0 0 2.7 6.8l3.5 2.8A6.1 6.1 0 0 1 12 6.4Z" />
    </svg>
  )
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1 1.6 1 .9 1.6 2.4 1.1 2.9.9.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.1-4.7-5a4 4 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1.1a9.6 9.6 0 0 1 5.1 0C16.6 5.7 17.4 6 17.4 6c.6 1.4.2 2.4.1 2.7a4 4 0 0 1 1.1 2.7c0 3.9-2.4 4.7-4.7 5 .4.3.7 1 .7 1.9V21c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
  )
}

function safeReturnTo(value: string | null, fallback: string): string {
  return value?.startsWith("/dashboard") ? value : fallback
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [auth, setAuth] = useState<AuthClient>()
  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof initializeAuth>>["runtime"]>()
  const [existingSession, setExistingSession] = useState<AuthSession>()
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [socialProvider, setSocialProvider] = useState<SocialProvider>()
  const [checking, setChecking] = useState(true)
  const [verificationSent, setVerificationSent] = useState(false)

  const intent = searchParams.get("intent") as AuthIntent
  const defaultDestination = intent ? "/dashboard/settings" : "/dashboard"
  const returnTo = safeReturnTo(searchParams.get("returnTo"), defaultDestination)
  const alternateParams = new URLSearchParams()
  if (intent) alternateParams.set("intent", intent)
  if (returnTo !== defaultDestination) alternateParams.set("returnTo", returnTo)
  const alternateHref = `${mode === "sign-in" ? "/sign-up" : "/sign-in"}${alternateParams.size ? `?${alternateParams}` : ""}`

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const initialized = await initializeAuth()
        if (!initialized.auth) throw new Error("Sign-in is unavailable while the remote service cannot be reached.")
        const session = await readAuthSession(initialized.auth)
        if (!active) return
        setAuth(initialized.auth)
        setRuntime(initialized.runtime)
        setExistingSession(session)
        if (session && !intent) navigate(returnTo, { replace: true })
      } catch (initializeError) {
        if (active) setError(initializeError instanceof Error ? initializeError.message : "Neon Auth could not be initialized.")
      } finally {
        if (active) setChecking(false)
      }
    })()
    return () => { active = false }
  }, [intent, navigate, returnTo])

  async function finishAuthentication(session: AuthSession) {
    if (!runtime) throw new Error("Remote sync is not configured.")
    const api = createDashboardApi(runtime, session.token)
    if (intent === "sync") {
      await api.enableLocalSync(session.token)
    } else if (intent === "disable") {
      await api.disableLocalSync(session.token)
    }
    navigate(returnTo, { replace: true })
  }

  async function continueExistingSession() {
    if (!existingSession) return
    setSubmitting(true)
    setError("")
    try {
      await finishAuthentication(existingSession)
    } catch (continueError) {
      setError(continueError instanceof Error ? continueError.message : "The account action could not be completed.")
    } finally {
      setSubmitting(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!auth) return
    setSubmitting(true)
    setError("")
    try {
      if (mode === "sign-up") {
        if (password !== confirmPassword) throw new Error("The passwords do not match. Please enter the same password twice.")
        const callbackParams = new URLSearchParams({ verified: "1" })
        if (intent) callbackParams.set("intent", intent)
        callbackParams.set("returnTo", returnTo)
        const result = await auth.adapter.signUp.email({
          email: email.trim(),
          password,
          name: name.trim(),
          callbackURL: `${window.location.origin}/sign-in?${callbackParams}`,
        })
        if (result.error) throw new Error(result.error.message || "Your account could not be created.")
        setVerificationSent(true)
        setPassword("")
        setConfirmPassword("")
        return
      }

      const result = await auth.adapter.signIn.email({ email: email.trim(), password })
      if (result.error) throw new Error(result.error.message || "We could not sign you in with those details.")
      const session = await readAuthSession(auth)
      if (!session) throw new Error("Your session could not be verified. Please try signing in again.")
      await finishAuthentication(session)
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "The account request could not be completed.")
    } finally {
      setSubmitting(false)
    }
  }

  async function signInWithSocial(provider: SocialProvider) {
    if (!auth) return
    setSocialProvider(provider)
    setError("")
    try {
      const callbackParams = new URLSearchParams({ returnTo })
      if (intent) callbackParams.set("intent", intent)
      const callbackURL = `${window.location.origin}/sign-in?${callbackParams}`
      const result = await auth.adapter.signIn.social({
        provider,
        callbackURL,
        errorCallbackURL: callbackURL,
      })
      if (result.error) throw new Error(result.error.message || `${provider === "google" ? "Google" : "GitHub"} sign-in could not be started.`)
    } catch (socialError) {
      setError(socialError instanceof Error ? socialError.message : "Social sign-in could not be started.")
      setSocialProvider(undefined)
    }
  }

  if (searchParams.get("verified") === "1" && mode === "sign-up") {
    return <Navigate to={`/sign-in?${searchParams}`} replace />
  }

  return (
    <main className="auth-page" id="main-content">
      <Link className="auth-back-link" to="/"><ArrowLeftIcon /> Home</Link>
      <section className="auth-intro" aria-labelledby="auth-title">
        <img className="auth-product-mark" src="/assets/language-coach-icon.png" alt="" />
        <p className="auth-kicker">Private learning history</p>
        <h1 id="auth-title">{mode === "sign-up" ? "Keep your English notes close." : "Welcome back to your words."}</h1>
        <p>{mode === "sign-up"
          ? "Create an account to sync your lessons privately across local and web dashboards."
          : "Sign in to continue where your last useful correction left off."}</p>
        <div className="auth-privacy-note">
          <span aria-hidden="true">01</span>
          <p><strong>Your work stays out.</strong> Only language-learning notes are included in your account history.</p>
        </div>
      </section>

      <section className="auth-panel" aria-label={mode === "sign-up" ? "Create account" : "Sign in"}>
        {checking ? (
          <div className="auth-status" role="status"><span className="auth-loader" />Preparing secure sign-in…</div>
        ) : verificationSent ? (
          <div className="auth-verification" role="status">
            <CheckCircle2Icon />
            <p className="auth-kicker">One more step</p>
            <h2>Check your email.</h2>
            <p>We sent a verification link to <strong>{email}</strong>. Open it, then sign in to finish connecting your notes.</p>
            <Link className="auth-primary-link" to={alternateHref.replace("/sign-up", "/sign-in")}>Go to sign in <ArrowRightIcon /></Link>
          </div>
        ) : existingSession && intent ? (
          <div className="auth-verification">
            <CheckCircle2Icon />
            <p className="auth-kicker">Already signed in</p>
            <h2>Continue as {existingSession.user.email}</h2>
            <p>{intent === "sync" ? "Connect this device and upload its local learning notes." : "Turn off sync and revoke this device’s remote access."}</p>
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button className="auth-submit" disabled={submitting} onClick={() => void continueExistingSession()}>
              {submitting ? "Updating this device…" : intent === "sync" ? "Connect this device" : "Turn off sync"} {!submitting && <ArrowRightIcon />}
            </Button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <div className="auth-form-heading">
              <p className="auth-kicker">{mode === "sign-up" ? "New learner" : "Your account"}</p>
              <h2>{mode === "sign-up" ? "Create account" : "Sign in"}</h2>
            </div>
            {searchParams.get("verified") === "1" && <p className="auth-success" role="status"><CheckCircle2Icon /> Email verified. You can sign in now.</p>}
            <div className="auth-social-options" aria-label="Social sign-in options">
              <Button className="auth-social-button" type="button" variant="outline" disabled={!auth || Boolean(socialProvider)} onClick={() => void signInWithSocial("google")}>
                <GoogleIcon />
                {socialProvider === "google" ? "Connecting to Google…" : "Continue with Google"}
              </Button>
              <Button className="auth-social-button" type="button" variant="outline" disabled={!auth || Boolean(socialProvider)} onClick={() => void signInWithSocial("github")}>
                <GitHubIcon />
                {socialProvider === "github" ? "Connecting to GitHub…" : "Continue with GitHub"}
              </Button>
            </div>
            <div className="auth-divider"><span>or continue with email</span></div>
            {mode === "sign-up" && <Field>
              <FieldLabel htmlFor="auth-name">Name</FieldLabel>
              <Input id="auth-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>}
            <Field>
              <FieldLabel htmlFor="auth-email">Email</FieldLabel>
              <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required aria-describedby="auth-email-note" />
              {mode === "sign-up" && <FieldDescription id="auth-email-note">We’ll send a verification link to this address.</FieldDescription>}
            </Field>
            <Field>
              <FieldLabel htmlFor="auth-password">Password</FieldLabel>
              <Input id="auth-password" type="password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
              {mode === "sign-up" && <FieldDescription>Use at least 8 characters.</FieldDescription>}
            </Field>
            {mode === "sign-up" && <Field>
              <FieldLabel htmlFor="auth-confirm-password">Confirm password</FieldLabel>
              <Input id="auth-confirm-password" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={8} />
            </Field>}
            {error && <p className="auth-error" role="alert">{error}</p>}
            <Button className="auth-submit" type="submit" disabled={submitting || Boolean(socialProvider) || !auth}>
              {submitting ? (mode === "sign-up" ? "Creating your account…" : "Signing you in…") : (mode === "sign-up" ? "Create account" : "Sign in")}
              {!submitting && <ArrowRightIcon />}
            </Button>
            <p className="auth-alternate">{mode === "sign-up" ? "Already have an account?" : "New to Language Coach?"} <Link to={alternateHref}>{mode === "sign-up" ? "Sign in" : "Create an account"}</Link></p>
            <p className="auth-legal-copy">By continuing, you agree to the <Link to="/terms">Terms of Service</Link> and acknowledge the <Link to="/privacy-policy">Privacy Policy</Link>.</p>
          </form>
        )}
      </section>
    </main>
  )
}
