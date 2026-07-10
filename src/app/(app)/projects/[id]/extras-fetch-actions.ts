"use server";

import { getTaskExtras as getTaskExtrasQuery, listProjectLabels as listProjectLabelsQuery } from "@/lib/task-extras";

export async function getTaskExtras(taskId: string) {
  return getTaskExtrasQuery(taskId);
}

export async function listProjectLabels(projectId: string) {
  return listProjectLabelsQuery(projectId);
}
