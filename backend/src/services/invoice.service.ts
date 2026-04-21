import prisma from '../db/prisma.js';
import { StockService } from './stock.service.js';
import { formatQuantityForInvoice, normalizeBaseUnitName } from '../utils/product-packaging.js';
import { normalizeMoney, roundMoney, ceilMoney } from '../utils/money.js';

const PAYMENT_EPSILON = 0.01;
const TRANSACTION_OPTIONS = {
  maxWait: 10000,
  timeout: 120000,
};

const buildCustomerAddressSnapshot = (customer: any) =>
  [customer?.country, customer?.region, customer?.city, customer?.address]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(', ') || null;

function getInvoiceStatus(paidAmount: number, netAmount: number) {
  if (paidAmount > 0 && paidAmount >= netAmount - PAYMENT_EPSILON) {
    return 'paid';
  }

  if (paidAmount > 0) {
    return 'partial';
  }

  return 'unpaid';
}

function normalizeNonNegativeNumber(value: number, fieldName: string) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }

  return normalized;
}

function buildRequestedQuantityByProduct(
  items: Array<{ productId: number; quantity: number; totalBaseUnits?: number }>,
) {
  const requested = new Map<number, number>();

  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = normalizeNonNegativeNumber(item.totalBaseUnits ?? item.quantity, 'Item quantity');
    requested.set(productId, roundMoney((requested.get(productId) || 0) + quantity));
  }

  return requested;
}

function buildCurrentInvoiceItemSnapshot(item: any) {
  const originalTotalBaseUnits = Math.max(0, Number(item?.totalBaseUnits ?? item?.quantity ?? 0));
  const returnedQty = Math.max(0, Number(item?.returnedQty || 0));
  const remainingBaseUnits = roundMoney(Math.max(0, originalTotalBaseUnits - returnedQty));

  if (remainingBaseUnits <= PAYMENT_EPSILON) {
    return null;
  }

  const unitsPerPackage = Math.max(0, Number(item?.unitsPerPackageSnapshot ?? 0));
  const hasPackaging = Number(item?.packageQuantity || 0) > 0 && unitsPerPackage > 0;
  const packageQuantity = hasPackaging ? Math.floor(remainingBaseUnits / unitsPerPackage) : null;
  const packagedUnits = hasPackaging ? packageQuantity! * unitsPerPackage : 0;
  const extraUnitQuantity = hasPackaging ? roundMoney(remainingBaseUnits - packagedUnits) : roundMoney(remainingBaseUnits);

  return {
    ...item,
    quantity: remainingBaseUnits,
    totalBaseUnits: remainingBaseUnits,
    packageQuantity,
    extraUnitQuantity,
    returnedQty: 0,
    totalPrice: roundMoney(remainingBaseUnits * Number(item?.sellingPrice || 0) * (1 - (Number(item?.discount || 0) / 100))),
  };
}

export class InvoiceService {
  /**
   * Fetchespaginated invoices list with calculated totals and profit (for admins)
   */
  public static async getInvoices(access: any, params: { warehouseId?: number, pagination: { skip: number, limit: number } }) {
    const where: any = {
      cancelled: false,
      warehouseId: params.warehouseId ?? undefined,
      userId: access.isAdmin ? undefined : (access.userId ?? -1)
    };

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: { customer: true, user: true, items: true },
        skip: params.pagination.skip,
        take: params.pagination.limit,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.invoice.count({ where })
    ]);

    const mapped = invoices.map((inv: any) => {
      let totalProfit: number | undefined = undefined;
      if (access.isAdmin) {
        totalProfit = inv.items.reduce((sum: number, item: any) => {
          return sum + (item.sellingPrice - (item.costPrice || 0)) * (item.quantity - (item.returnedQty || 0));
        }, 0);
      }

      return {
        ...inv,
        customer_name: inv.customerNameSnapshot || inv.customer?.name || '---',
        staff_name: inv.user?.username || '---',
        totalProfit
      };
    });

    return { invoices: mapped, total };
  }

  /**
   * Creates a new invoice and allocates stock.
   */
  static async createInvoice(data: {
    customerId: number;
    userId: number;
    warehouseId: number;
    items: {
      productId: number;
      quantity: number;
      sellingPrice: number;
      totalBaseUnits?: number;
      packageQuantity?: number;
      extraUnitQuantity?: number;
      packagingId?: number | null;
      packageName?: string | null;
      baseUnitName?: string | null;
      unitsPerPackage?: number | null;
      productName?: string | null;
      rawName?: string | null;
      brand?: string | null;
      discount?: number;
    }[];
    discount?: number;
    tax?: number;
    paidAmount?: number;
    paymentMethod?: string;
    paymentDueDate?: string;
  }) {
    const { customerId, userId, warehouseId, items, discount = 0, tax = 0, paidAmount = 0, paymentMethod = 'cash', paymentDueDate } = data;
    const normalizedDiscount = normalizeMoney(normalizeNonNegativeNumber(discount, 'Discount'), 'Discount');
    const normalizedTax = normalizeMoney(normalizeNonNegativeNumber(tax, 'Tax'), 'Tax');
    const normalizedPaidAmount = normalizeMoney(normalizeNonNegativeNumber(paidAmount, 'Paid amount'), 'Paid amount');

    if (normalizedDiscount > 100) {
      throw new Error('Discount cannot exceed 100%');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Invoice must contain at least one item');
    }

    // Start Prisma Transaction
    return await prisma.$transaction(async (tx: any) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      const companyProfile = await tx.companyProfile.findFirst({ where: { isActive: true }, orderBy: { id: 'asc' } });
      const productIds = [...new Set(items.map((item) => Number(item.productId)))];
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          warehouseId,
          active: true,
        },
        include: {
          packagings: {
            where: { active: true },
          },
        },
      }) as any[];

      if (!customer) {
        throw new Error('Customer not found');
      }

      const productsById = new Map<number, any>(products.map((product: any) => [product.id, product]));

      if (products.length !== productIds.length) {
        throw new Error('Один или несколько товаров не принадлежат выбранному складу');
      }

      const requestedByProduct = buildRequestedQuantityByProduct(items);
      for (const [productId, requestedQty] of requestedByProduct.entries()) {
        const product = productsById.get(productId);
        if (!product) {
          continue;
        }

        const availableQty = Math.max(0, Number(product.stock || 0));
        if (requestedQty > availableQty) {
          const unit = normalizeBaseUnitName(product.baseUnitName || product.unit || 'шт');
          throw new Error(
            `Нельзя продать больше остатка для "${product.name}". Доступно: ${availableQty} ${unit}, запрошено: ${requestedQty} ${unit}`,
          );
        }
      }

      // 1. Calculate totals
      let totalAmount = 0;
      for (const item of items) {
        const quantity = normalizeNonNegativeNumber(item.totalBaseUnits ?? item.quantity, 'Item quantity');
        const sellingPrice = normalizeMoney(normalizeNonNegativeNumber(item.sellingPrice, 'Item price'), 'Item price');
        const itemDiscount = normalizeNonNegativeNumber(item.discount || 0, 'Item discount');
        if (quantity <= 0) {
          throw new Error('Item quantity must be greater than zero');
        }

        const unitPriceAfterDiscount = sellingPrice * (1 - itemDiscount / 100);
        const unitPriceRounded = ceilMoney(unitPriceAfterDiscount);
        totalAmount += quantity * unitPriceRounded;
      }

      totalAmount = roundMoney(totalAmount);
      const netAmount = roundMoney(totalAmount - (totalAmount * normalizedDiscount / 100) + normalizedTax);
      const status = getInvoiceStatus(normalizedPaidAmount, Number(netAmount));

      // 2. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          customerId,
          userId,
          warehouseId,
          totalAmount,
          discount: normalizedDiscount,
          tax: normalizedTax,
          netAmount,
          paidAmount: normalizedPaidAmount,
          status,
          paymentDueDate: paymentDueDate ? new Date(paymentDueDate) : null,
          companyNameSnapshot: companyProfile?.name || null,
          companyCountrySnapshot: companyProfile?.country || null,
          companyRegionSnapshot: companyProfile?.region || null,
          companyCitySnapshot: companyProfile?.city || null,
          companyAddressSnapshot: companyProfile?.addressLine || null,
          customerNameSnapshot: customer.name,
          customerPhoneSnapshot: customer.phone || null,
          customerAddressSnapshot: buildCustomerAddressSnapshot(customer),
        },
      });

      // 3. Create Items and Allocate Stock
      for (const item of items) {
        const quantity = normalizeNonNegativeNumber(item.totalBaseUnits ?? item.quantity, 'Item quantity');
        const sellingPrice = normalizeMoney(normalizeNonNegativeNumber(item.sellingPrice, 'Item price'), 'Item price');
        const product = productsById.get(item.productId);

        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }

        if (Number(product.warehouseId) !== Number(warehouseId)) {
          throw new Error(`Товар ${product.name} не принадлежит выбранному складу`);
        }

        const packaging = item.packagingId
          ? product.packagings.find((entry: any) => entry.id === Number(item.packagingId))
          : product.packagings.find((entry: any) => entry.isDefault) || product.packagings[0] || null;

        const packageQuantity =
          item.packageQuantity !== undefined && item.packageQuantity !== null
            ? normalizeNonNegativeNumber(item.packageQuantity, 'Package quantity')
            : null;
        const extraUnitQuantity =
          item.extraUnitQuantity !== undefined && item.extraUnitQuantity !== null
            ? normalizeNonNegativeNumber(item.extraUnitQuantity, 'Extra unit quantity')
            : 0;
        const baseUnitName = normalizeBaseUnitName(item.baseUnitName || packaging?.baseUnitName || product.baseUnitName || product.unit);

        // Create item first with placeholder costPrice
        const invoiceItem = await tx.invoiceItem.create({
          data: {
            invoiceId: invoice.id,
            productId: item.productId,
            quantity,
            totalBaseUnits: quantity,
            packageQuantity,
            extraUnitQuantity,
            packagingId: packaging?.id || null,
            packageNameSnapshot: item.packageName || packaging?.packageName || null,
            baseUnitNameSnapshot: baseUnitName,
            unitsPerPackageSnapshot: item.unitsPerPackage || packaging?.unitsPerPackage || null,
            productNameSnapshot: item.productName || product.name,
            rawNameSnapshot: item.rawName || product.rawName || null,
            brandSnapshot: item.brand || product.brand || null,
            sellingPrice,
            discount: normalizeNonNegativeNumber(item.discount || 0, 'Item discount'),
            totalPrice: roundMoney(quantity * ceilMoney(sellingPrice * (1 - (normalizeNonNegativeNumber(item.discount || 0, 'Item discount') / 100)))),
          },
        });

        // FIFO Allocation and get average cost
        const avgCost = await StockService.allocateStock(item.productId, warehouseId, quantity, invoiceItem.id, tx);
        
        // Update item with actual cost
        await tx.invoiceItem.update({
          where: { id: invoiceItem.id },
          data: { costPrice: avgCost }
        });

        // Record Inventory Transaction
        await tx.inventoryTransaction.create({
          data: {
            productId: item.productId,
            warehouseId,
            userId,
            qtyChange: -quantity,
            type: 'outgoing',
            reason: `Invoice #${invoice.id}`,
            referenceId: invoice.id,
            costAtTime: avgCost,
            sellingAtTime: sellingPrice
          }
        });
      }

      // 4. Record Payment if any
      if (normalizedPaidAmount > 0) {
        await tx.payment.create({
          data: {
            customerId,
            invoiceId: invoice.id,
            userId,
            amount: roundMoney(normalizedPaidAmount),
            method: paymentMethod,
          },
        });
      }

      return invoice;
    }, {
      maxWait: 10000,
      timeout: 120000,
    });
  }

  static async reassignCustomer(invoiceId: number, customerId: number) {
    return await prisma.$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, customerId: true },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      const customer = await tx.customer.findUnique({
        where: { id: customerId },
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId,
          customerNameSnapshot: customer.name,
          customerPhoneSnapshot: customer.phone || null,
          customerAddressSnapshot: buildCustomerAddressSnapshot(customer),
        },
      });

      await tx.payment.updateMany({
        where: { invoiceId },
        data: { customerId },
      });

      await tx.return.updateMany({
        where: { invoiceId },
        data: { customerId },
      });

      return tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          user: true,
          warehouse: true,
          items: true,
        },
      });
    }, {
      maxWait: 10000,
      timeout: 120000,
    });
  }

  static async updateInvoice(invoiceId: number, data: {
    customerId: number;
    userId: number;
    isAdmin?: boolean;
    items: {
      productId: number;
      quantity: number;
      totalBaseUnits?: number;
      sellingPrice: number;
      packageQuantity?: number | null;
      extraUnitQuantity?: number | null;
      packagingId?: number | null;
      packageName?: string | null;
      baseUnitName?: string | null;
      unitsPerPackage?: number | null;
      productName?: string | null;
      rawName?: string | null;
      brand?: string | null;
      discount?: number;
    }[];
    discount?: number;
  }) {
    const { customerId, userId, items, isAdmin = false } = data;

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Invoice must contain at least one item');
    }

    await prisma.$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
          payments: true,
          returns: true,
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.cancelled && !isAdmin) {
        throw new Error('Cancelled invoice cannot be edited');
      }

      if (
        !isAdmin &&
        (
          (Array.isArray(invoice.returns) && invoice.returns.length > 0) ||
          Number(invoice.returnedAmount || 0) > PAYMENT_EPSILON
        )
      ) {
        throw new Error('Нельзя менять товары в накладной после оплаты или возврата');
      }

      if (
        !isAdmin &&
        (
          (Array.isArray(invoice.payments) && invoice.payments.length > 0) ||
          Number(invoice.paidAmount || 0) > PAYMENT_EPSILON
        )
      ) {
        throw new Error('Нельзя менять товары в накладной после оплаты или возврата');
      }

      let customer: any = null;
      if (customerId) {
        customer = await tx.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
          throw new Error('Customer not found');
        }
      } else {
        customer = { name: 'Anonymous', phone: null, city: null, addressLine: null };
      }

      const productIds = [...new Set(items.map((item) => Number(item.productId)))];
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          warehouseId: invoice.warehouseId,
          active: true,
        },
        include: {
          packagings: {
            where: { active: true },
          },
        },
      }) as any[];

      const productsById = new Map<number, any>(products.map((product: any) => [product.id, product]));

      if (products.length !== productIds.length) {
        throw new Error('Один или несколько товаров не принадлежат выбранному складу');
      }

      const requestedByProduct = buildRequestedQuantityByProduct(items);
      const originalByProduct = new Map<number, number>();
      for (const existingItem of invoice.items) {
        const productId = Number(existingItem.productId);
        const current = originalByProduct.get(productId) || 0;
        originalByProduct.set(productId, roundMoney(current + Number(existingItem.totalBaseUnits ?? existingItem.quantity ?? 0)));
      }

      for (const [productId, requestedQty] of requestedByProduct.entries()) {
        const product = productsById.get(productId);
        if (!product) {
          continue;
        }

        const availableNow = Math.max(0, Number(product.stock || 0));
        const originalQty = Math.max(0, Number(originalByProduct.get(productId) || 0));
        const availableForEdit = roundMoney(availableNow + originalQty);

        if (requestedQty > availableForEdit) {
          const unit = normalizeBaseUnitName(product.baseUnitName || product.unit || 'шт');
          throw new Error(
            `Нельзя продать больше остатка для "${product.name}". Доступно: ${availableForEdit} ${unit}, запрошено: ${requestedQty} ${unit}`,
          );
        }
      }

      let totalAmount = 0;
      for (const item of items) {
        const quantity = normalizeNonNegativeNumber(item.totalBaseUnits ?? item.quantity, 'Item quantity');
        const sellingPrice = normalizeMoney(normalizeNonNegativeNumber(item.sellingPrice, 'Item price'), 'Item price');
        const itemDiscount = normalizeNonNegativeNumber(item.discount || 0, 'Item discount');

        if (quantity <= 0) {
          throw new Error('Item quantity must be greater than zero');
        }

        const unitPriceAfterDiscount = sellingPrice * (1 - itemDiscount / 100);
        const unitPriceRounded = ceilMoney(unitPriceAfterDiscount);
        totalAmount += quantity * unitPriceRounded;
      }

      totalAmount = roundMoney(totalAmount);
      const normalizedDiscount = normalizeMoney(normalizeNonNegativeNumber(Number(data.discount !== undefined ? data.discount : invoice.discount || 0), 'Discount'), 'Discount');
      const normalizedTax = normalizeMoney(normalizeNonNegativeNumber(Number(invoice.tax || 0), 'Tax'), 'Tax');
      const netAmount = roundMoney(totalAmount - (totalAmount * normalizedDiscount / 100) + normalizedTax);
      const affectedProductIds = new Set<number>();

      for (const existingItem of invoice.items) {
        affectedProductIds.add(Number(existingItem.productId));
        await StockService.deallocateStock(existingItem.id, undefined, undefined, tx, false);
      }

      await tx.return.deleteMany({
        where: { invoiceId },
      });

      await tx.inventoryTransaction.deleteMany({
        where: {
          referenceId: invoiceId,
          type: { in: ['outgoing', 'return'] }
        },
      });



      await tx.invoiceItem.deleteMany({
        where: { invoiceId },
      });

      for (const item of items) {
        const quantity = normalizeNonNegativeNumber(item.totalBaseUnits ?? item.quantity, 'Item quantity');
        const sellingPrice = normalizeMoney(normalizeNonNegativeNumber(item.sellingPrice, 'Item price'), 'Item price');
        const product = productsById.get(Number(item.productId));

        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }

        const packaging = item.packagingId
          ? product.packagings.find((entry: any) => entry.id === Number(item.packagingId))
          : product.packagings.find((entry: any) => entry.isDefault) || product.packagings[0] || null;

        const packageQuantity =
          item.packageQuantity !== undefined && item.packageQuantity !== null
            ? normalizeNonNegativeNumber(item.packageQuantity, 'Package quantity')
            : null;
        const extraUnitQuantity =
          item.extraUnitQuantity !== undefined && item.extraUnitQuantity !== null
            ? normalizeNonNegativeNumber(item.extraUnitQuantity, 'Extra unit quantity')
            : 0;
        const baseUnitName = normalizeBaseUnitName(item.baseUnitName || packaging?.baseUnitName || product.baseUnitName || product.unit);

        const invoiceItem = await tx.invoiceItem.create({
          data: {
            invoiceId,
            productId: Number(item.productId),
            quantity,
            totalBaseUnits: quantity,
            packageQuantity,
            extraUnitQuantity,
            packagingId: packaging?.id || null,
            packageNameSnapshot: item.packageName || packaging?.packageName || null,
            baseUnitNameSnapshot: baseUnitName,
            unitsPerPackageSnapshot: item.unitsPerPackage || packaging?.unitsPerPackage || null,
            productNameSnapshot: item.productName || product.name,
            rawNameSnapshot: item.rawName || product.rawName || null,
            brandSnapshot: item.brand || product.brand || null,
            sellingPrice,
            discount: normalizeNonNegativeNumber(item.discount || 0, 'Item discount'),
            totalPrice: roundMoney(quantity * ceilMoney(sellingPrice * (1 - (normalizeNonNegativeNumber(item.discount || 0, 'Item discount') / 100)))),
          },
        });

        const avgCost = await StockService.allocateStock(Number(item.productId), Number(invoice.warehouseId), quantity, invoiceItem.id, tx);
        await tx.invoiceItem.update({
          where: { id: invoiceItem.id },
          data: { costPrice: avgCost },
        });

        await tx.inventoryTransaction.create({
          data: {
            productId: Number(item.productId),
            warehouseId: Number(invoice.warehouseId),
            userId,
            qtyChange: -quantity,
            type: 'outgoing',
            reason: `Updated Invoice #${invoiceId}`,
            referenceId: invoiceId,
            costAtTime: avgCost,
            sellingAtTime: sellingPrice
          }
        });


        affectedProductIds.add(Number(item.productId));
      }

      for (const productId of affectedProductIds) {
        await StockService.updateProductStockCache(productId, tx);
      }

      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          customerId,
          customerNameSnapshot: customer.name,
          customerPhoneSnapshot: customer.phone || null,
          customerAddressSnapshot: buildCustomerAddressSnapshot(customer),
          totalAmount,
          discount: normalizedDiscount,
          netAmount,
          returnedAmount: 0,
          cancelled: isAdmin ? false : invoice.cancelled,
          status: getInvoiceStatus(Number(invoice.paidAmount || 0), Number(netAmount)),
        },
      });
    }, {
      maxWait: 10000,
      timeout: 120000,
    });

    return this.getInvoiceDetails(invoiceId);
  }

  /**
   * Cancels an invoice and returns stock.
   */
  static async cancelInvoice(invoiceId: number, userId: number, options?: { force?: boolean }) {
    const force = Boolean(options?.force);

    return await prisma.$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          items: true,
          payments: {
            select: { id: true },
          },
          returns: {
            select: { id: true },
          },
        },
      });

      if (!invoice || invoice.cancelled) {
        throw new Error('Invoice not found or already cancelled');
      }

      if (!force && ((invoice.payments?.length || 0) > 0 || Number(invoice.paidAmount || 0) > PAYMENT_EPSILON)) {
        throw new Error('Нельзя удалить накладную, по которой уже есть оплата');
      }

      if (!force && ((invoice.returns?.length || 0) > 0 || Number(invoice.returnedAmount || 0) > PAYMENT_EPSILON)) {
        throw new Error('Нельзя удалить накладную, по которой уже есть возврат');
      }

      // 1. Return stock for each item
      for (const item of invoice.items) {
        await StockService.deallocateStock(item.id, undefined, undefined, tx, false);
        await StockService.updateProductStockCache(item.productId, tx);
      }

      // 2. Mark invoice as cancelled
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { cancelled: true },
      });

      // 3. Record transaction
        for (const item of invoice.items) {
          await tx.inventoryTransaction.create({
            data: {
              productId: item.productId,
              warehouseId: invoice.warehouseId,
              userId,
              qtyChange: item.quantity,
              type: 'adjustment',
              reason: `Invoice #${invoiceId} Cancelled`,
              referenceId: invoiceId,
            },
          });
        }

      return { success: true };
    }, TRANSACTION_OPTIONS);
  }

  /**
   * Fetches full invoice details.
   */
  static async getInvoiceDetails(invoiceId: number) {
    const companyProfile = await prisma.companyProfile.findFirst({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    });

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        user: true,
        warehouse: true,
        items: {
          include: { 
            product: true,
            saleAllocations: {
              include: { batch: true }
            }
          }
        },
        payments: {
          include: { user: true }
        }
      }
    });

    if (!invoice) throw new Error('Invoice not found');

    const invoiceItems: any[] = Array.isArray(invoice.items) ? invoice.items : [];
    const invoicePayments: any[] = Array.isArray(invoice.payments) ? invoice.payments : [];
    const invoiceReturns: any[] = await prisma.return.findMany({
      where: { invoiceId },
      include: { user: true }
    });

    const normalizedItems = invoiceItems
      .map((item) => buildCurrentInvoiceItemSnapshot(item))
      .filter(Boolean)
      .map((item: any) => ({
      ...item,
      product_name: item.productNameSnapshot || item.product.name,
      unit: item.baseUnitNameSnapshot || item.product.baseUnitName || item.product.unit,
      quantityLabel: formatQuantityForInvoice({
        packageQuantity: item.packageQuantity,
        extraUnitQuantity: item.extraUnitQuantity,
        packageName: item.packageNameSnapshot,
        baseUnitName: item.baseUnitNameSnapshot || item.product.baseUnitName || item.product.unit,
        totalBaseUnits: item.totalBaseUnits ?? item.quantity,
      }),
    }));

    const normalizedPayments = invoicePayments.map((payment) => ({
      ...payment,
      method: payment.method,
      staff_name: payment.user.username
    }));

    const normalizedReturns = invoiceReturns.map((itemReturn) => ({
      ...itemReturn,
      staff_name: itemReturn.user.username
    }));

    return {
      ...invoice,
      customer_name: invoice.customerNameSnapshot || invoice.customer.name,
      customer_phone: invoice.customerPhoneSnapshot || invoice.customer.phone,
      customer_address: invoice.customerAddressSnapshot || buildCustomerAddressSnapshot(invoice.customer),
      company_name: companyProfile?.name || invoice.companyNameSnapshot,
      company_country: companyProfile?.country || invoice.companyCountrySnapshot,
      company_region: companyProfile?.region || invoice.companyRegionSnapshot,
      company_city: companyProfile?.city || invoice.companyCitySnapshot,
      company_address: companyProfile?.addressLine || invoice.companyAddressSnapshot,
      company_phone: companyProfile?.phone || null,
      company_note: companyProfile?.note || null,
      staff_name: invoice.user.username,
      items: normalizedItems,
      payments: normalizedPayments,
      returns: normalizedReturns
    };
  }

  /**
   * Handles partial returns.
   */
  static async returnItems(invoiceId: number, data: { items: { invoiceItemId: number; quantity: number }[]; reason: string; userId: number }) {
    const { items, reason, userId } = data;

    return await prisma.$transaction(async (tx: any) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { items: true }
      });

      if (!invoice) throw new Error('Invoice not found');
      if (invoice.cancelled) {
        throw new Error('Нельзя оформить возврат по отмененной накладной');
      }

      let totalRefundValue = 0;


      const affectedProductIds = new Set<number>();
      let processedReturnCount = 0;

      for (const returnItem of items) {
        const originalItem = invoice.items.find((i: any) => Number(i.id) === Number(returnItem.invoiceItemId));
        if (!originalItem) {
          throw new Error(`Строка накладной #${returnItem.invoiceItemId} не найдена`);
        }

        const normalizedQuantity = Number(returnItem.quantity || 0);
        if (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
          throw new Error(`Некорректное количество возврата для строки #${originalItem.id}`);
        }

        const availableToReturn = Math.max(0, Number(originalItem.quantity || 0) - Number(originalItem.returnedQty || 0));
        if (availableToReturn <= PAYMENT_EPSILON) {
          throw new Error(`Товар по строке #${originalItem.id} уже полностью возвращён`);
        }

        if (normalizedQuantity - availableToReturn > PAYMENT_EPSILON) {
          throw new Error(`Нельзя вернуть больше, чем было продано для строки #${originalItem.id}`);
        }

        // 1. Return stock to batches (FIFO reverse) - this ensures stock goes back to the same warehouse
        await StockService.deallocateStock(originalItem.id, normalizedQuantity, undefined, tx, false);
        affectedProductIds.add(Number(originalItem.productId));

        // 2. Record inventory transaction
        await tx.inventoryTransaction.create({
          data: {
            productId: Number(originalItem.productId),
            warehouseId: invoice.warehouseId,
            userId,
            qtyChange: normalizedQuantity,
            type: 'return',
            reason: `${reason} (Накладная #${invoiceId})`,
            referenceId: invoiceId,
            costAtTime: Number(originalItem.costPrice || 0),
            sellingAtTime: Number(originalItem.sellingPrice || 0),
          }
        });

        // 3. Update InvoiceItem returnedQty
        await tx.invoiceItem.update({
          where: { id: originalItem.id },
          data: { returnedQty: { increment: normalizedQuantity } }
        });

        // 4. Calculate refund value
        const itemDiscount = Number(originalItem.discount || 0);
        const globalDiscount = Number(invoice.discount || 0);
        
        // Value after item discount
        const discountedUnitPrice = Number(originalItem.sellingPrice) * (1 - itemDiscount / 100);
        // Value after global discount
        const finalUnitPrice = discountedUnitPrice * (1 - globalDiscount / 100);
        
        const lineRefundValue = roundMoney(finalUnitPrice * normalizedQuantity);
        totalRefundValue += lineRefundValue;
        processedReturnCount += 1;
      }

      if (processedReturnCount === 0) {
        throw new Error('Нет доступных товаров для возврата');
      }

      for (const productId of affectedProductIds) {
        await StockService.updateProductStockCache(productId, tx);
      }

      // 5. Create Return record
      await tx.return.create({
        data: {
          invoiceId,
          customerId: invoice.customerId,
          userId,
          reason,
          totalValue: roundMoney(totalRefundValue)
        }
      });

      // 6. Update invoice returned amount and net amount
      totalRefundValue = roundMoney(totalRefundValue);
      const newReturnedAmount = roundMoney(Number(invoice.returnedAmount) + totalRefundValue);
      const newNetAmount = Math.max(0, roundMoney(Number(invoice.netAmount) - totalRefundValue));
      const currentPaid = Number(invoice.paidAmount || 0);

      // Check if we need to return change (overpaid)
      if (currentPaid > newNetAmount + 0.01) {
        const changeToReturn = roundMoney(currentPaid - newNetAmount);
        // Create a negative payment record (Refund of excess cash/change)
        await tx.payment.create({
          data: {
            customerId: invoice.customerId,
            invoiceId,
            userId,
            amount: -changeToReturn,
            method: 'cash',
            notes: `Возврат сдачи (Накладная #${invoiceId})`
          }
        });

        await tx.invoice.update({
          where: { id: invoiceId },
          data: { 
            returnedAmount: newReturnedAmount,
            netAmount: newNetAmount,
            paidAmount: newNetAmount, // Cap it to the new net
            status: 'paid'
          }
        });
      } else {
        const status = getInvoiceStatus(currentPaid, Number(newNetAmount));
        await tx.invoice.update({
          where: { id: invoiceId },
          data: { 
            returnedAmount: newReturnedAmount,
            netAmount: newNetAmount,
            status
          }
        });
      }

      return { success: true, refundAmount: roundMoney(totalRefundValue) };
    }, TRANSACTION_OPTIONS);
  }
}
