"use client";

import { useState, useEffect, Fragment } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  Shield,
  Mail,
  Lock,
  LogIn,
  Building2,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { useAppSelector } from "@/hooks/useAppSelector";
import { setCredentials, setAiCredentials, setActiveSite, setSelectedSite, setTenants, updateTenantUser, type AuthUser, type Tenant, type TenantSiteConfig } from "@/store/auth.slice";
import { loginApi } from "@/lib/tenantApi";
import { login as nextAuthLogin, fetchCurrentUser } from "@/lib/authClient";
import { aiLogin, aiSignup, AiAuthError } from "@/lib/aiAuth";
import { flushPersist } from "@/store/persistence";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

/**
 * Maps a NextAuth `result.error` string (or any free-form auth error) to a
 * user-facing message. Used as a fallback when no specific branch in
 * onSubmit() has already produced a tailored message.
 */
function mapAuthError(error: string | undefined | null): string {
  if (!error) return "Sign-in failed. Please try again or contact support.";
  switch (error) {
    case "CredentialsSignin":
      return "Email or password is incorrect.";
    case "AccessDenied":
      return "Your account is inactive. Contact your administrator.";
    case "Verification":
      return "Verification link expired or invalid.";
    case "OAuthAccountNotLinked":
      return "This email is already linked to another sign-in method.";
    default: {
      const lower = error.toLowerCase();
      if (lower.includes("mfa") || lower.includes("otp")) return "Verification code required. Check your email.";
      if (lower.includes("locked")) return "Account is locked. Try again later or contact admin.";
      if (lower.includes("subscription")) return "Your subscription has expired. Contact your administrator.";
      if (lower.includes("inactive")) return "Your account is inactive. Contact your administrator.";
      return "Sign-in failed. Please try again or contact support.";
    }
  }
}

const schema = z.object({
  email: z.string().min(1, "Username or email is required"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

const SUPER_ADMIN_SEED: { username: string; password: string; user: AuthUser } = {
  username: "superadmin",
  password: "1",
  user: {
    id: "u-platform-sa",
    name: "Platform Super Admin",
    email: "superadmin",
    role: "super_admin",
    gxpSignatory: true,
    orgId: "org-platform",
    tenantId: "tenant-glimmora",
  },
};

const MOCK_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  // Pharma Glimmora International — must match prisma/seed.ts exactly.
  // Tenant table → admin@pharmaglimmora.com (customer_admin, password Admin@123).
  // User table  → qa/ra/csv/qc/it/ops@pharmaglimmora.com (all Demo@123).
  "admin@pharmaglimmora.com": { password: "Admin@123", user: { id: "u-001", name: "System Administrator", email: "admin@pharmaglimmora.com", role: "customer_admin", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "qa@pharmaglimmora.com": { password: "Demo@123", user: { id: "u-002", name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", role: "qa_head", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "ra@pharmaglimmora.com": { password: "Demo@123", user: { id: "u-003", name: "Rahul Mehta", email: "ra@pharmaglimmora.com", role: "regulatory_affairs", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "csv@pharmaglimmora.com": { password: "Demo@123", user: { id: "u-004", name: "Anita Patel", email: "csv@pharmaglimmora.com", role: "csv_val_lead", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "qc@pharmaglimmora.com": { password: "Demo@123", user: { id: "u-005", name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", role: "qc_lab_director", gxpSignatory: true, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "it@pharmaglimmora.com": { password: "Demo@123", user: { id: "u-006", name: "Vikram Singh", email: "it@pharmaglimmora.com", role: "it_cdo", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora" } },
  "ops@pharmaglimmora.com": { password: "Demo@123", user: { id: "u-007", name: "Suresh Kumar", email: "ops@pharmaglimmora.com", role: "operations_head", gxpSignatory: false, orgId: "org-1", tenantId: "tenant-glimmora" } },
};

// Every row below must correspond to a real seeded account in prisma/seed.ts.
// Two tables back this: Tenant (super_admin, customer_admin) and User (site users).
const CRED_ROWS: { org: string; rows: [string, string, string, string][] }[] = [
  {
    org: "Platform (bootstrap)",
    rows: [
      // Single Super Admin row using email format for UX consistency with the
      // PGI rows below. The NextAuth Credentials provider accepts both
      // "superadmin" and "superadmin@glimmora.com" (Tenant.username and
      // Tenant.email are both @@unique on the same seeded row).
      ["Super Admin", "superadmin@glimmora.com", "1", "#ef4444"],
    ],
  },
  {
    org: "Pharma Glimmora International",
    rows: [
      ["Customer Admin", "admin@pharmaglimmora.com", "Admin@123", "#8b6914"],
      ["QA Head", "qa@pharmaglimmora.com", "Demo@123", "#a78bfa"],
      ["Regulatory Affairs", "ra@pharmaglimmora.com", "Demo@123", "#fb923c"],
      ["CSV/Val Lead", "csv@pharmaglimmora.com", "Demo@123", "#38bdf8"],
      ["QC/Lab Director", "qc@pharmaglimmora.com", "Demo@123", "#10b981"],
      ["IT/CDO", "it@pharmaglimmora.com", "Demo@123", "#06b6d4"],
      ["Operations Head", "ops@pharmaglimmora.com", "Demo@123", "#84cc16"],
    ],
  },
];

export function LoginPage() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const toast = useToast();
  const themeMode = useAppSelector((s) => s.theme.mode);
  const tenants = useAppSelector((s) => s.auth.tenants);
  const [showCreds, setShowCreds] = useState(false);
  const [loadingTenant, setLoadingTenant] = useState(false);
  const [loadingName, setLoadingName] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isDark = mounted && themeMode === "dark";

  // Session-expired toast handoff. axios.ts (on a 401 from any API call)
  // and AdminShell (on a 401 from /api/auth/me) both navigate to
  // /login?session=expired so the user sees one consistent message
  // regardless of which signal triggered the kick-out. We strip the
  // param from the URL after surfacing the toast so a refresh doesn't
  // re-show it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("session") === "expired") {
      toast.error("Your session expired. Please sign in again.");
      params.delete("session");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
    // Mount-only — runs once when the LoginPage first renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bootstrap: ensure platform super_admin account exists
  useEffect(() => {
    const key = SUPER_ADMIN_SEED.username.toLowerCase();
    if (!MOCK_ACCOUNTS[key]) {
      MOCK_ACCOUNTS[key] = {
        password: SUPER_ADMIN_SEED.password,
        user: SUPER_ADMIN_SEED.user,
      };
    }
  }, []);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  /**
   * Get the sites a user can access. allSites / customer_admin / qa_head
   * see all active sites; others see only their assignedSites.
   */
  const getAccessibleSites = (user: AuthUser, tenant: Tenant | undefined): TenantSiteConfig[] => {
    const tenantSites = tenant?.config?.sites?.filter((s) => s.status === "Active") ?? [];
    const tenantUser = tenant?.config?.users?.find(
      (u) => u.id === user.id || u.email.toLowerCase() === user.email.toLowerCase(),
    );

    // Super admin and customer admin always see all sites
    if (user.role === "super_admin" || user.role === "customer_admin") {
      return tenantSites;
    }

    // allSites flag — see everything
    if (tenantUser?.allSites === true) {
      return tenantSites;
    }

    // Otherwise only show the sites assigned to this user
    if (tenantUser && tenantUser.assignedSites.length > 0) {
      return tenantSites.filter((s) => tenantUser.assignedSites.includes(s.id));
    }

    // No user record or no sites assigned — empty
    return [];
  };

  /**
   * Non-super-admin login: auto-select the first accessible site and go
   * directly to the dashboard. Users with multiple sites can switch via
   * the site dropdown in the topbar header.
   */
  const finishLogin = async (
    user: AuthUser,
    tenant: Tenant | undefined,
    displayName: string,
  ) => {
    const accessible = getAccessibleSites(user, tenant);

    if (accessible.length === 0) {
      // No sites at all — go straight to dashboard with no site filter
      dispatch(setSelectedSite(null));
      const anySite = tenant?.config?.sites?.[0];
      if (anySite) dispatch(setActiveSite(anySite.id));
    } else if (accessible.length === 1) {
      // Exactly one site — auto-select it (no switcher will be shown)
      const only = accessible[0];
      dispatch(setActiveSite(only.id));
      dispatch(setSelectedSite(only.id));
    } else {
      // Multiple sites — default to "All Sites" and keep first as the active fallback
      dispatch(setActiveSite(accessible[0].id));
      dispatch(setSelectedSite(null));
    }

    setLoadingName(displayName);
    setLoadingTenant(true);
    router.push("/");
  };

  /**
   * Refreshes the user's AI backend access_token after a successful app login.
   * The token rotates on every login (per backend spec) so we always re-fetch
   * and write it back into the matching tenant user record.
   *
   * Best-effort: if the AI backend is unreachable or rejects, the app login
   * still succeeds — modules that need the token will prompt for re-auth.
   */
  const persistAiToken = (
    user: AuthUser,
    tenant: Tenant | undefined,
    accessToken: string,
    customerId: string | undefined,
  ) => {
    dispatch(setAiCredentials({ accessToken, customerId }));
    if (tenant) {
      dispatch(
        updateTenantUser({
          tenantId: tenant.id,
          userId: user.id,
          patch: { aiAccessToken: accessToken },
        }),
      );
    }
  };

  const refreshAiToken = async (
    user: AuthUser,
    tenant: Tenant | undefined,
    rawUsername: string,
    rawPassword: string,
  ) => {
    // The AI backend's `username` may be the raw input or the email's
    // local part — try both silently.
    const candidates = [rawUsername.trim()];
    const local = rawUsername.includes("@") ? rawUsername.split("@")[0].trim() : "";
    if (local && !candidates.includes(local)) candidates.push(local);

    // ── 1) Try logging in with each candidate. ─────────────────
    for (const candidate of candidates) {
      try {
        const res = await aiLogin(candidate, rawPassword, /* silent */ true);
        persistAiToken(user, tenant, res.access_token, res.customer_id);
        return;
      } catch {
        // Try next candidate; postJson already logged at warn.
      }
    }

    // ── 2) Self-heal: auto-signup with the credentials just typed.
    //      Seed accounts (qa@, custadmin@, …) and any user not yet on the
    //      AI backend get registered transparently the first time they
    //      sign in. customer_id reuses the tenant's customer admin id when
    //      one exists, otherwise falls back to the tenant id (or, for
    //      customer_admin / super_admin, to the user's own id).
    const tenantUsers = tenant?.config?.users ?? [];
    const adminAiId = tenantUsers.find((u) => u.role === "customer_admin" && u.aiUserId)?.aiUserId;
    const isAdmin = user.role === "super_admin" || user.role === "customer_admin";
    const customerId = adminAiId ?? (isAdmin ? user.id : tenant?.id ?? user.id);
    const username = candidates[0] || user.email || user.id;
    const email = user.email && user.email.includes("@") ? user.email : `${username}@local.invalid`;

    try {
      const res = await aiSignup({
        user_id: user.id,
        username,
        email,
        password: rawPassword,
        customer_id: customerId,
        role: user.role,
      });
      persistAiToken(user, tenant, res.access_token, res.customer_id);
      console.info(`[login] AI backend auto-signed-up '${username}' for tenant ${customerId}`);
      return;
    } catch (err) {
      const reason = err instanceof AiAuthError ? err.message : "unknown";
      console.warn(
        `[login] AI backend login + auto-signup both failed: ${reason}.` +
          " Chatbot / AI CAPA features will be unavailable until this account is registered.",
      );
    }
  };

  const onSubmit = async (data: FormValues) => {
    const key = data.email.toLowerCase().trim();

    // 0. Establish a real next-auth session (real JWT, HttpOnly cookie).
    //    If next-auth succeeds, fetch the user profile from /api/auth/me and
    //    redirect immediately — no need to fall through to the legacy paths.
    try {
      const result = await nextAuthLogin(data.email.trim(), data.password, /* silent */ true);
      if (!result.ok) {
        // Surface specific auth errors back to the form (subscription, etc.)
        if (result.error && result.error.includes("SUBSCRIPTION_INACTIVE")) {
          const msg = "Your subscription has expired or no active plan is configured. Please contact your administrator.";
          setError("root", { message: msg });
          toast.error(msg);
          return;
        }
        if (result.error && result.error.includes("USER_INACTIVE")) {
          const msg = "Your account is inactive. Please contact your administrator to reactivate it.";
          setError("root", { message: msg });
          toast.error(msg);
          return;
        }
        console.warn("[login] next-auth rejected credentials:", result.error);
      } else {
        // NextAuth succeeded — fetch the canonical user profile and redirect.
        const me = await fetchCurrentUser();
        if (me) {
          const user: AuthUser = {
            id: me.id,
            name: me.name,
            email: me.email,
            role: me.role as AuthUser["role"],
            gxpSignatory: me.gxpSignatory,
            tenantId: me.tenantId,
            orgId: me.orgId,
          };
          dispatch(setCredentials({ token: "nextauth-token-" + Date.now(), user }));
          // Fire-and-forget: AI token refresh runs in the background. Without
          // this, the AI Assistant chatbot shows "AI session is missing".
          const userTenant = tenants.find((t) => t.id === user.tenantId);
          void refreshAiToken(user, userTenant, data.email.trim(), data.password)
            .catch((err) => {
              console.warn("[login] AI token refresh failed in background:", err);
            });
          try {
            if (typeof window !== "undefined" && window.location.search) {
              window.history.replaceState({}, "", window.location.pathname);
            }
          } catch { /* ignore */ }
          toast.success(`Welcome back, ${me.name || "team"}!`);
          if (user.role === "super_admin") {
            setLoadingName("Platform Admin");
            setLoadingTenant(true);
            flushPersist(); window.location.assign("/admin");
            return;
          }
          if (user.role === "customer_admin") {
            setLoadingName("workspace");
            setLoadingTenant(true);
            flushPersist(); window.location.assign("/");
            return;
          }
          await finishLogin(user, undefined, me.name);
          return;
        }
      }
    } catch (err) {
      console.warn("[login] next-auth signIn failed", err);
    }

    // 1. Check static mock accounts first
    const mockAccount = MOCK_ACCOUNTS[key];
    if (mockAccount && mockAccount.password === data.password) {
      dispatch(setCredentials({ token: "mock-token-" + Date.now(), user: mockAccount.user }));
      toast.success(`Welcome back, ${mockAccount.user.name || "team"}!`);
      const userTenant = tenants.find((t) => t.id === mockAccount.user.tenantId);
      // Fire-and-forget: AI token refresh runs in the background so login
      // navigation isn't blocked by the AI backend's response time (which on
      // Render free-tier cold starts can exceed 30s for a 2× aiLogin + 1×
      // aiSignup chain). When the token lands, it's persisted into Redux and
      // any subsequent AI-feature use picks it up.
      void refreshAiToken(mockAccount.user, userTenant, data.email.trim(), data.password)
        .catch((err) => {
          console.warn("[login] AI token refresh failed in background:", err);
        });

      if (mockAccount.user.role === "super_admin") {
        setLoadingName("Platform Admin");
        setLoadingTenant(true);
          // Full page navigation — guarantees URL is exactly /admin with no
        // leftover query params, and rehydrates the SPA shell cleanly.
        flushPersist(); window.location.assign("/admin");
        return;
      }

      if (mockAccount.user.role === "customer_admin") {
        const firstSite = userTenant?.config?.sites?.[0];
        if (firstSite) dispatch(setActiveSite(firstSite.id));
        dispatch(setSelectedSite(null));
        setLoadingName(userTenant?.name ?? "workspace");
        setLoadingTenant(true);
          flushPersist(); window.location.assign("/");
        return;
      }

      await finishLogin(mockAccount.user, userTenant, userTenant?.name ?? "workspace");
      return;
    }

    // 2. Try the backend API (Neon) — handles cross-browser sync
    try {
      const apiResult = await loginApi(data.email.trim(), data.password, /* silent */ true);
      if (apiResult) {
        const user = apiResult.user as AuthUser;
        // Refresh local tenant cache with the authoritative one from the server
        dispatch(setTenants([apiResult.tenant]));
        dispatch(setCredentials({ token: "api-token-" + Date.now(), user }));
        toast.success(`Welcome back, ${user.name || "team"}!`);
        // Fire-and-forget — see comment at the first call site for rationale.
        void refreshAiToken(user, apiResult.tenant, data.email.trim(), data.password)
          .catch((err) => {
            console.warn("[login] AI token refresh failed in background:", err);
          });

        if (user.role === "super_admin") {
          setLoadingName("Platform Admin");
          setLoadingTenant(true);
              flushPersist(); window.location.assign("/admin");
          return;
        }

        await finishLogin(user, apiResult.tenant, apiResult.tenant.name);
        return;
      }
    } catch (err) {
      const reason = (err as Error & { reason?: string })?.reason;
      if (reason === "USER_INACTIVE") {
        const msg = "Your account is inactive. Please contact your administrator to reactivate it.";
        setError("root", { message: msg });
        toast.error(msg);
        return;
      }
      if (reason === "SUBSCRIPTION_INACTIVE") {
        const msg = "Your subscription has expired or no active plan is configured. Please contact your administrator.";
        setError("root", { message: msg });
        toast.error(msg);
        return;
      }
      console.warn("[login] API unreachable, falling back to local cache", err);
    }

    // 3. Fallback: check the local Redux cache (for offline / seed data)
    for (const tenant of tenants) {
      const tenantUser = tenant.config.users.find(
        (u) =>
          u.username?.toLowerCase() === key ||
          u.email.toLowerCase() === key ||
          u.name.toLowerCase() === key,
      );
      if (tenantUser && (!tenantUser.password || tenantUser.password === data.password)) {
        if (tenantUser.status !== "Active") {
          const msg = "Your account is inactive. Please contact your administrator to reactivate it.";
          setError("root", { message: msg });
          toast.error(msg);
          return;
        }
        const user: AuthUser = {
          id: tenantUser.id,
          name: tenantUser.name,
          email: tenantUser.email,
          role: tenantUser.role as AuthUser["role"],
          gxpSignatory: tenantUser.gxpSignatory,
          orgId: tenant.id,
          tenantId: tenant.id,
        };
        dispatch(setCredentials({ token: "mock-token-" + Date.now(), user }));
        toast.success(`Welcome back, ${user.name || "team"}!`);
        // Fire-and-forget — see comment at the first call site for rationale.
        void refreshAiToken(user, tenant, data.email.trim(), data.password)
          .catch((err) => {
            console.warn("[login] AI token refresh failed in background:", err);
          });

        if (user.role === "super_admin") {
          setLoadingName("Platform Admin");
          setLoadingTenant(true);
              flushPersist(); window.location.assign("/admin");
          return;
        }

        if (user.role === "customer_admin") {
          const firstSite = tenant.config?.sites?.[0];
          if (firstSite) dispatch(setActiveSite(firstSite.id));
          dispatch(setSelectedSite(null));
          setLoadingName(tenant.name);
          setLoadingTenant(true);
              flushPersist(); window.location.assign("/");
          return;
        }

        await finishLogin(user, tenant, tenant.name);
        return;
      }
    }

    const fallbackMsg = mapAuthError("CredentialsSignin");
    setError("root", { message: "Invalid username or password" });
    toast.error(fallbackMsg);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">

      <div className="w-full max-w-[420px] pt-12 pb-10 px-10">
        {/* Logo — hidden during loading */}
        {!loadingTenant && (
          <div className="flex flex-col items-start mb-8">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-5 bg-[#f0a500]">
              <Shield className="w-7 h-7 text-white" aria-hidden="true" />
            </div>
            <h1 className="text-[28px] font-extrabold text-[#302d29] tracking-tight mb-1">
              Welcome !
            </h1>
            <p className="text-[14px] text-[#7a736a]">
              Log into your account
            </p>
          </div>
        )}

        {/* Loading tenant */}
        {loadingTenant && (
          <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
            <div className="w-8 h-8 rounded-full border-2 border-[#8b6914] border-t-transparent animate-spin" />
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Loading {loadingName}...
            </p>
          </div>
        )}

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          method="post"
          // method="post" is purely defensive: handleSubmit() preventDefault()s
          // every real submission. But if the user clicks Sign in BEFORE React
          // hydration finishes (slow dev server, race with password-manager
          // auto-submit), the native browser submission runs. Without method
          // set the default is GET — which leaks email + password to the URL
          // as ?email=…&password=…. Forcing POST keeps the values in the
          // request body even on pre-hydration submits.
          aria-label="Sign in to Pharma Glimmora"
          noValidate
          className="w-full space-y-4 mt-8"
          style={{ display: loadingTenant ? "none" : undefined }}
        >
          {/* Root error */}
          {errors.root && (
            <div role="alert" className="rounded-lg px-3 py-2.5 bg-[#fef2f2] border border-[#fecaca] text-[12px] text-[#dc2626] flex items-start gap-2">
              <span aria-hidden="true" className="mt-0.5">⚠️</span>
              <div className="min-w-0">
                <p className="font-medium">{errors.root.message}</p>
                {process.env.NODE_ENV === "development" && (
                  <p className="text-[11px] mt-0.5 text-[#ef4444]">
                    Tip: click &quot;Show dev credentials&quot; below to auto-fill a working account.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Username / email — matches the passcode field below to stay
              light-themed regardless of the user's stored theme preference. */}
          <div>
            <label htmlFor="email" className="text-[11px] font-medium text-[#302d29] block mb-1.5">
              Work email <span className="text-[#dc2626]" aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            {/* suppressHydrationWarning on form fields is intentional:
                password-manager / form-filler browser extensions (Bitwarden,
                LastPass, 1Password, etc.) inject fdprocessedid attributes
                post-SSR, causing a benign hydration mismatch. Do not remove. */}
            <div className="relative">
              <Mail className="w-3.5 h-3.5 text-[#a39e96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="email"
                type="text"
                autoComplete="email"
                placeholder="admin@pharmaglimmora.com"
                required
                aria-required="true"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? "email-error" : undefined}
                suppressHydrationWarning
                {...register("email")}
                className="w-full bg-white border border-[#e8e4dd] rounded-lg pl-9.5 pr-3 py-2.5 text-[13px] text-[#302d29] placeholder:text-[#a39e96] outline-none focus:border-[#8b6914] focus:ring-[3px] focus:ring-[rgba(139,105,20,0.12)] transition-all duration-150"
              />
            </div>
            {errors.email && (
              <p id="email-error" role="alert" className="text-[11px] text-[#dc2626] mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label htmlFor="password" className="text-[11px] font-medium text-[#302d29]">
                Passcode <span className="text-[#dc2626]" aria-hidden="true">*</span>
              </label>
              <span className="text-[11px] text-[#8b6914] cursor-pointer underline">Forgot passcode?</span>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-[#a39e96] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your passcode"
                required
                aria-required="true"
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? "password-error" : undefined}
                suppressHydrationWarning
                {...register("password")}
                className="w-full bg-white border border-[#e8e4dd] rounded-lg pl-9.5 pr-3 py-2.5 text-[13px] text-[#302d29] placeholder:text-[#a39e96] outline-none focus:border-[#8b6914] focus:ring-[3px] focus:ring-[rgba(139,105,20,0.12)] transition-all duration-150"
              />
            </div>
            {errors.password && (
              <p id="password-error" role="alert" className="text-[11px] text-[#dc2626] mt-1">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" icon={LogIn} loading={isSubmitting} fullWidth className="py-2.75" suppressHydrationWarning>
            {isSubmitting ? "Signing in..." : "Sign in"}
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#e8e4dd]" />
            <span className="text-[11px] text-[#a39e96]">or continue with</span>
            <div className="flex-1 h-px bg-[#e8e4dd]" />
          </div>

          {/* SSO — light cream tint so it reads as a secondary action
              while staying distinct from the white email/passcode fields. */}
          <button
            type="button"
            suppressHydrationWarning
            className="w-full inline-flex items-center justify-center gap-2 bg-[#f7efe2] border border-[#e8d9b8] rounded-lg py-2.5 text-[13px] font-semibold text-[#302d29] cursor-pointer outline-none transition-all duration-150 hover:bg-[#f0e3c8] hover:border-[#8b6914] focus:border-[#8b6914] focus:ring-[3px] focus:ring-[rgba(139,105,20,0.12)]"
          >
            <Building2 className="w-4 h-4 text-[#8b6914]" aria-hidden="true" />
            Single Sign-On (SSO)
          </button>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-[#e8e4dd]" style={{ display: loadingTenant ? "none" : undefined }}>
          <div className="flex items-center gap-1.5 text-[11px] text-[#a39e96]">
            <Shield className="w-3 h-3" aria-hidden="true" />
            21 CFR Part 11 compliant
          </div>
          <span className="text-[11px] text-[#7a736a]">Privacy · Terms</span>
        </div>

        {/* Dev credentials toggle — gated to non-production builds so production
            users never see seed passwords. NODE_ENV is inlined at build time so
            this entire block (plus CRED_ROWS data downstream) is tree-shaken
            out of the production bundle. */}
        {process.env.NODE_ENV !== "production" && (
        <div className="mt-4" style={{ display: loadingTenant ? "none" : undefined }}>
          <button
            type="button"
            onClick={() => setShowCreds((v) => !v)}
            suppressHydrationWarning
            className={clsx(
              "w-full flex items-center justify-center gap-2",
              "py-2 rounded-lg text-[11px] font-medium",
              "border transition-all duration-150 bg-transparent",
              isDark
                ? "border-[#3d362c] text-[#9c8e80] hover:text-[#d5bfb2] hover:border-[#4a4238]"
                : "border-[#e8e4dd] text-[#7a736a] hover:text-[#302d29]",
            )}
          >
            <ChevronDown
              className={clsx("w-3.5 h-3.5 transition-transform", showCreds && "rotate-180")}
              strokeWidth={2}
            />
            {showCreds ? "Hide" : "Show"} dev credentials
          </button>

          {showCreds && (
            <div
              className={clsx(
                "mt-2 rounded-xl overflow-hidden border",
                isDark ? "border-[#3d362c] bg-[#242019]" : "border-[#e8e4dd] bg-white",
              )}
            >
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className={isDark ? "border-b border-[#3d362c]" : "border-b border-[#e8e4dd]"}>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Role</th>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Email</th>
                    <th className="px-2.5 py-2 text-left text-[#a39e96] font-semibold">Password</th>
                  </tr>
                </thead>
                <tbody>
                  {CRED_ROWS.map((group) => (
                    <Fragment key={group.org}>
                      <tr><td colSpan={3} className={clsx("px-2.5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider", isDark ? "text-[#c9a84c]" : "text-[#8b6914]")}>{group.org}</td></tr>
                      {group.rows.map(([role, email, pass, colour], i) => (
                        <tr key={i} onClick={() => { setValue("email", email); setValue("password", pass); setShowCreds(false); }}
                          className={clsx("cursor-pointer transition-colors", isDark ? "hover:bg-[#2e2820]" : "hover:bg-[#faf9f7]", i < group.rows.length - 1 && (isDark ? "border-b border-[#3d362c]" : "border-b border-[#f5f3ef]"))}>
                          <td className="px-2.5 py-2"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: colour + "1a", color: colour }}>{role}</span></td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#9c8e80]" : "text-[#7a736a]")}>{email}</td>
                          <td className={clsx("px-2.5 py-2 font-mono", isDark ? "text-[#9c8e80]" : "text-[#7a736a]")}>{pass}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              <div className={clsx(
                "px-2.5 py-1.5 text-[10px] text-[#a39e96]",
                isDark ? "border-t border-[#3d362c]" : "border-t border-[#f5f3ef]",
              )}>
                Click any row to auto-fill
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
