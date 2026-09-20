import { api } from "@/api/client";

// Backs the "Tasks" row on the More tab — the same `/api/tasks` list the
// admin Tasks page uses (server/services/tasks.ts `listTasks`), asking for a
// single page since only the total count is needed here.
interface TaskListResponse {
  total: number;
}

export const adminTasksService = {
  async myPendingCount(): Promise<number> {
    const result = await api.get<TaskListResponse>("/api/tasks?view=my&status=PENDING&pageSize=1");
    return result.total;
  },
};
