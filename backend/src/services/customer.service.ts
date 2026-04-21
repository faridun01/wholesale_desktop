import prisma from '../db/prisma.js';
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from '../utils/errors.js';
import { mergeDuplicateCustomers, isDefaultCustomerName, getCanonicalDefaultCustomer } from '../utils/defaultCustomer.js';

export class CustomerService {
  private static PAYMENT_EPSILON = 0.01;

  private static normalizeCustomerName(value: string | null | undefined) {
    return String(value || '').trim().toLowerCase();
  }

  private static normalizeOptionalString(value: unknown) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  public static getInvoiceBalance(invoice: { netAmount: number; paidAmount: number }) {
    return Number(invoice.netAmount || 0) - Number(invoice.paidAmount || 0);
  }

  private static getCustomerSegment(params: { totalInvoiced: number; invoiceCount: number; averageInvoice: number }) {
    const { totalInvoiced, invoiceCount, averageInvoice } = params;
    if (totalInvoiced >= 10000 || invoiceCount >= 20 || averageInvoice >= 1500) return 'VIP';
    if (totalInvoiced >= 5000 || invoiceCount >= 10 || averageInvoice >= 700) return 'Постоянный';
    if (invoiceCount >= 2 || totalInvoiced >= 1000) return 'Обычный';
    return 'Новый';
  }

  /**
   * Maps raw database customer to a rich object with totals and segments
   */
  public static mapCustomerWithTotals(customer: any) {
    const invoices = Array.isArray(customer.invoices) ? customer.invoices : [];
    const payments = Array.isArray(customer.payments) ? customer.payments : [];
    
    const totalInvoiced = invoices.reduce((sum: number, inv: any) => sum + Number(inv.netAmount || 0), 0);
    const totalPaid = payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const balance = totalInvoiced - totalPaid;
    
    const invoiceCount = invoices.length;
    const averageInvoice = invoiceCount > 0 ? totalInvoiced / invoiceCount : 0;

    const unpaidInvoices = invoices.filter((inv: any) => {
      const net = Number(inv.netAmount || 0);
      const paid = Number(inv.paidAmount || 0);
      return net > paid + this.PAYMENT_EPSILON;
    });

    const lastPurchaseAt = invoices.reduce((latest: string | null, inv: any) => {
      const current = inv?.createdAt ? new Date(inv.createdAt).toISOString() : null;
      if (!current) return latest;
      if (!latest) return current;
      return new Date(current).getTime() > new Date(latest).getTime() ? current : latest;
    }, null);

    const warehouseNames = Array.from(new Set(invoices.map((inv: any) => String(inv?.warehouse?.name || '').trim()).filter(Boolean)));

    return {
      ...customer,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      balance,
      invoice_count: invoiceCount,
      unpaid_invoice_count: unpaidInvoices.length,
      average_invoice: averageInvoice,
      customer_segment: this.getCustomerSegment({ totalInvoiced, invoiceCount, averageInvoice }),
      last_purchase_at: lastPurchaseAt,
      warehouse_names: warehouseNames,
    };
  }

  /**
   * Core logic for creating or retrieving a canonical default customer
   */
  public static async syncDefaultCustomer(userId: number | null) {
    return await mergeDuplicateCustomers(prisma, userId);
  }

  /**
   * Complex listing with auto-merging and segmented totals
   */
  public static async getCustomers(access: any, pagination: { skip: number, limit: number }) {
    const defaultCustomer = await this.syncDefaultCustomer(access.userId);
    
    const baseWhere: any = {
      OR: [
        { active: true },
        { invoices: { some: {} } },
        { payments: { some: {} } },
        { returns: { some: {} } },
      ],
    };

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where: baseWhere,
        include: {
          invoices: {
            where: { cancelled: false },
            select: { id: true, netAmount: true, paidAmount: true, createdAt: true, warehouse: { select: { name: true } } },
          },
          payments: {
            select: { amount: true }
          }
        },
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count({ where: baseWhere }),
    ]);

    const mapped = customers.map(c => this.mapCustomerWithTotals(c));
    mapped.sort((a: any, b: any) => {
      if (a.id === defaultCustomer?.id) return -1;
      if (b.id === defaultCustomer?.id) return 1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    return {
      customers: mapped.filter(c => c.id !== defaultCustomer?.id).map(c => {
        if (access.isAdmin) return c;
        // Financial masking for staff
        return { ...c, total_invoiced: 0, total_paid: 0, balance: 0, average_invoice: 0 };
      }),
      total
    };
  }

  private static async findDuplicate(name: string, excludeId?: number) {
    const normalized = this.normalizeCustomerName(name);
    if (!normalized) return null;

    const customers = await prisma.customer.findMany({
      where: { name: { equals: name.trim() } },
      select: { id: true, name: true }
    });

    return customers.find(c => c.id !== excludeId && this.normalizeCustomerName(c.name) === normalized) || null;
  }

  public static async createCustomer(userId: number, body: any, access: any) {
    if (isDefaultCustomerName(body.name)) {
      return await getCanonicalDefaultCustomer(prisma, userId);
    }

    const payload = this.buildPayload(body, access);
    if (!payload.name) throw new ValidationError('Название клиента обязательно');

    if (await this.findDuplicate(payload.name)) {
      throw new ConflictError(`Клиент "${payload.name}" уже существует`);
    }

    return await prisma.customer.create({
      data: { ...payload, createdByUserId: userId }
    });
  }

  public static async updateCustomer(customerId: number, userId: number, body: any, access: any) {
    const old = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!old) throw new NotFoundError('Клиент не найден');
    
    // Ownership check for non-admins
    if (!access.isAdmin && old.createdByUserId !== userId) {
      throw new ForbiddenError('Forbidden');
    }

    if (isDefaultCustomerName(body.name)) {
      const defaultCustomer = await getCanonicalDefaultCustomer(prisma, userId);
      if (defaultCustomer.id !== customerId) {
        throw new ConflictError(`Клиент "${body.name}" уже существует`);
      }
    }

    const payload = this.buildPayload(body, access);
    if (!payload.name) throw new ValidationError('Название клиента обязательно');

    if (await this.findDuplicate(payload.name, customerId)) {
      throw new ConflictError(`Клиент "${payload.name}" уже существует`);
    }

    return await prisma.customer.update({
      where: { id: customerId },
      data: payload
    });
  }

  private static buildPayload(body: any, access: any) {
    const customerType = String(body.customerType || 'individual').trim().toLowerCase() === 'company' ? 'company' : 'individual';
    const companyName = this.normalizeOptionalString(body.companyName);
    const contactName = this.normalizeOptionalString(body.contactName);
    const fallbackName = this.normalizeOptionalString(body.name);
    
    const name = customerType === 'company' 
      ? (companyName || contactName || fallbackName || '') 
      : (contactName || fallbackName || '');

    return {
      customerType,
      name,
      customerCategory: this.normalizeOptionalString(body.customerCategory),
      companyName,
      contactName,
      phone: this.normalizeOptionalString(body.phone),
      country: this.normalizeOptionalString(body.country),
      region: this.normalizeOptionalString(body.region),
      city: access.isAdmin ? this.normalizeOptionalString(body.city) : this.normalizeOptionalString(access.city),
      address: this.normalizeOptionalString(body.address),
      notes: this.normalizeOptionalString(body.notes),
    };
  }

  public static async getCustomerAccess(access: any, customerId: number, options?: { requireOwnership?: boolean }) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, createdByUserId: true },
    });

    if (!customer) throw new NotFoundError('Клиент не найден');

    if (access.isAdmin) return customer;
    
    if (options?.requireOwnership && customer.createdByUserId !== access.userId) {
      throw new ForbiddenError('Forbidden');
    }

    return customer;
  }
}
