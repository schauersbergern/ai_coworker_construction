"use client";
import { useActionState } from "react";
import { createAssessmentAction, type CreateAssessmentState } from "./action";

const initial: CreateAssessmentState = {};

export function NewAssessmentForm() {
  const [state, action, pending] = useActionState(createAssessmentAction, initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="address"
          required
          placeholder="z.B. Kiefernstr. 25, München"
          className="flex-1 rounded-lg border px-3 py-2"
        />
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Analysiere…" : "Analysieren"}
        </button>
      </div>
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
    </form>
  );
}
