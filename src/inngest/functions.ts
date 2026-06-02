import type { InngestFunction } from "inngest";
import { inngest } from "./client";
import { runTranscribeNote } from "@/server/notes/transcribe-note";
import { storage } from "@/server/storage";
import { LocalWhisperTranscriber } from "@/server/transcription/local-whisper";

export const transcribeNote = inngest.createFunction(
  { id: "transcribe-note", retries: 2, triggers: [{ event: "note/created" }] },
  async ({ event }: { event: { data: { noteId: string } } }) => {
    const { noteId } = event.data;
    await runTranscribeNote(noteId, {
      storage,
      transcriber: new LocalWhisperTranscriber(),
    });
    return { noteId };
  },
);

export const functions: InngestFunction.Any[] = [transcribeNote];
