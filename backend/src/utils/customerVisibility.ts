export const maskInvoiceFinancials = (invoice: any) => ({
  ...invoice,
  totalAmount: 0,
  discount: 0,
  netAmount: 0,
  paidAmount: 0,
  returnedAmount: 0,
  invoiceBalance: 0,
  items: Array.isArray(invoice.items)
    ? invoice.items.map((item: any) => ({
        ...item,
        sellingPrice: 0,
        totalPrice: 0,
      }))
    : [],
  payments: Array.isArray(invoice.payments)
    ? invoice.payments.map((payment: any) => ({
        ...payment,
        amount: 0,
      }))
    : [],
  returns: Array.isArray(invoice.returns)
    ? invoice.returns.map((itemReturn: any) => ({
        ...itemReturn,
        totalValue: 0,
      }))
    : [],
  paymentEvents: Array.isArray(invoice.paymentEvents)
    ? invoice.paymentEvents.map((payment: any) => ({
        ...payment,
        amount: 0,
      }))
    : [],
  returnEvents: Array.isArray(invoice.returnEvents)
    ? invoice.returnEvents.map((itemReturn: any) => ({
        ...itemReturn,
        totalValue: 0,
      }))
    : [],
});
