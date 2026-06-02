import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/projects" });
        }}
        className="flex flex-col gap-3 w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold text-cobalt">Anmelden</h1>
        <button type="submit" className="bg-cobalt text-white rounded p-2">
          Mit Google anmelden
        </button>
        <p className="text-xs text-gray-500">
          Nur freigeschaltete Google-Konten erhalten Zugriff.
        </p>
      </form>
    </main>
  );
}
