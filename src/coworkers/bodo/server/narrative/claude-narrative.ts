import Anthropic from "@anthropic-ai/sdk";
import type { NarrativeGenerator } from "./narrative";

export class ClaudeNarrativeGenerator implements NarrativeGenerator {
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

  async generate({
    systemPrompt,
    userContent,
  }: {
    systemPrompt: string;
    userContent: string;
  }): Promise<string> {
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Standortdaten (JSON):\n\n${userContent}`,
        },
      ],
    });

    return msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }
}
