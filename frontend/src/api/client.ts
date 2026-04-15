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
    if (err.response?.status === 401) {
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

// ==================== FILES ====================

export async function uploadFile(orderId: string, file: File, fileType: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("fileType", fileType);
  const { data } = await api.post(`/orders/${orderId}/files`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function getDownloadUrl(fileId: string) {
  const { data } = await api.get(`/files/${fileId}/download`);
  return data.url;
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

export default api;
