export type CustomerPaymentStatus = 'paid' | 'partial' | 'unpaid';

export type DebtCustomer = {
  id: number;
  name: string;
  customerCategory?: string | null;
  phone?: string | null;
  warehouse_names?: string[] | null;
  total_invoiced?: number;
  total_paid?: number;
  balance?: number;
  invoice_count?: number;
  paid_invoice_count?: number;
  partial_invoice_count?: number;
  unpaid_invoice_count?: number;
  paid_invoiced_total?: number;
  paid_collected_total?: number;
  partial_invoiced_total?: number;
  partial_collected_total?: number;
  unpaid_invoiced_total?: number;
  last_purchase_at?: string | null;
};

export type CustomerDebtSummary = {
  totalDebt: number;
  totalPaid: number;
  fullyPaidCount: number;
  partialCount: number;
  unpaidCount: number;
};

const PAYMENT_EPSILON = 0.01;

export const customerPaymentStatusMeta: Record<CustomerPaymentStatus, { label: string; badgeVariant: 'success' | 'warning' | 'danger' }> = {
  paid: {
    label: 'Оплачено полностью',
    badgeVariant: 'success',
  },
  partial: {
    label: 'Частично оплачено',
    badgeVariant: 'warning',
  },
  unpaid: {
    label: 'Не оплачено',
    badgeVariant: 'danger',
  },
};

export function getCustomerPurchasedTotal(customer: DebtCustomer) {
  return Number(customer.total_invoiced || 0);
}

export function getCustomerPaidTotal(customer: DebtCustomer) {
  return Number(customer.total_paid || 0);
}

export function getCustomerPurchasedTotalByFilter(customer: DebtCustomer, filter: CustomerPaymentStatus | 'all') {
  if (filter === 'paid') {
    return Number(customer.paid_invoiced_total || 0);
  }

  if (filter === 'partial') {
    return Number(customer.partial_invoiced_total || 0);
  }

  if (filter === 'unpaid') {
    return Number(customer.unpaid_invoiced_total || 0);
  }

  return getCustomerPurchasedTotal(customer);
}

export function getCustomerPaidTotalByFilter(customer: DebtCustomer, filter: CustomerPaymentStatus | 'all') {
  if (filter === 'paid') {
    return Number(customer.paid_collected_total || 0);
  }

  if (filter === 'partial') {
    return Number(customer.partial_collected_total || 0);
  }

  if (filter === 'unpaid') {
    return 0;
  }

  return getCustomerPaidTotal(customer);
}

export function getCustomerDebtTotal(customer: DebtCustomer) {
  const debt = Number(customer.balance || 0);
  return debt > PAYMENT_EPSILON ? debt : 0;
}

export function hasCustomerPurchases(customer: DebtCustomer) {
  return getCustomerPurchasedTotal(customer) > PAYMENT_EPSILON || Number(customer.invoice_count || 0) > 0;
}

export function getCustomerPaymentStatus(customer: DebtCustomer): CustomerPaymentStatus {
  const purchased = getCustomerPurchasedTotal(customer);
  const paid = getCustomerPaidTotal(customer);
  const debt = getCustomerDebtTotal(customer);

  if (debt <= PAYMENT_EPSILON) {
    return 'paid';
  }

  if (paid > PAYMENT_EPSILON && debt > PAYMENT_EPSILON) {
    return 'partial';
  }

  if (paid <= PAYMENT_EPSILON && purchased > PAYMENT_EPSILON) {
    return 'unpaid';
  }

  return 'paid';
}

export function getCustomerInvoicesByStatus(customer: DebtCustomer, status: CustomerPaymentStatus) {
  if (status === 'paid') {
    return Number(customer.paid_invoice_count || 0);
  }

  if (status === 'partial') {
    return Number(customer.partial_invoice_count || 0);
  }

  return Number(customer.unpaid_invoice_count || 0);
}

export function customerMatchesPaymentFilter(customer: DebtCustomer, filter: CustomerPaymentStatus | 'all') {
  if (filter === 'all') {
    return hasCustomerPurchases(customer);
  }

  const explicitCount = getCustomerInvoicesByStatus(customer, filter);
  if (explicitCount > 0) {
    return true;
  }

  const hasExplicitCounts =
    Number(customer.paid_invoice_count || 0) > 0 ||
    Number(customer.partial_invoice_count || 0) > 0 ||
    Number(customer.unpaid_invoice_count || 0) > 0;

  if (hasExplicitCounts) {
    return false;
  }

  return getCustomerPaymentStatus(customer) === filter;
}

export function buildCustomerDebtSummary(customers: DebtCustomer[]): CustomerDebtSummary {
  return customers.reduce<CustomerDebtSummary>(
    (summary, customer) => {
      const debt = getCustomerDebtTotal(customer);
      const paid = getCustomerPaidTotal(customer);

      summary.totalDebt += debt;
      summary.totalPaid += paid;

      if (customerMatchesPaymentFilter(customer, 'paid')) {
        summary.fullyPaidCount += 1;
      }

      if (customerMatchesPaymentFilter(customer, 'partial')) {
        summary.partialCount += 1;
      }

      if (customerMatchesPaymentFilter(customer, 'unpaid')) {
        summary.unpaidCount += 1;
      }

      return summary;
    },
    {
      totalDebt: 0,
      totalPaid: 0,
      fullyPaidCount: 0,
      partialCount: 0,
      unpaidCount: 0,
    },
  );
}
