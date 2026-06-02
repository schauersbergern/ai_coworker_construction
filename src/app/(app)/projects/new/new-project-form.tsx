"use client";

import { useActionState } from "react";
import { createProjectAction, type CreateProjectState } from "./action";

const initial: CreateProjectState = {};

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3 max-w-md">
      <input name="name" placeholder="Projektname" className="field" required />
      <div className="grid grid-cols-2 gap-3">
        <input name="address" placeholder="Adresse (optional)" className="field" />
        <input name="projectNo" placeholder="Projekt-Nr. (optional)" className="field" />
      </div>
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending ? "Speichern…" : "Projekt anlegen"}
      </button>
    </form>
  );
}
