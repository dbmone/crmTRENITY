import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// Добавляем JWT токен ко всем запросам
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// При 401 — редирект на логин
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = String(err.config?.url || "");
    const isLoginRequest = url.includes("/auth/login");

    if (err.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// ==================== AUTH ====================

export async function loginByPin(pin: string) {
  const { data } = await api.post("/auth/login", { pin });
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
  return data;
}

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

// ==================== ORDERS ====================

export async function getOrders(params?: Record<string, string>) {
  const { data } = await api.get("/orders", { params });
  return data;
}

export async function getOrder(id: string) {
  const { data } = await api.get(`/orders/${id}`);
  return data;
}

export async function createOrder(body: {
  title: string;
  description?: string;
  deadline?: string;
  reminderDays?: number;
}) {
  const { data } = await api.post("/orders", body);
  return data;
}

export async function updateOrder(id: string, body: Record<string, any>) {
  const { data } = await api.put(`/orders/${id}`, body);
  return data;
}

export async function deleteOrder(id: string) {
  const { data } = await api.delete(`/orders/${id}`);
  return data;
}

export async function updateOrderStatus(id: string, status: string) {
  const { data } = await api.put(`/orders/${id}/status`, { status });
  return data;
}

// ==================== CREATORS ====================

export async function addCreator(orderId: string, creatorId: string, isLead = false) {
  const { data } = await api.post(`/orders/${orderId}/creators`, { creatorId, isLead });
  return data;
}

export async function removeCreator(orderId: string, creatorId: string) {
  const { data } = await api.delete(`/orders/${orderId}/creators/${creatorId}`);
  return data;
}

// ==================== STAGES ====================

export async function updateStage(orderId: string, stageId: string, status: string) {
  const { data } = await api.put(`/orders/${orderId}/stages/${stageId}`, { status });
  return data;
}

export async function startRevisionRound(orderId: string) {
  const { data } = await api.post(`/orders/${orderId}/stages/revisions`);
  return data;
}

export async function toggleClientApproval(orderId: string, stageId: string, action: "request" | "approve" | "skip") {
  const { data } = await api.post(`/orders/${orderId}/stages/${stageId}/client-approval`, { action });
  return data;
}

export async function rollbackStage(orderId: string, stageId: string) {
  const { data } = await api.post(`/orders/${orderId}/stages/${stageId}/rollback`);
  return data;
}

// ==================== FILES ====================

export type UploadFileOptions = {
  onProgress?: (percent: number, loaded: number, total: number) => void;
  signal?: AbortSignal;
};

export async function uploadFile(orderId: string, file: File, fileType: string, options?: UploadFileOptions) {
  const form = new FormData();
  form.append("fileType", fileType);
  form.append("file", file);
  const { data } = await api.post(`/orders/${orderId}/files`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    signal: options?.signal,
    onUploadProgress: (event) => {
      if (!options?.onProgress) return;
      const total = event.total ?? file.size ?? 0;
      const loaded = event.loaded ?? 0;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      options.onProgress(percent, loaded, total);
    },
  });
  return data;
}

export function isRequestCanceled(error: unknown) {
  return axios.isCancel(error)
    || (typeof error === "object" && error !== null && (
      (error as { code?: string }).code === "ERR_CANCELED"
      || (error as { name?: string }).name === "CanceledError"
    ));
}

export async function getDownloadUrl(fileId: string) {
  const { data } = await api.get(`/files/${fileId}/download`);
  return data.url;
}

export async function getFileContent(fileId: string): Promise<Blob> {
  const { data } = await api.get(`/files/${fileId}/content`, { responseType: "blob" });
  return data;
}

/** Прямой URL для <video src> / <audio src> — токен в query-параметре, поддерживает Range */
export function getFileStreamUrl(fileId: string): string {
  const token = localStorage.getItem("token") ?? "";
  const base = (api.defaults.baseURL ?? "/api").replace(/\/$/, "");
  return `${base}/files/${fileId}/stream?token=${encodeURIComponent(token)}`;
}

export async function sendFileToTelegram(fileId: string) {
  const { data } = await api.post(`/files/${fileId}/send-to-tg`);
  return data as { success: boolean; message: string };
}

export async function addTzNote(orderId: string, text: string) {
  const { data } = await api.post(`/orders/${orderId}/files/tz-note`, { text });
  return data;
}

export async function updateTzNote(fileId: string, text: string) {
  const { data } = await api.patch(`/files/${fileId}/tz-note`, { text });
  return data;
}

export async function transcribeVoice(orderId: string, blob: Blob, ext: string): Promise<{ text: string }> {
  const form = new FormData();
  form.append("audio", blob, `voice.${ext}`);
  const { data } = await api.post(`/orders/${orderId}/files/tz-transcribe`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function sendTzBundleToTg(orderId: string) {
  const { data } = await api.post(`/orders/${orderId}/files/tz-to-tg`);
  return data as { success: boolean; sent: number };
}

export async function deleteFile(fileId: string) {
  const { data } = await api.delete(`/files/${fileId}`);
  return data;
}

// ==================== REPORTS ====================

export async function submitReport(orderId: string, reportText: string) {
  const { data } = await api.post(`/orders/${orderId}/reports`, { reportText });
  return data;
}

export async function getReports(orderId: string) {
  const { data } = await api.get(`/orders/${orderId}/reports`);
  return data;
}

// ==================== USERS ====================

export async function getUsers(params?: { includeAll?: boolean }) {
  const { data } = await api.get("/users", { params });
  return data;
}

export async function getUser(id: string) {
  const { data } = await api.get(`/users/${id}`);
  return data;
}

export async function updateProfile(id: string, body: { displayName?: string; avatarUrl?: string }) {
  const { data } = await api.put(`/users/${id}`, body);
  return data;
}

export async function approveUser(id: string, role?: string) {
  const { data } = await api.post(`/users/${id}/approve`, { role });
  return data;
}

export async function rejectUser(id: string) {
  const { data } = await api.post(`/users/${id}/reject`);
  return data;
}

export async function changeRole(id: string, role: string) {
  const { data } = await api.put(`/users/${id}/role`, { role });
  return data;
}

export async function deactivateUser(id: string) {
  const { data } = await api.post(`/users/${id}/block`);
  return data;
}

export async function setTeamLead(userId: string, teamLeadId: string | null) {
  const { data } = await api.put(`/users/${userId}/team-lead`, { teamLeadId });
  return data;
}

export async function getDashboard() {
  const { data } = await api.get("/dashboard/stats");
  return data;
}

export async function runCleanup() {
  const { data } = await api.post("/dashboard/cleanup");
  return data;
}

// ==================== COMMENTS ====================

export async function getComments(orderId: string) {
  const { data } = await api.get(`/orders/${orderId}/comments`);
  return data;
}

export async function postComment(orderId: string, text: string) {
  const { data } = await api.post(`/orders/${orderId}/comments`, { text });
  return data;
}

// ==================== NOTIFICATIONS ====================

export async function getNotifications(page = 1, limit = 20) {
  const { data } = await api.get("/notifications", { params: { page, limit } });
  return data;
}

export async function markNotificationRead(id: string) {
  const { data } = await api.put(`/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await api.put("/notifications/read-all");
  return data;
}

// ==================== PRE-APPROVE ====================

export async function preApproveUser(telegramUsername: string, role: string) {
  const { data } = await api.post("/users/pre-approve", { telegramUsername, role });
  return data;
}

export async function getPreApproved() {
  const { data } = await api.get("/users/pre-approved");
  return data;
}

export async function restoreUser(id: string) {
  const { data } = await api.post(`/users/${id}/restore`);
  return data;
}

export async function markGuideSeen(): Promise<void> {
  await api.post("/users/guide-seen");
}

// ==================== PERMISSIONS ====================

export async function getPermissions() {
  const { data } = await api.get("/permissions");
  return data as Array<{ key: string; label: string; roles: string[]; defaultRoles: string[] }>;
}

export async function updatePermission(key: string, roles: string[]) {
  const { data } = await api.put(`/permissions/${key}`, { roles });
  return data;
}

export async function resetPermission(key: string) {
  const { data } = await api.delete(`/permissions/${key}`);
  return data;
}

export async function getUserPermissionOverrides(userId: string) {
  const { data } = await api.get(`/permissions/users/${userId}`);
  return data as { user: { id: string; displayName: string; role: string }; overrides: Array<{ permission: string; granted: boolean }> };
}

export async function setUserPermissionOverride(userId: string, key: string, granted: boolean) {
  const { data } = await api.put(`/permissions/users/${userId}/${key}`, { granted });
  return data;
}

export async function deleteUserPermissionOverride(userId: string, key: string) {
  const { data } = await api.delete(`/permissions/users/${userId}/${key}`);
  return data;
}

// ==================== TASKS ====================

import type { Task, TaskSubtask, ParsedTask } from "../types";

export async function getTasks(): Promise<Task[]> {
  const { data } = await api.get("/tasks");
  return data;
}

export async function createTask(body: {
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string;
  subtasks?: string[];
  aiGenerated?: boolean;
}): Promise<Task> {
  const { data } = await api.post("/tasks", body);
  return data;
}

export async function updateTask(id: string, body: {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string | null;
}): Promise<Task> {
  const { data } = await api.put(`/tasks/${id}`, body);
  return data;
}

export async function deleteTask(id: string): Promise<void> {
  await api.delete(`/tasks/${id}`);
}

export async function addSubtask(taskId: string, title: string): Promise<TaskSubtask> {
  const { data } = await api.post(`/tasks/${taskId}/subtasks`, { title });
  return data;
}

export async function toggleSubtask(taskId: string, subtaskId: string, done: boolean): Promise<TaskSubtask> {
  const { data } = await api.patch(`/tasks/${taskId}/subtasks/${subtaskId}`, { done });
  return data;
}

export async function deleteSubtask(taskId: string, subtaskId: string): Promise<void> {
  await api.delete(`/tasks/${taskId}/subtasks/${subtaskId}`);
}

export async function voiceStructureToTz(orderId: string, blob: Blob, ext: string): Promise<{ text: string; rawText: string }> {
  const form = new FormData();
  form.append("audio", blob, `voice.${ext}`);
  const { data } = await api.post(`/orders/${orderId}/files/tz-voice-structure`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function parseVoiceTask(blob: Blob, ext: string): Promise<ParsedTask> {
  const form = new FormData();
  form.append("audio", blob, `voice.${ext}`);
  const { data } = await api.post("/tasks/parse-voice", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ==================== SETTINGS ====================

export async function getSettings(): Promise<Record<string, string>> {
  const { data } = await api.get("/settings");
  return data;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  await api.put(`/settings/${key}`, { value });
}

export async function resetSetting(key: string): Promise<{ value: string }> {
  const { data } = await api.delete(`/settings/${key}`);
  return data;
}

export default api;
