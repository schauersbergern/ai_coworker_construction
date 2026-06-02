import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "baudoku" });

// Event-Typen (zentrale Definition)
export type NoteCreatedEvent = { name: "note/created"; data: { noteId: string } };
