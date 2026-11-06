import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const TASKS_PLUGIN = "tasks";
export const PROJECTS_PLUGIN = "projects";

export const tasksContract = defineRpcContract({
  listProjects: {
    tags: () => ["projects"],
    input: z.object({}).strict(),
    output: z
      .object({
        projects: z.array(
          z.object({ id: z.string(), name: z.string(), prefix: z.string(), linkedBbProjectId: z.string().nullable() }).passthrough(),
        ),
      })
      .passthrough(),
  },
});

const metaSchema = z.object({
  focus: z.string().nullable(),
  focusUpdatedAt: z.string().nullable(),
  leadThreadId: z.string().nullable(),
});

export const projectsContract = defineRpcContract({
  listLeads: {
    tags: () => ["leads"],
    input: z.object({}),
    output: z.object({ leads: z.array(z.object({ projectId: z.string(), threadId: z.string(), focus: z.string().nullable() })) }),
  },
  setLead: {
    input: z.object({ projectId: z.string().trim().min(1).max(100), threadId: z.string().startsWith("thr_").nullable() }),
    output: metaSchema,
  },
});
