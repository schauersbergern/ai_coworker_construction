"use client";

import { useActionState } from "react";
import { createProjectAction, type CreateProjectState } from "./action";

const initial: CreateProjectState = {};

export function NewProjectForm() {
  const [state, action, pending] = useActionState(createProjectAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3 max-w-md">
      <input name="name" placeholder="Projektname" className="border rounded p-2" required />
      <input name="address" placeholder="Adresse (optional)" className="border rounded p-2" />
      <input name="projectNo" placeholder="Projekt-Nr. (optional)" className="border rounded p-2" />
      {state.error && <p className="text-red-600 text-sm">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-cobalt text-white rounded p-2 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Projekt anlegen"}
      </button>
    </form>
  );
}
