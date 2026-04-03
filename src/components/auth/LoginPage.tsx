import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router";
import {
  Shield,
  Eye,
  EyeOff,
  ChevronDown,
} from "lucide-react";
import clsx from "clsx";
import { useAppDispatch } from "@/hooks/useAppDispatch";
import { setCredentials } from "@/store/auth.slice";
import { updateOrg, addSite } from "@/store/settings.slice";
import { store } from "@/store";
import type { AuthUser } from "@/store/auth.slice";

const schema = z.object({
  email: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Passcode is required"),
});
type FormValues = z.infer<typeof schema>;

const MOCK_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  "admin@pharmaglimmora.com": {
    password: "Admin@123",
    user: { id: "u-001", name: "System Administrator", email: "admin@pharmaglimmora.com", role: "super_admin", gxpSignatory: true, orgId: "org-1" },
  },
  "qa@pharmaglimmora.com": {
    password: "QaHead@123",
    user: { id: "u-002", name: "Dr. Priya Sharma", email: "qa@pharmaglimmora.com", role: "qa_head", gxpSignatory: true, orgId: "org-1" },
  },
  "ra@pharmaglimmora.com": {
    password: "RegAff@123",
    user: { id: "u-003", name: "Rahul Mehta", email: "ra@pharmaglimmora.com", role: "regulatory_affairs", gxpSignatory: true, orgId: "org-1" },
  },
  "csv@pharmaglimmora.com": {
    password: "CsvVal@123",
    user: { id: "u-004", name: "Anita Patel", email: "csv@pharmaglimmora.com", role: "csv_val_lead", gxpSignatory: true, orgId: "org-1" },
  },
  "qc@pharmaglimmora.com": {
    password: "QcLab@123",
    user: { id: "u-005", name: "Dr. Nisha Rao", email: "qc@pharmaglimmora.com", role: "qc_lab_director", gxpSignatory: true, orgId: "org-1" },
  },
  "it@pharmaglimmora.com": {
    password: "ItCdo@123",
    user: { id: "u-006", name: "Vikram Singh", email: "it@pharmaglimmora.com", role: "it_cdo", gxpSignatory: false, orgId: "org-1" },
  },
  "ops@pharmaglimmora.com": {
    password: "OpsHead@123",
    user: { id: "u-007", name: "Suresh Kumar", email: "ops@pharmaglimmora.com", role: "operations_head", gxpSignatory: false, orgId: "org-1" },
  },
  "viewer@pharmaglimmora.com": {
    password: "Viewer@123",
    user: { id: "u-008", name: "View Only User", email: "viewer@pharmaglimmora.com", role: "viewer", gxpSignatory: false, orgId: "org-1" },
  },
};

const CRED_ROWS: [string, string, string, string][] = [
  ["Super Admin", "admin@pharmaglimmora.com", "Admin@123", "#c0392b"],
  ["QA Head", "qa@pharmaglimmora.com", "QaHead@123", "#7b68a5"],
  ["Regulatory Affairs", "ra@pharmaglimmora.com", "RegAff@123", "#a57865"],
  ["CSV/Val Lead", "csv@pharmaglimmora.com", "CsvVal@123", "#4a8fa8"],
  ["QC/Lab Director", "qc@pharmaglimmora.com", "QcLab@123", "#4a5e3a"],
  ["IT/CDO", "it@pharmaglimmora.com", "ItCdo@123", "#6e4c3e"],
  ["Operations Head", "ops@pharmaglimmora.com", "OpsHead@123", "#c9a84c"],
  ["Viewer", "viewer@pharmaglimmora.com", "Viewer@123", "#8e7065"],
];

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [showCreds, setShowCreds] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormValues) => {
    const account = MOCK_ACCOUNTS[data.email.toLowerCase().trim()];

    if (!account || account.password !== data.password) {
      setError("root", { message: "Invalid username or passcode" });
      return;
    }

    dispatch(setCredentials({ token: "mock-token-" + Date.now(), user: account.user }));

    dispatch(updateOrg({
      companyName: "Novagen Pharma Ltd.",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
      regulatoryRegion: "India — CDSCO + WHO GMP",
    }));

    if (store.getState().settings.sites.length === 0) {
      dispatch(addSite({ id: "site-1", name: "Mumbai API Manufacturing", location: "Mumbai, MH", gmpScope: "API / Bulk Drug", risk: "HIGH", status: "Active" }));
      dispatch(addSite({ id: "site-2", name: "Pune Formulation Plant", location: "Pune, MH", gmpScope: "Solid Dosage", risk: "MEDIUM", status: "Active" }));
      dispatch(addSite({ id: "site-3", name: "Hyderabad QC Lab", location: "Hyderabad, TS", gmpScope: "Testing & Release", risk: "MEDIUM", status: "Active" }));
      dispatch(addSite({ id: "site-4", name: "Chennai Packaging", location: "Chennai, TN", gmpScope: "Secondary Packaging", risk: "LOW", status: "Active" }));
    }

    navigate("/site-picker");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "#ffffff" }}
    >
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="mb-8">
          <div
            style={{
              width: 56,
              height: 56,
              background: "#f0a500",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}
          >
            <Shield className="w-7 h-7 text-white" aria-hidden="true" />
          </div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#302d29",
              marginBottom: 6,
            }}
          >
            Welcome Back !
          </h1>
          <p style={{ fontSize: 14, color: "#7a736a" }}>
            Log into your account
          </p>
        </div>

        {/* SSO Options */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button
            type="button"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "16px 12px",
              border: "1px solid #e8e4dd",
              borderRadius: 10,
              background: "#ffffff",
              cursor: "pointer",
              transition: "all 0.15s",
              fontSize: 12,
              color: "#302d29",
              fontWeight: 500,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
          <button
            type="button"
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: "16px 12px",
              border: "1px solid #e8e4dd",
              borderRadius: 10,
              background: "#ffffff",
              cursor: "pointer",
              transition: "all 0.15s",
              fontSize: 12,
              color: "#302d29",
              fontWeight: 500,
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
              <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
              <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
              <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
            </svg>
            Sign in with Microsoft
          </button>
        </div>

        {/* Divider */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "20px 0",
          }}
        >
          <div style={{ flex: 1, height: 1, background: "#e8e4dd" }} />
          <span style={{ fontSize: 13, color: "#a39e96", whiteSpace: "nowrap" }}>
            Or continue with
          </span>
          <div style={{ flex: 1, height: 1, background: "#e8e4dd" }} />
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          aria-label="Sign in to Pharma Glimmora"
          noValidate
        >
          {/* Root error */}
          {errors.root && (
            <div
              role="alert"
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {errors.root.message}
            </div>
          )}

          {/* Username */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="email"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "#302d29",
                marginBottom: 6,
              }}
            >
              Username
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your username"
              aria-required="true"
              aria-invalid={errors.email ? true : undefined}
              {...register("email")}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${errors.email ? "#dc2626" : "#e8e4dd"}`,
                fontSize: 14,
                color: "#302d29",
                background: "#ffffff",
                outline: "none",
                transition: "border-color 0.15s",
              }}
              onFocus={(e) => { if (!errors.email) e.target.style.borderColor = "#8b6914"; }}
              onBlur={(e) => { if (!errors.email) e.target.style.borderColor = "#e8e4dd"; }}
            />
            {errors.email && (
              <p role="alert" style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Passcode */}
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "#302d29",
                marginBottom: 6,
              }}
            >
              Passcode
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your passcode"
                aria-required="true"
                aria-invalid={errors.password ? true : undefined}
                {...register("password")}
                style={{
                  width: "100%",
                  padding: "10px 42px 10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${errors.password ? "#dc2626" : "#e8e4dd"}`,
                  fontSize: 14,
                  color: "#302d29",
                  background: "#ffffff",
                  outline: "none",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => { if (!errors.password) e.target.style.borderColor = "#8b6914"; }}
                onBlur={(e) => { if (!errors.password) e.target.style.borderColor = "#e8e4dd"; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide passcode" : "Show passcode"}
                style={{
                  position: "absolute",
                  right: 12,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#a39e96",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
              </button>
            </div>
            {errors.password && (
              <p role="alert" style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember me + Forgot */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                color: "#302d29",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                style={{ accentColor: "#8b6914", width: 16, height: 16 }}
              />
              Remember me
            </label>
            <button
              type="button"
              style={{
                background: "none",
                border: "none",
                color: "#8b6914",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Forgot passcode?
            </button>
          </div>

          {/* Login button */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: "100%",
              padding: "11px 20px",
              borderRadius: 8,
              background: "#8b6914",
              color: "#ffffff",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1,
              transition: "all 0.15s",
            }}
          >
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
        </form>

        {/* Dev credentials toggle */}
        <div style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={() => setShowCreds((v) => !v)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 500,
              background: "none",
              border: "1px solid #e8e4dd",
              color: "#7a736a",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <ChevronDown
              className={clsx("w-3.5 h-3.5 transition-transform", showCreds && "rotate-180")}
              strokeWidth={2}
            />
            {showCreds ? "Hide" : "Show"} dev credentials
          </button>

          {showCreds && (
            <div
              style={{
                marginTop: 8,
                borderRadius: 10,
                overflow: "hidden",
                border: "1px solid #e8e4dd",
                background: "#ffffff",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e8e4dd" }}>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#a39e96", fontWeight: 600 }}>Role</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#a39e96", fontWeight: 600 }}>Email</th>
                    <th style={{ padding: "8px 10px", textAlign: "left", color: "#a39e96", fontWeight: 600 }}>Password</th>
                  </tr>
                </thead>
                <tbody>
                  {CRED_ROWS.map(([role, email, pass, colour], i) => (
                    <tr
                      key={i}
                      onClick={() => {
                        setValue("email", email);
                        setValue("password", pass);
                        setShowCreds(false);
                      }}
                      style={{
                        cursor: "pointer",
                        transition: "background 0.1s",
                        borderBottom: i < CRED_ROWS.length - 1 ? "1px solid #f5f3ef" : "none",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#faf9f7"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      <td style={{ padding: "6px 10px" }}>
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: 20,
                            background: colour + "1a",
                            color: colour,
                          }}
                        >
                          {role}
                        </span>
                      </td>
                      <td style={{ padding: "6px 10px", fontFamily: "IBM Plex Mono, monospace", color: "#7a736a" }}>
                        {email}
                      </td>
                      <td style={{ padding: "6px 10px", fontFamily: "IBM Plex Mono, monospace", color: "#7a736a" }}>
                        {pass}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div
                style={{
                  padding: "6px 10px",
                  fontSize: 10,
                  color: "#a39e96",
                  borderTop: "1px solid #f5f3ef",
                }}
              >
                Click any row to auto-fill
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
