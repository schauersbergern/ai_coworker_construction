import type { LocationProfile } from "../pipeline/profile";
import type { DataPoint } from "../sources/types";
import type { ScoringWeights } from "../../config";

export type Ampel = "gruen" | "gelb" | "rot" | "unbekannt";
export interface Zielgruppe { id: string; label: string; score: number; }
export interface Scores {
  ampel: Ampel;
  vermarktungsScore: number; // 0-100
  teilscores: Record<string, number>;
  zielgruppen: Zielgruppe[];
  primaereZielgruppe: string;
  investitionsSignal: { score: number; label: string; risiken: string[] };
  /** Wie viele der bewertungsrelevanten Quellen lieferten Daten (Transparenz gegen Schein-Scores). */
  dataCoverage: { available: number; total: number };
  /** false, wenn die Kern-Inputs (POIs + ÖPNV) BEIDE fehlen — dann ist der Score nicht belastbar. */
  dataSufficient: boolean;
}

type PoisValue = Record<string, { count: number; nearestM: number | null } | undefined>;
type TransitValue = { nearest: { distanceM: number } };
type FloodValue = { hqHaeufig: boolean; hq100: boolean; hqExtrem: boolean };
type GeolValue = { grundwasserHoch: boolean };
type NaturValue = { nsg: boolean; lsg: boolean; ffh: boolean; vogel: boolean; biotop: boolean };
type DenkmalValue = { einzeldenkmal: boolean; ensemble: boolean; bodendenkmal: boolean };

function val<T>(dp: DataPoint<unknown> | undefined): T | null {
  return dp && dp.status === "ok" ? (dp.value as T) : null;
}
function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }
function distScore(m: number | null, good: number, bad: number): number {
  if (m == null) return 0.5;
  if (m <= good) return 1;
  if (m >= bad) return 0;
  return clamp01(1 - (m - good) / (bad - good));
}

export function computeScores(p: LocationProfile, cfg: { weights: ScoringWeights }): Scores {
  const pois = val<PoisValue>(p.fields.pois);
  const transit = val<TransitValue>(p.fields.transit);

  const teil: Record<string, number> = {
    nahversorgung: pois ? distScore(pois.supermarket?.nearestM ?? null, 300, 1500) : 0.5,
    oepnv: transit ? distScore(transit.nearest?.distanceM ?? null, 300, 1000) : 0.5,
    schulen: pois ? clamp01((pois.school?.count ?? 0) / 5) : 0.5,
    gruen: pois ? clamp01((pois.park?.count ?? 0) / 3) : 0.5,
    walkability: pois ? clamp01(((pois.supermarket?.count ?? 0) + (pois.restaurant?.count ?? 0) + (pois.pharmacy?.count ?? 0)) / 10) : 0.5,
    kaufkraft: 0.5,
    gastroKultur: pois ? clamp01((pois.restaurant?.count ?? 0) / 5) : 0.5,
  };

  const totalW = Object.values(cfg.weights).reduce((a, b) => a + b, 0) || 1;
  const weighted = Object.entries(teil).reduce((sum, [k, v]) => sum + v * (cfg.weights[k as keyof ScoringWeights] ?? 0), 0) / totalW;
  const vermarktungsScore = Math.max(0, Math.min(100, Math.round(weighted * 100)));

  const flood = val<FloodValue>(p.fields.hochwasser);
  const geol = val<GeolValue>(p.fields.geologie);
  const natur = val<NaturValue>(p.fields.natur);
  const denkmal = val<DenkmalValue>(p.fields.denkmal);

  const risiken: { label: string; severity: number }[] = [];
  if (flood?.hq100 || flood?.hqHaeufig) risiken.push({ label: "Hochwassergefahr (HQ100/häufig)", severity: 3 });
  else if (flood?.hqExtrem) risiken.push({ label: "Hochwasser bei Extremereignis (HQextrem)", severity: 1 });
  if (geol?.grundwasserHoch) risiken.push({ label: "Hohe Grundwasserstände", severity: 1 });
  if (natur?.nsg || natur?.ffh || natur?.vogel) risiken.push({ label: "Strenger Naturschutz (NSG/FFH/Vogelschutz)", severity: 3 });
  else if (natur?.lsg || natur?.biotop) risiken.push({ label: "Landschaftsschutz/Biotop", severity: 1 });
  if (denkmal?.einzeldenkmal || denkmal?.ensemble) risiken.push({ label: "Denkmalschutz (Einzel/Ensemble)", severity: 2 });
  else if (denkmal?.bodendenkmal) risiken.push({ label: "Bodendenkmal", severity: 1 });

  const riskPenalty = risiken.reduce((s, r) => s + r.severity, 0);
  const hardRisk = risiken.some((r) => r.severity >= 3);

  // Datenabdeckung: ohne belastbare Kern-Inputs (POIs/ÖPNV) ist die gewichtete 0.5-Neutralität
  // ein Schein-Score. Dann explizit als "unbekannt" ausweisen statt scheinbar belastbares Gelb.
  const coverageFields = [pois, transit, flood, geol, natur, denkmal];
  const dataCoverage = { available: coverageFields.filter((v) => v !== null).length, total: coverageFields.length };
  const dataSufficient = pois !== null || transit !== null;

  // Risiko-Abdeckung: fehlende Risikodaten ≠ Risikofreiheit. Ein "Grün"/positives Signal darf
  // nur entstehen, wenn die HARTEN Risikoquellen (Hochwasser + Naturschutz, Severity 3) bekannt
  // sind — sonst würde ein Standort mit starker Infrastruktur trotz ungeprüfter Risiken grün.
  const riskFields = [flood, geol, natur, denkmal];
  const riskComplete = riskFields.every((v) => v !== null);
  const hardRiskKnown = flood !== null && natur !== null;
  if (dataSufficient && !riskComplete) {
    risiken.push({ label: "Risikolage unvollständig geprüft (Quellen nicht verfügbar)", severity: 0 });
  }

  let ampel: Ampel;
  if (!dataSufficient) {
    ampel = "unbekannt";
  } else if (hardRisk) {
    ampel = "rot";
  } else {
    ampel = vermarktungsScore >= 66 ? "gruen" : vermarktungsScore >= 40 ? "gelb" : "rot";
    if (riskPenalty >= 2 && ampel === "gruen") ampel = "gelb";
    if (!hardRiskKnown && ampel === "gruen") ampel = "gelb"; // ohne harte Risikodaten kein Grün
  }

  const signalScore = Math.max(0, Math.min(100, vermarktungsScore - riskPenalty * 8));
  let signalLabel: string;
  if (!dataSufficient) signalLabel = "Unzureichende Datenlage";
  else if (hardRisk) signalLabel = "Erhöhtes Risiko";
  else if (!hardRiskKnown) signalLabel = "Risiken ungeprüft"; // kein positives Signal ohne Risikodaten
  else signalLabel = signalScore >= 66 ? "Positives Signal" : signalScore >= 40 ? "Neutral" : "Entwicklungslage";
  const investitionsSignal = {
    score: signalScore,
    label: signalLabel,
    risiken: risiken.map((r) => r.label),
  };

  const zielgruppen: Zielgruppe[] = [
    { id: "familien", label: "Familien", score: Math.round((teil.schulen * 0.5 + teil.gruen * 0.3 + teil.nahversorgung * 0.2) * 100) },
    { id: "young_professionals", label: "Young Professionals", score: Math.round((teil.oepnv * 0.5 + teil.gastroKultur * 0.5) * 100) },
    { id: "studenten", label: "Studenten", score: Math.round((teil.oepnv * 0.6 + teil.nahversorgung * 0.4) * 100) },
    { id: "kapitalanleger", label: "Kapitalanleger", score: Math.round((teil.kaufkraft * 0.6 + teil.nahversorgung * 0.4) * 100) },
    { id: "senioren", label: "Senioren", score: Math.round((teil.nahversorgung * 0.5 + teil.oepnv * 0.5) * 100) },
  ].sort((a, b) => b.score - a.score);

  return {
    ampel,
    vermarktungsScore,
    teilscores: Object.fromEntries(Object.entries(teil).map(([k, v]) => [k, Math.round(v * 100)])),
    zielgruppen,
    primaereZielgruppe: zielgruppen[0].label,
    investitionsSignal,
    dataCoverage,
    dataSufficient,
  };
}
