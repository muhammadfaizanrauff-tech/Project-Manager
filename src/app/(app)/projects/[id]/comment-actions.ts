"use server";

import { listComments as listCommentsQuery } from "@/lib/tasks";

export async function listComments(taskId: string) {
  return listCommentsQuery(taskId);
}
