import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 justify-center mb-6">
          <span className="inline-grid place-items-center w-9 h-9 rounded-lg bg-cobalt text-white font-display font-extrabold">
            b
          </span>
          <span className="font-display font-extrabold text-2xl">
            Baudoku<span className="text-cobalt">.</span>
          </span>
        </div>

        <div className="card p-7 text-center">
          <p className="label-eyebrow">Anmelden</p>
          <h1 className="text-2xl font-bold mt-1">Willkommen zurück</h1>
          <p className="text-sm text-muted mt-2">
            KI-Mitarbeiter für Architektur- und Planungsbüros.
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="mt-6"
          >
            <button type="submit" className="btn btn-primary w-full">
              <GoogleMark /> Mit Google anmelden
            </button>
          </form>

          <p className="text-xs text-muted mt-4">
            Nur freigeschaltete Google-Konten erhalten Zugriff.
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#fff"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        opacity="0.9"
      />
      <path
        fill="#fff"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#fff" d="M3.97 10.72A5.4 5.4 0 0 1 3.97 7.3V4.96H.96a9 9 0 0 0 0 8.09l3.01-2.33Z" />
      <path fill="#fff" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}
