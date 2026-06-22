import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, isToday } from "date-fns";
import {
  AlertTriangle,
  CalendarClock,
  CalendarIcon,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Send,
  Users as UsersIcon,
  X,
} from "lucide-react";
import { AdminLayout } from "@/components/admin-layout";
import { OperationsLayout } from "@/components/operations-layout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient, readJsonResponse } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Types (mirror server DTOs in server/services/tasks.ts)
// ---------------------------------------------------------------------------

type TaskStatus = "PENDING" | "COMPLETED";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type ViewKey = "all" | "my" | "assigned_by_me" | "completed" | "overdue";

interface TaskUserRef {
  id: string;
  fullName: string;
  username: string;
  email: string;
  userType: string;
  isActive: boolean;
}

interface TaskListItem {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadlineAt: string | null;
  isOverdue: boolean;
  createdAt: string;
  completedAt: string | null;
  lastActivityAt: string;
  creator: TaskUserRef | null;
  assignee: TaskUserRef | null;
  commentCount: number;
  attachmentCount: number;
  completionRecipientCount: number;
}

interface TaskListResult {
  items: TaskListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface TaskAttachment {
  id: string;
  objectPath: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface TaskCommentNode {
  id: string;
  body: string;
  author: TaskUserRef | null;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
  replies: TaskCommentNode[];
}

interface TaskActivityItem {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  actor: TaskUserRef | null;
  createdAt: string;
}

interface TaskDetail {
  task: {
    id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: TaskPriority;
    deadlineAt: string | null;
    completedAt: string | null;
    createdAt: string;
    isOverdue: boolean;
    creator: TaskUserRef | null;
    assignee: TaskUserRef | null;
  };
  completionRecipients: TaskUserRef[];
  attachments: TaskAttachment[];
  comments: TaskCommentNode[];
  activity: TaskActivityItem[];
  capabilities: {
    canEdit: boolean;
    canComplete: boolean;
    canReopen: boolean;
    canComment: boolean;
  };
}

interface TaskSummary {
  myPending: number;
  dueToday: number;
  overdue: number;
  recentlyCompleted: number;
  allPending: number;
  assignedByMePending: number;
}

interface AttachmentDraft {
  objectPath: string;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
}

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const VIEW_TABS: Array<{ key: ViewKey; label: string }> = [
  { key: "all", label: "All Tasks" },
  { key: "my", label: "My Tasks" },
  { key: "assigned_by_me", label: "Assigned By Me" },
  { key: "completed", label: "Completed" },
  { key: "overdue", label: "Overdue" },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: "URGENT", label: "Urgent" },
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
];

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  URGENT: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  HIGH: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  MEDIUM: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  LOW: "bg-muted text-muted-foreground border-border",
};

function initials(ref: TaskUserRef | null): string {
  if (!ref) return "?";
  const source = ref.fullName || ref.username || ref.email;
  return source.slice(0, 2).toUpperCase();
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return format(new Date(value), "MMM d, yyyy · h:mm a");
}

function formatDate(value: string | null): string {
  if (!value) return "No deadline";
  return format(new Date(value), "MMM d, yyyy");
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 0);
}

// ---------------------------------------------------------------------------
// Summary widgets
// ---------------------------------------------------------------------------

function SummaryWidgets({
  summary,
  onPick,
}: {
  summary?: TaskSummary;
  onPick: (view: ViewKey) => void;
}) {
  const cards: Array<{ label: string; value: number; icon: typeof Clock3; view: ViewKey; tone: string }> = [
    { label: "My Pending Tasks", value: summary?.myPending ?? 0, icon: Clock3, view: "my", tone: "text-primary" },
    { label: "Due Today", value: summary?.dueToday ?? 0, icon: CalendarClock, view: "my", tone: "text-blue-500" },
    { label: "Overdue", value: summary?.overdue ?? 0, icon: AlertTriangle, view: "overdue", tone: "text-red-500" },
    { label: "Recently Completed", value: summary?.recentlyCompleted ?? 0, icon: CheckCircle2, view: "completed", tone: "text-green-500" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.label}
            type="button"
            onClick={() => onPick(card.view)}
            className="flex items-center justify-between rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40"
            data-testid={`task-widget-${card.view}`}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold">{card.value}</p>
            </div>
            <Icon className={cn("h-5 w-5", card.tone)} />
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task row
// ---------------------------------------------------------------------------

function TaskRow({ task, onOpen }: { task: TaskListItem; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task.id)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40",
        task.isOverdue && "border-red-500/30 bg-red-500/[0.03]",
      )}
      data-testid={`task-row-${task.id}`}
    >
      <span
        className={cn(
          "flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border",
          task.status === "COMPLETED"
            ? "border-green-500 bg-green-500/10 text-green-500"
            : "border-muted-foreground/40",
        )}
      >
        {task.status === "COMPLETED" ? <CheckCircle2 className="h-4 w-4" /> : null}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-sm font-medium", task.status === "COMPLETED" && "text-muted-foreground line-through")}>
          {task.title}
        </p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">By {task.creator?.fullName ?? "Unknown"}</span>
          {task.commentCount > 0 ? (
            <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" />{task.commentCount}</span>
          ) : null}
          {task.attachmentCount > 0 ? (
            <span className="flex items-center gap-1"><Paperclip className="h-3 w-3" />{task.attachmentCount}</span>
          ) : null}
        </div>
      </div>

      <Badge variant="outline" className={cn("flex-shrink-0", PRIORITY_BADGE[task.priority])}>
        {task.priority.charAt(0) + task.priority.slice(1).toLowerCase()}
      </Badge>

      <span
        className={cn(
          "hidden w-28 flex-shrink-0 items-center gap-1 text-xs sm:flex",
          task.isOverdue ? "text-red-500" : "text-muted-foreground",
        )}
      >
        <CalendarClock className="h-3.5 w-3.5" />
        {formatDate(task.deadlineAt)}
      </span>

      <Avatar className="h-7 w-7 flex-shrink-0" title={task.assignee?.fullName}>
        <AvatarFallback className="bg-primary/10 text-[11px] text-primary">{initials(task.assignee)}</AvatarFallback>
      </Avatar>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Recipient multi-select
// ---------------------------------------------------------------------------

function RecipientMultiSelect({
  users,
  selected,
  onChange,
}: {
  users: TaskUserRef[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start font-normal">
          <UsersIcon className="mr-2 h-4 w-4" />
          {selected.length > 0 ? `${selected.length} recipient${selected.length > 1 ? "s" : ""}` : "Select recipients"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <ScrollArea className="max-h-64">
          <div className="p-2">
            {users.map((user) => (
              <label
                key={user.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox checked={selected.includes(user.id)} onCheckedChange={() => toggle(user.id)} />
                <span className="truncate">{user.fullName}</span>
                <span className="ml-auto text-[10px] uppercase text-muted-foreground">{user.userType}</span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Create / edit modal
// ---------------------------------------------------------------------------

interface TaskFormState {
  title: string;
  description: string;
  assignedToUserId: string;
  priority: TaskPriority;
  deadline: Date | undefined;
  completionRecipientUserIds: string[];
  attachments: AttachmentDraft[];
}

function CreateEditTaskDialog({
  open,
  onOpenChange,
  users,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: TaskUserRef[];
  editing?: TaskDetail | null;
}) {
  const { toast } = useToast();
  const { uploadFile, isUploading } = useUpload();
  const isEdit = Boolean(editing);

  const [form, setForm] = useState<TaskFormState>({
    title: "",
    description: "",
    assignedToUserId: "",
    priority: "MEDIUM",
    deadline: undefined,
    completionRecipientUserIds: [],
    attachments: [],
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.task.title,
        description: editing.task.description ?? "",
        assignedToUserId: editing.task.assignee?.id ?? "",
        priority: editing.task.priority,
        deadline: editing.task.deadlineAt ? new Date(editing.task.deadlineAt) : undefined,
        completionRecipientUserIds: editing.completionRecipients.map((recipient) => recipient.id),
        attachments: [],
      });
    } else {
      setForm({
        title: "",
        description: "",
        assignedToUserId: "",
        priority: "MEDIUM",
        deadline: undefined,
        completionRecipientUserIds: [],
        attachments: [],
      });
    }
  }, [open, editing]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assignedToUserId: form.assignedToUserId,
        priority: form.priority,
        deadlineAt: form.deadline ? endOfDay(form.deadline).toISOString() : null,
        completionRecipientUserIds: form.completionRecipientUserIds,
        attachments: form.attachments,
      };
      const res = isEdit
        ? await apiRequest("PATCH", `/api/tasks/${editing!.task.id}`, payload)
        : await apiRequest("POST", "/api/tasks", payload);
      return readJsonResponse<TaskDetail>(res);
    },
    onSuccess: (detail) => {
      toast({ title: isEdit ? "Task updated" : "Task created" });
      queryClient.invalidateQueries({ queryKey: ["tasks-list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/summary"] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: [`/api/tasks/${detail.task.id}`] });
      }
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({ title: "Could not save task", description: error.message, variant: "destructive" });
    },
  });

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      const result = await uploadFile(file);
      if (result) {
        setForm((prev) => ({
          ...prev,
          attachments: [
            ...prev.attachments,
            {
              objectPath: result.objectPath,
              fileName: file.name,
              contentType: file.type || null,
              sizeBytes: file.size,
            },
          ],
        }));
      }
    }
  };

  const canSubmit = form.title.trim().length > 0 && form.assignedToUserId.length > 0 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the details for this task." : "Create a task and assign it to a teammate."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="What needs to be done?"
              data-testid="task-title-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="Add context, links, or instructions"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Assignee</Label>
              <Select
                value={form.assignedToUserId}
                onValueChange={(value) => setForm((prev) => ({ ...prev, assignedToUserId: value }))}
              >
                <SelectTrigger data-testid="task-assignee-select">
                  <SelectValue placeholder="Select assignee" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value as TaskPriority }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Deadline</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {form.deadline ? format(form.deadline, "MMM d, yyyy") : "No deadline"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.deadline}
                    onSelect={(date) => setForm((prev) => ({ ...prev, deadline: date ?? undefined }))}
                    initialFocus
                  />
                  {form.deadline ? (
                    <div className="border-t p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setForm((prev) => ({ ...prev, deadline: undefined }))}
                      >
                        Clear deadline
                      </Button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label>Notify on completion</Label>
              <RecipientMultiSelect
                users={users}
                selected={form.completionRecipientUserIds}
                onChange={(ids) => setForm((prev) => ({ ...prev, completionRecipientUserIds: ids }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Attachments</Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:border-primary/40">
              <Paperclip className="h-4 w-4" />
              {isUploading ? "Uploading…" : "Add files"}
              <input type="file" multiple className="hidden" onChange={handleFileInput} disabled={isUploading} />
            </label>
            {form.attachments.length > 0 ? (
              <div className="space-y-1">
                {form.attachments.map((attachment, index) => (
                  <div key={`${attachment.objectPath}-${index}`} className="flex items-center gap-2 rounded-md bg-muted px-2 py-1 text-xs">
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate">{attachment.fileName}</span>
                    <button
                      type="button"
                      className="ml-auto text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          attachments: prev.attachments.filter((_, i) => i !== index),
                        }))
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit} data-testid="task-submit">
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Comment thread
// ---------------------------------------------------------------------------

function CommentItem({
  comment,
  onReply,
}: {
  comment: TaskCommentNode;
  onReply: (parentId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarFallback className="bg-muted text-[11px]">{initials(comment.author)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.author?.fullName ?? "Unknown"}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{comment.body}</p>
          <button
            type="button"
            onClick={() => onReply(comment.id)}
            className="mt-0.5 text-xs font-medium text-primary hover:underline"
          >
            Reply
          </button>
        </div>
      </div>
      {comment.replies.length > 0 ? (
        <div className="ml-9 space-y-2 border-l pl-3">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-2">
              <Avatar className="h-6 w-6 flex-shrink-0">
                <AvatarFallback className="bg-muted text-[10px]">{initials(reply.author)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{reply.author?.fullName ?? "Unknown"}</span>
                  <span className="text-xs text-muted-foreground">{formatDateTime(reply.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-foreground/90">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail sheet
// ---------------------------------------------------------------------------

function TaskDetailSheet({
  taskId,
  onClose,
  onEdit,
}: {
  taskId: string | null;
  onClose: () => void;
  onEdit: (detail: TaskDetail) => void;
}) {
  const { toast } = useToast();
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const { data: detail, isLoading } = useQuery<TaskDetail>({
    queryKey: [`/api/tasks/${taskId}`],
    enabled: Boolean(taskId),
  });

  useEffect(() => {
    setCommentBody("");
    setReplyTo(null);
  }, [taskId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/tasks/${taskId}`] });
    queryClient.invalidateQueries({ queryKey: ["tasks-list"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks/summary"] });
  };

  const completeMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/tasks/${taskId}/complete`),
    onSuccess: () => {
      toast({ title: "Task completed" });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Could not complete", description: error.message, variant: "destructive" }),
  });

  const reopenMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/tasks/${taskId}/reopen`),
    onSuccess: () => {
      toast({ title: "Task reopened" });
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Could not reopen", description: error.message, variant: "destructive" }),
  });

  const commentMutation = useMutation({
    mutationFn: async () =>
      apiRequest("POST", `/api/tasks/${taskId}/comments`, {
        body: commentBody.trim(),
        parentCommentId: replyTo,
      }),
    onSuccess: () => {
      setCommentBody("");
      setReplyTo(null);
      invalidate();
    },
    onError: (error: Error) => toast({ title: "Could not comment", description: error.message, variant: "destructive" }),
  });

  return (
    <Sheet open={Boolean(taskId)} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {isLoading || !detail ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 border-b p-5 text-left">
              <div className="flex items-start gap-2">
                <SheetTitle className="flex-1 text-lg leading-snug">{detail.task.title}</SheetTitle>
                <Badge variant="outline" className={PRIORITY_BADGE[detail.task.priority]}>
                  {detail.task.priority.charAt(0) + detail.task.priority.slice(1).toLowerCase()}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={cn(
                    detail.task.status === "COMPLETED"
                      ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
                      : detail.task.isOverdue
                        ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                        : "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
                  )}
                >
                  {detail.task.status === "COMPLETED" ? "Completed" : detail.task.isOverdue ? "Overdue" : "Pending"}
                </Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {formatDate(detail.task.deadlineAt)}
                </span>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1">
              <div className="space-y-5 p-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Assignee</p>
                    <p className="font-medium">{detail.task.assignee?.fullName ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created by</p>
                    <p className="font-medium">{detail.task.creator?.fullName ?? "—"}</p>
                  </div>
                </div>

                {detail.task.description ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Description</p>
                    <p className="whitespace-pre-wrap break-words text-sm">{detail.task.description}</p>
                  </div>
                ) : null}

                {detail.completionRecipients.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Notify on completion</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.completionRecipients.map((recipient) => (
                        <Badge key={recipient.id} variant="secondary" className="font-normal">
                          {recipient.fullName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {detail.attachments.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Attachments</p>
                    <div className="space-y-1">
                      {detail.attachments.map((attachment) => (
                        <a
                          key={attachment.id}
                          href={attachment.objectPath}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs hover:border-primary/40"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="truncate">{attachment.fileName}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Separator />

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Discussion</p>
                  {detail.comments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No comments yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {detail.comments.map((comment) => (
                        <CommentItem key={comment.id} comment={comment} onReply={setReplyTo} />
                      ))}
                    </div>
                  )}

                  <div className="mt-3 space-y-2">
                    {replyTo ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        Replying to a comment
                        <button type="button" onClick={() => setReplyTo(null)} className="text-primary hover:underline">
                          cancel
                        </button>
                      </div>
                    ) : null}
                    <Textarea
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder="Write a comment…"
                      rows={2}
                      data-testid="task-comment-input"
                    />
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        disabled={!commentBody.trim() || commentMutation.isPending}
                        onClick={() => commentMutation.mutate()}
                      >
                        {commentMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="mr-2 h-4 w-4" />
                        )}
                        Comment
                      </Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
                  <div className="space-y-3">
                    {detail.activity.map((event) => (
                      <div key={event.id} className="flex gap-2 text-sm">
                        <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-muted-foreground/40" />
                        <div>
                          <p className="font-medium">{event.title}</p>
                          {event.description ? (
                            <p className="text-xs text-muted-foreground">{event.description}</p>
                          ) : null}
                          <p className="text-[11px] text-muted-foreground">{formatDateTime(event.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>

            <div className="flex items-center gap-2 border-t p-4">
              {detail.capabilities.canEdit ? (
                <Button variant="outline" size="sm" onClick={() => onEdit(detail)} data-testid="task-edit">
                  Edit
                </Button>
              ) : null}
              <div className="flex-1" />
              {detail.capabilities.canComplete ? (
                <Button size="sm" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} data-testid="task-complete">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark complete
                </Button>
              ) : null}
              {detail.capabilities.canReopen ? (
                <Button variant="outline" size="sm" onClick={() => reopenMutation.mutate()} disabled={reopenMutation.isPending} data-testid="task-reopen">
                  <RotateCcw className="mr-2 h-4 w-4" />
                  Reopen
                </Button>
              ) : null}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

const GROUP_ORDER = ["Overdue", "Due Today", "Upcoming", "No Deadline", "Completed"] as const;
type GroupKey = (typeof GROUP_ORDER)[number];

function groupTasks(items: TaskListItem[]): Record<GroupKey, TaskListItem[]> {
  const groups: Record<GroupKey, TaskListItem[]> = {
    Overdue: [],
    "Due Today": [],
    Upcoming: [],
    "No Deadline": [],
    Completed: [],
  };
  for (const item of items) {
    if (item.status === "COMPLETED") {
      groups.Completed.push(item);
    } else if (item.isOverdue) {
      groups.Overdue.push(item);
    } else if (item.deadlineAt && isToday(new Date(item.deadlineAt))) {
      groups["Due Today"].push(item);
    } else if (item.deadlineAt) {
      groups.Upcoming.push(item);
    } else {
      groups["No Deadline"].push(item);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function readTaskIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("taskId");
}

function TasksContent({ basePath }: { basePath: string }) {
  const [view, setView] = useState<ViewKey>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [priority, setPriority] = useState<TaskPriority | "ALL">("ALL");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(() => readTaskIdFromUrl());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDetail | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  // Keep the open task reflected in the URL for deep-linking from notifications.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (selectedTaskId) {
      params.set("taskId", selectedTaskId);
    } else {
      params.delete("taskId");
    }
    const query = params.toString();
    window.history.replaceState(null, "", `${basePath}${query ? `?${query}` : ""}`);
  }, [selectedTaskId, basePath]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", view);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (priority !== "ALL") params.set("priority", priority);
    params.set("pageSize", "100");
    return `/api/tasks?${params.toString()}`;
  }, [view, debouncedSearch, priority]);

  const { data: listResult, isLoading } = useQuery<TaskListResult>({
    queryKey: ["tasks-list", listUrl],
    queryFn: async () => readJsonResponse<TaskListResult>(await apiRequest("GET", listUrl)),
  });

  const { data: summary } = useQuery<TaskSummary>({ queryKey: ["/api/tasks/summary"] });
  const { data: users = [] } = useQuery<TaskUserRef[]>({ queryKey: ["/api/tasks/users"] });

  const groups = useMemo(() => groupTasks(listResult?.items ?? []), [listResult]);
  const total = listResult?.total ?? 0;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (detail: TaskDetail) => {
    setEditing(detail);
    setSelectedTaskId(null);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <CheckSquare className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Tasks</h1>
            <p className="text-sm text-muted-foreground">Coordinate work across the team — {total} in this view</p>
          </div>
        </div>
        <Button onClick={openCreate} data-testid="task-new">
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      <SummaryWidgets summary={summary} onPick={(next) => setView(next)} />

      <div className="space-y-3">
        <Tabs value={view} onValueChange={(value) => setView(value as ViewKey)}>
          <TabsList>
            {VIEW_TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} data-testid={`task-view-${tab.key}`}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search tasks…"
              className="pl-9"
              data-testid="task-search"
            />
          </div>
          <Select value={priority} onValueChange={(value) => setPriority(value as TaskPriority | "ALL")}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All priorities</SelectItem>
              {PRIORITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : total === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <CheckSquare className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium">No tasks here</p>
          <p className="text-xs text-muted-foreground">Create a task to get started.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {GROUP_ORDER.map((groupKey) => {
            const groupItems = groups[groupKey];
            if (groupItems.length === 0) return null;
            return (
              <div key={groupKey} className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className={cn("text-sm font-semibold", groupKey === "Overdue" && "text-red-500")}>{groupKey}</h2>
                  <span className="text-xs text-muted-foreground">{groupItems.length}</span>
                </div>
                <div className="space-y-1.5">
                  {groupItems.map((task) => (
                    <TaskRow key={task.id} task={task} onOpen={setSelectedTaskId} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <TaskDetailSheet taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} onEdit={openEdit} />
      <CreateEditTaskDialog open={dialogOpen} onOpenChange={setDialogOpen} users={users} editing={editing} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shell-aware export
// ---------------------------------------------------------------------------

export default function TasksPage({ layout = "operations" }: { layout?: "admin" | "operations" }) {
  const basePath = layout === "admin" ? "/admin/tasks" : "/operations/tasks";
  const content = <TasksContent basePath={basePath} />;
  return layout === "admin" ? <AdminLayout>{content}</AdminLayout> : <OperationsLayout>{content}</OperationsLayout>;
}
