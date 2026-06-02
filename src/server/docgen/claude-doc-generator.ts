import Anthropic from "@anthropic-ai/sdk";
import { reportContentSchema, type ReportContent } from "@/server/reports/report-content";
import type { DocGenerator, DocGenInput } from "./doc-generator";

/**
 * LLM-gestützte Implementierung mit strukturiertem Output (Tool-Use).
 *
 * Anforderungen:
 * - 1 Finding pro Notiz (noteId bleibt erhalten)
 * - Kein Erfinden von Fakten – nur Reformulierung des Transkripts
 * - Deutschsprachige Ausgabe
 * - Prompt-Caching auf dem System-Block
 */
export class ClaudeDocGenerator implements DocGenerator {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Please configure it in your environment."
      );
    }
    const model = process.env.ANTHROPIC_MODEL;
    if (!model) {
      throw new Error(
        "ANTHROPIC_MODEL is not set. Please configure it in your environment."
      );
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async generate(input: DocGenInput): Promise<ReportContent> {
    // Build the notes list for the user prompt
    const notesList = input.notes
      .map((n, i) => `[${i + 1}] noteId="${n.id}"\n${n.transcript}`)
      .join("\n\n");

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      // Static system block – marked for prompt caching so it is reused across calls.
      // Render order: tools → system → messages; caching the system block also covers
      // the tool definition above it.
      system: [
        {
          type: "text",
          text: [
            "Du bist ein Baudokumentation-Assistent.",
            "",
            "Deine Aufgabe: Erstelle aus einem Satz von Baustellennotizen eine strukturierte",
            "Begehungsdokumentation.",
            "",
            "Regeln:",
            "1. Erzeuge GENAU EINE Feststellung (finding) pro Notiz – nicht mehr, nicht weniger.",
            "2. Übernehme die noteId der jeweiligen Notiz unverändert.",
            "3. Formuliere den Sachverhalt klar und sachlich auf Deutsch um.",
            "4. Erfinde KEINE Fakten, Orte oder Details, die nicht im Transkript stehen.",
            "   Bei knappen Transkripten erstelle eine knappe, sachliche Feststellung.",
            "5. Wähle einen prägnanten deutschen Titel für jede Feststellung.",
            "6. Das Feld `location` ist optional – fülle es nur aus, wenn im Transkript",
            "   ein konkreter Ort genannt wird.",
          ].join("\n"),
          // Mark this stable block for caching – reused across multiple generate() calls.
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        {
          name: "emit_report",
          description:
            "Gibt den strukturierten Bericht mit Einleitung und Feststellungen aus.",
          input_schema: {
            type: "object" as const,
            properties: {
              intro: {
                type: "string",
                description:
                  "Kurze Einleitung zur Begehungsdokumentation (optional).",
              },
              findings: {
                type: "array",
                description:
                  "Exakt eine Feststellung pro Notiz, in derselben Reihenfolge wie die Eingabe.",
                items: {
                  type: "object",
                  properties: {
                    noteId: {
                      type: "string",
                      description: "Die unveränderliche ID der Quellennotiz.",
                    },
                    title: {
                      type: "string",
                      description: "Prägnanter Titel der Feststellung.",
                    },
                    location: {
                      type: "string",
                      description:
                        "Konkreter Ort der Feststellung (nur wenn im Transkript angegeben).",
                    },
                    text: {
                      type: "string",
                      description:
                        "Sachliche Beschreibung des Mangels oder Befunds.",
                    },
                  },
                  required: ["noteId", "title", "text"],
                  additionalProperties: false,
                },
              },
            },
            required: ["findings"],
            additionalProperties: false,
          },
        },
      ],
      // Force Claude to always call emit_report – guarantees structured output.
      tool_choice: { type: "tool", name: "emit_report" },
      messages: [
        {
          role: "user",
          content: `Projekt: ${input.projectName}\n\nNotizen:\n\n${notesList}`,
        },
      ],
    });

    // Extract the tool-use block and parse its input as ReportContent.
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock) {
      throw new Error(
        `ClaudeDocGenerator: expected a tool_use block from emit_report, got stop_reason="${response.stop_reason}"`
      );
    }

    // Laufzeit-Validierung: eine fehlerhafte/unerwartete Struktur wirft hier (→ Report
    // failed + Retry) statt still ein kaputtes PDF zu erzeugen.
    const parsed = reportContentSchema.safeParse(toolUseBlock.input);
    if (!parsed.success) {
      throw new Error(`ClaudeDocGenerator: ungültige Tool-Ausgabe: ${parsed.error.message}`);
    }
    return parsed.data as ReportContent;
  }
}
