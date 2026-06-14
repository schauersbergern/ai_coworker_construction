import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { Scores } from "../scoring/score";
import type { LocationProfile } from "../pipeline/profile";

export type DossierProps = {
  address: string;
  scores: Scores;
  narrative: string | null;
  profile: LocationProfile;
};

const COBALT = "#1b3bdb";
const GRUEN = "#16a34a";
const GELB = "#ca8a04";
const ROT = "#dc2626";
const GRAU = "#6b7280";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#2a2b2d" },
  headerBar: { borderLeftWidth: 6, borderLeftColor: COBALT, paddingLeft: 12, marginBottom: 20 },
  kicker: { fontSize: 10, letterSpacing: 2, color: "#555", fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 20, marginTop: 6, fontFamily: "Helvetica-Bold" },
  meta: { fontSize: 10, color: "#555", marginTop: 4 },
  ampelGruen: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRUEN, marginTop: 6 },
  ampelGelb: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GELB, marginTop: 6 },
  ampelRot: { fontSize: 13, fontFamily: "Helvetica-Bold", color: ROT, marginTop: 6 },
  ampelUnbekannt: { fontSize: 13, fontFamily: "Helvetica-Bold", color: GRAU, marginTop: 6 },
  sectionTitle: { fontSize: 13, color: COBALT, fontFamily: "Helvetica-Bold", marginTop: 20, marginBottom: 6 },
  row: { flexDirection: "row", marginBottom: 3 },
  label: { width: 160, color: "#555" },
  value: { flex: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  highlight: { fontFamily: "Helvetica-Bold", color: COBALT },
  bodyText: { lineHeight: 1.5, marginTop: 4 },
  hint: { color: "#888", fontStyle: "italic", marginTop: 4 },
  risikenItem: { color: ROT, marginBottom: 2 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e8eaf6",
    padding: 4,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  tableRow: { flexDirection: "row", padding: 4, borderBottomWidth: 1, borderBottomColor: "#e5e7eb", fontSize: 9 },
  colKey: { width: 90 },
  colValue: { flex: 1 },
  colSource: { width: 80 },
  colLicense: { width: 70 },
});

function ampelLabel(ampel: Scores["ampel"]): string {
  if (ampel === "gruen") return "Grün – Gute Vermarktbarkeit";
  if (ampel === "gelb") return "Gelb – Eingeschränkte Vermarktbarkeit";
  if (ampel === "unbekannt") return "Unbekannt – Unzureichende Datenlage";
  return "Rot – Schwierige Vermarktbarkeit";
}

function ampelStyle(ampel: Scores["ampel"]) {
  if (ampel === "gruen") return styles.ampelGruen;
  if (ampel === "gelb") return styles.ampelGelb;
  if (ampel === "unbekannt") return styles.ampelUnbekannt;
  return styles.ampelRot;
}

function formatFieldValue(dp: { value: unknown; status: string; reason?: string }): string {
  if (dp.status === "ok" && dp.value !== null && dp.value !== undefined) {
    return JSON.stringify(dp.value);
  }
  const detail = dp.reason ? `${dp.status}: ${dp.reason}` : dp.status;
  return `Nicht ermittelbar (${detail})`;
}

export function DossierDocument({ address, scores, narrative, profile }: DossierProps) {
  const fieldEntries = Object.entries(profile.fields);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* 1. Header */}
        <View style={styles.headerBar}>
          <Text style={styles.kicker}>LAGEBEWERTUNG · BODO</Text>
          <Text style={styles.h1}>{address}</Text>
          <Text style={styles.meta}>
            {`Koordinaten: ${profile.coordinate.lat.toFixed(6)}, ${profile.coordinate.lon.toFixed(6)}`}
          </Text>
          <Text style={ampelStyle(scores.ampel)}>{ampelLabel(scores.ampel)}</Text>
          <View style={[styles.row, { marginTop: 6 }]}>
            <Text style={styles.label}>Vermarktungs-Score:</Text>
            <Text style={[styles.value, styles.bold]}>{scores.vermarktungsScore} / 100</Text>
          </View>
        </View>

        {/* 2. Teilscores */}
        <Text style={styles.sectionTitle}>Teilscores</Text>
        {Object.entries(scores.teilscores).map(([key, val]) => (
          <View key={key} style={styles.row}>
            <Text style={styles.label}>{key}</Text>
            <Text style={styles.value}>{val}</Text>
          </View>
        ))}

        {/* 3. Zielgruppen */}
        <Text style={styles.sectionTitle}>Zielgruppen</Text>
        {scores.zielgruppen.map((z) => (
          <View key={z.id} style={styles.row}>
            <Text style={z.label === scores.primaereZielgruppe ? [styles.label, styles.highlight] : styles.label}>
              {z.label === scores.primaereZielgruppe ? `${z.label} ★` : z.label}
            </Text>
            <Text style={z.label === scores.primaereZielgruppe ? [styles.value, styles.highlight] : styles.value}>
              {z.score}
            </Text>
          </View>
        ))}
        <View style={[styles.row, { marginTop: 4 }]}>
          <Text style={styles.label}>Primäre Zielgruppe:</Text>
          <Text style={[styles.value, styles.bold]}>{scores.primaereZielgruppe}</Text>
        </View>

        {/* 4. Investitions-Signal */}
        <Text style={styles.sectionTitle}>Investitions-Signal</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Bewertung:</Text>
          <Text style={[styles.value, styles.bold]}>{scores.investitionsSignal.label}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Score:</Text>
          <Text style={styles.value}>{scores.investitionsSignal.score} / 100</Text>
        </View>
        {scores.investitionsSignal.risiken.length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={[styles.bold, { marginBottom: 3 }]}>Risiken:</Text>
            {scores.investitionsSignal.risiken.map((r, i) => (
              <Text key={i} style={styles.risikenItem}>{`• ${r}`}</Text>
            ))}
          </View>
        )}

        {/* 5. Mikrolage-Text */}
        <Text style={styles.sectionTitle}>Mikrolage</Text>
        {narrative ? (
          <Text style={styles.bodyText}>{narrative}</Text>
        ) : (
          <Text style={styles.hint}>Kein Mikrolage-Text verfügbar.</Text>
        )}

        {/* 6. Datenpunkte */}
        <Text style={styles.sectionTitle}>Datenpunkte</Text>
        <View style={styles.tableHeader}>
          <Text style={styles.colKey}>Feld</Text>
          <Text style={styles.colValue}>Wert / Verfügbarkeit</Text>
          <Text style={styles.colSource}>Quelle</Text>
          <Text style={styles.colLicense}>Lizenz</Text>
        </View>
        {fieldEntries.map(([key, dp]) => (
          <View key={key} style={styles.tableRow} wrap={false}>
            <Text style={styles.colKey}>{key}</Text>
            <Text style={styles.colValue}>{formatFieldValue(dp)}</Text>
            <Text style={styles.colSource}>{dp.source}</Text>
            <Text style={styles.colLicense}>{dp.license}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}
