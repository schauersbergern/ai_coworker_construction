import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";

export type RenderFinding = {
  index: number;
  title: string;
  location?: string;
  text: string;
  photos: string[]; // data-URIs
};
export type RenderInput = {
  projectName: string;
  address?: string;
  projectNo?: string;
  dateLabel: string;
  author?: string;
  intro?: string;
  findings: RenderFinding[];
  appendixPhotos: string[]; // data-URIs ohne Zuordnung
};

const COBALT = "#1b3bdb";
const ACCENT = "#f4b400";
const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#2a2b2d" },
  coverBar: { borderLeftWidth: 6, borderLeftColor: COBALT, paddingLeft: 12, marginBottom: 16 },
  kicker: { fontSize: 10, letterSpacing: 2, color: ACCENT, fontFamily: "Helvetica-Bold" },
  h1: { fontSize: 22, marginTop: 6, fontFamily: "Helvetica-Bold" },
  meta: { color: "#555", fontSize: 11, marginTop: 6 },
  hint: { color: "#888", fontSize: 9, marginTop: 12 },
  findingNo: { fontSize: 10, color: COBALT, fontFamily: "Helvetica-Bold", marginTop: 14 },
  findingTitle: { fontFamily: "Helvetica-Bold", marginTop: 2 },
  findingText: { marginTop: 4, lineHeight: 1.4 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  photo: { width: 150, height: 100, objectFit: "cover" },
  sectionTitle: { fontSize: 14, color: COBALT, fontFamily: "Helvetica-Bold", marginTop: 20 },
});

export function ReportDocument(props: RenderInput) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.coverBar}>
          <Text style={styles.kicker}>BAUDOKUMENTATION</Text>
          <Text style={styles.h1}>{props.projectName}</Text>
          <Text style={styles.meta}>
            {props.address ? `${props.address}\n` : ""}
            Begehung: {props.dateLabel}
            {props.author ? `\nErstellt von: ${props.author}` : ""}
            {props.projectNo ? `\nProjekt-Nr.: ${props.projectNo}` : ""}
          </Text>
          <Text style={styles.hint}>Automatisch erzeugt – bitte vor Versand prüfen.</Text>
        </View>
        {props.intro ? <Text style={styles.findingText}>{props.intro}</Text> : null}

        {props.findings.map((f) => (
          <View key={f.index} wrap={false}>
            <Text style={styles.findingNo}>{`FESTSTELLUNG ${String(f.index).padStart(2, "0")}`}</Text>
            <Text style={styles.findingTitle}>{f.location ? `${f.title} · ${f.location}` : f.title}</Text>
            <Text style={styles.findingText}>{f.text}</Text>
            {f.photos.length > 0 && (
              <View style={styles.photoRow}>
                {f.photos.map((src, i) => (
                  // react-pdf <Image> hat kein alt-Attribut wie HTML — Regel hier nicht anwendbar
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image key={i} src={src} style={styles.photo} />
                ))}
              </View>
            )}
          </View>
        ))}

        {props.appendixPhotos.length > 0 && (
          <View>
            <Text style={styles.sectionTitle}>Anhang: weitere Fotos</Text>
            <View style={styles.photoRow}>
              {props.appendixPhotos.map((src, i) => (
                // react-pdf <Image> hat kein alt-Attribut wie HTML — Regel hier nicht anwendbar
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image key={i} src={src} style={styles.photo} />
              ))}
            </View>
          </View>
        )}
      </Page>
    </Document>
  );
}
