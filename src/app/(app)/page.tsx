import Link from "next/link";
import { requireSession } from "@/server/auth/require-session";

type Employee = {
  id: string;
  name: string;
  role: string;
  blurb: string;
  emoji: string;
  href?: string;
  status: "aktiv" | "bald";
};

const EMPLOYEES: Employee[] = [
  {
    id: "franz",
    name: "Franz",
    role: "Baudokumentation",
    blurb:
      "Erfasst Mängel & Fortschritt per Sprachnotiz und Foto — und erstellt daraus auf Knopfdruck den fertigen PDF-Bericht.",
    emoji: "👷",
    href: "/projects",
    status: "aktiv",
  },
  {
    id: "mira",
    name: "Mira",
    role: "Angebote & Leistungen",
    blurb: "Erstellt Angebote und Leistungsbeschreibungen aus deinen Vorgaben.",
    emoji: "📐",
    status: "bald",
  },
  {
    id: "theo",
    name: "Theo",
    role: "Bauzeit & Termine",
    blurb: "Plant Bauzeiten, behält Fristen und Wiedervorlagen im Blick.",
    emoji: "📅",
    status: "bald",
  },
];

export default async function EmployeesPage() {
  await requireSession();

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <p className="label-eyebrow">Dein Team</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold mt-1">KI-Mitarbeiter</h1>
        <p className="text-muted mt-2 max-w-xl">
          Wähle einen Mitarbeiter, um loszulegen. Weitere kommen Schritt für Schritt dazu.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {EMPLOYEES.map((e) => (
          <EmployeeCard key={e.id} employee={e} />
        ))}
      </div>
    </div>
  );
}

function EmployeeCard({ employee }: { employee: Employee }) {
  const active = employee.status === "aktiv";

  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div
          className={`grid place-items-center w-14 h-14 rounded-2xl text-2xl ${
            active ? "bg-cobalt/10" : "bg-black/[0.04]"
          }`}
        >
          <span className={active ? "" : "grayscale opacity-60"}>{employee.emoji}</span>
        </div>
        {active ? (
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
            aktiv
          </span>
        ) : (
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-muted bg-black/[0.04] rounded-full px-2.5 py-1">
            bald verfügbar
          </span>
        )}
      </div>

      <div className="mt-4">
        <h2 className="text-xl font-bold">{employee.name}</h2>
        <p className="label-eyebrow mt-0.5 !text-muted">{employee.role}</p>
        <p className="text-sm text-muted mt-2 leading-relaxed">{employee.blurb}</p>
      </div>

      <div className="mt-5">
        {active ? (
          <span className="btn btn-primary w-full">Öffnen →</span>
        ) : (
          <span className="btn btn-outline w-full !cursor-default">In Vorbereitung</span>
        )}
      </div>
    </>
  );

  const base = "card p-5 flex flex-col transition-transform";
  if (active && employee.href) {
    return (
      <Link href={employee.href} className={`${base} hover:-translate-y-0.5 hover:shadow-md`}>
        {inner}
      </Link>
    );
  }
  return <div className={`${base} opacity-80`}>{inner}</div>;
}
