export default function NoOrgPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <h1 className="text-xl font-semibold text-cobalt">Kein Zugang</h1>
        <p className="text-gray-600 mt-2">
          Dein Konto ist noch keiner Organisation zugeordnet. Bitte wende dich an dein Team.
        </p>
      </div>
    </main>
  );
}
