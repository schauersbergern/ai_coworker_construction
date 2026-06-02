import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";
import { signOut } from "@/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-grid place-items-center w-8 h-8 rounded-lg bg-cobalt text-white font-display font-extrabold">
              b
            </span>
            <span className="font-display font-extrabold text-lg leading-none">
              Baudoku
              <span className="text-cobalt">.</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted hidden sm:inline">{session.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="btn btn-outline">
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
