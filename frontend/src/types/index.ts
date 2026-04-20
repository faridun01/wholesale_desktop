export interface User {
  id: number;
  username: string;
  role: 'admin' | 'staff';
  warehouseId?: number;
}

export interface Product {
  id: number;
  name: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  categoryId: number;
  category?: Category;
}

export interface Category {
  id: number;
  name: string;
}

export interface Customer {
  id: number;
  name: string;
  phone?: string;
  address?: string;
}

export interface Invoice {
  id: number;
  customerId: number;
  totalAmount: number;
  netAmount: number;
  paidAmount: number;
  status: 'paid' | 'partial' | 'unpaid';
  cancelled: boolean;
  createdAt: string;
}
