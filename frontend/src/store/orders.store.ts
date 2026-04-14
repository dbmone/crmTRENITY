import { create } from "zustand";
import { Order, OrderStatus } from "../types";
import * as api from "../api/client";

interface OrdersState {
  orders: Order[];
  selectedOrder: Order | null;
  isLoading: boolean;
  error: string | null;
  filter: { creatorId?: string; marketerId?: string } | null;

  fetchOrders: () => Promise<void>;
  fetchOrder: (id: string) => Promise<void>;
  createOrder: (data: { title: string; description?: string; deadline?: string; reminderDays?: number }) => Promise<Order>;
  moveOrder: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  removeOrder: (id: string) => Promise<void>;
  setFilter: (filter: OrdersState["filter"]) => void;
  clearSelected: () => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  selectedOrder: null,
  isLoading: false,
  error: null,
  filter: null,

  fetchOrders: async () => {
    set({ isLoading: true });
    try {
      const params: Record<string, string> = {};
      const filter = get().filter;
      if (filter?.creatorId) params.creatorId = filter.creatorId;
      if (filter?.marketerId) params.marketerId = filter.marketerId;
      const orders = await api.getOrders(params);
      set({ orders, isLoading: false, error: null });
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
    }
  },

  fetchOrder: async (id: string) => {
    try {
      const order = await api.getOrder(id);
      set({ selectedOrder: order });
    } catch (err: any) {
      set({ error: err.message });
    }
  },

  createOrder: async (data) => {
    const order = await api.createOrder(data);
    await get().fetchOrders();
    return order;
  },

  moveOrder: async (orderId: string, newStatus: OrderStatus) => {
    // Оптимистичное обновление
    const prev = get().orders;
    set({
      orders: prev.map((o) =>
        o.id === orderId ? { ...o, status: newStatus } : o
      ),
    });

    try {
      await api.updateOrderStatus(orderId, newStatus);
    } catch {
      // Откат при ошибке
      set({ orders: prev });
    }
  },

  removeOrder: async (id: string) => {
    await api.deleteOrder(id);
    set({ orders: get().orders.filter((o) => o.id !== id) });
  },

  setFilter: (filter) => {
    set({ filter });
    get().fetchOrders();
  },

  clearSelected: () => set({ selectedOrder: null }),
}));
