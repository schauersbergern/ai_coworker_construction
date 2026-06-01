"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/require-session";
import { createProjectSchema } from "@/server/projects/projects.schema";
import { createProject } from "@/server/projects/projects.service";

export type CreateProjectState = { error?: string };

export async function createProjectAction(
  _prev: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const session = await requireSession();
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") || undefined,
    projectNo: formData.get("projectNo") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" };
  }
  const project = await createProject(session.orgId, parsed.data);
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
