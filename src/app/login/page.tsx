import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form
        action={async (formData: FormData) => {
          "use server";
          await signIn("nodemailer", {
            email: String(formData.get("email")),
            redirectTo: "/projects",
          });
        }}
        className="flex flex-col gap-3 w-full max-w-sm"
      >
        <h1 className="text-xl font-semibold text-cobalt">Anmelden</h1>
        <input name="email" type="email" placeholder="E-Mail" className="border rounded p-2" required />
        <button type="submit" className="bg-cobalt text-white rounded p-2">
          Magic-Link senden
        </button>
        <p className="text-xs text-gray-500">
          Nur freigeschaltete Adressen erhalten einen Link.
        </p>
      </form>
    </main>
  );
}
