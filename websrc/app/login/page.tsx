import { signIn } from "@/lib/auth";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest text-slate-500">SuperOffice</p>
          <h1 className="text-2xl font-semibold text-slate-900">Provisioning Portal</h1>
          <p className="text-sm text-slate-500">
            Sign in with your SuperOffice account to manage environments, templates, and
            provisioning jobs.
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("superoffice", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#1a4a82] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#153d6e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1a4a82]"
          >
            <SuperOfficeLogo />
            Sign in with SuperOffice
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Your session is scoped to your SuperOffice tenant. Credentials are never stored in this
          application.
        </p>
      </div>
    </div>
  );
}

function SuperOfficeLogo() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      width="20"
      height="20"
      fill="none"
      aria-hidden="true"
    >
      {/* SuperOffice "S" mark — simplified geometric approximation */}
      <rect width="32" height="32" rx="6" fill="white" fillOpacity="0.15" />
      <text
        x="16"
        y="22"
        textAnchor="middle"
        fontSize="18"
        fontWeight="bold"
        fontFamily="Arial, sans-serif"
        fill="white"
      >
        SO
      </text>
    </svg>
  );
}
