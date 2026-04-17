import { create } from "zustand";
import * as api from "../api/client";
import type { Order, OrderStatus } from "../types";

interface OrderFilter {
  creatorId?: string;
  marketerId?: string;
  search?: string;
}

interface OrdersState {
  orders: Order[];
  selectedOrder: Order | null;
  isLoading: boolean;
  error: string | null;
  filter: OrderFilter | null;

  fetchOrders: () => Promise<void>;
  fetchOrder: (id: string) => Promise<void>;
  createOrder: (data: { title: string; description?: string; deadline?: string; reminderDays?: number }) => Promise<Order>;
  moveOrder: (orderId: string, newStatus: OrderStatus) => Promise<void>;
  removeOrder: (id: string) => Promise<void>;
  setFilter: (filter: OrderFilter | null) => void;
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
      if (filter?.search) params.search = filter.search;
      const data = await api.getOrders(params);
      const orders = Array.isArray(data) ? data : (data.orders ?? []);
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
    const prev = get().orders;
    set({
      orders: prev.map((order) => (order.id === orderId ? { ...order, status: newStatus } : order)),
    });

    try {
      await api.updateOrderStatus(orderId, newStatus);
    } catch {
      set({ orders: prev });
    }
  },

  removeOrder: async (id: string) => {
    await api.deleteOrder(id);
    set({ orders: get().orders.filter((order) => order.id !== id) });
  },

  setFilter: (filter) => {
    set({ filter });
    void get().fetchOrders();
  },

  clearSelected: () => set({ selectedOrder: null }),
}));
