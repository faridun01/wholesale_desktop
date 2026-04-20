import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const categoryNames = [
  'Стиральные порошки',
  'Стиральные средства',
  'Жидкие средства для стирки',
  'Средства для мытья посуды',
  'Гели для посуды',
  'Чистящие средства',
  'Средства для уборки',
  'Средства личной гигиены',
  'Шампуни и уход',
  'Мыло и антисептики',
  'Бумажная продукция',
  'Салфетки и расходники',
  'Хозяйственные товары',
  'Прочее',
];

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();

const detectCategoryName = (productName) => {
  const name = normalize(productName);

  if (name.includes('порошок') && name.includes('автомат')) return 'Стиральные порошки';
  if (name.includes('порошок') && (name.includes('ручной') || name.includes('активатор'))) return 'Стиральные средства';
  if ((name.includes('жидк') || name.includes('гель')) && name.includes('стира')) return 'Жидкие средства для стирки';
  if (name.includes('гель') && name.includes('посуд')) return 'Гели для посуды';
  if (name.includes('капля') && name.includes('посуд')) return 'Средства для мытья посуды';
  if (name.includes('посуд')) return 'Средства для мытья посуды';
  if (name.includes('чистящ')) return 'Чистящие средства';
  if (name.includes('уборк') || name.includes('отбел') || name.includes('пятновывод')) return 'Средства для уборки';
  if (name.includes('шампун') || name.includes('бальзам') || name.includes('кондиционер')) return 'Шампуни и уход';
  if (name.includes('мыло') || name.includes('антисеп')) return 'Мыло и антисептики';
  if (name.includes('бумаг') || name.includes('полотен') || name.includes('туалет')) return 'Бумажная продукция';
  if (name.includes('салфет') || name.includes('пакет') || name.includes('перчат')) return 'Салфетки и расходники';
  if (name.includes('щетк') || name.includes('губк') || name.includes('тряпк') || name.includes('хозяй')) return 'Хозяйственные товары';

  return 'Прочее';
};

const ensureCategory = async (name) => {
  const existing = await prisma.category.findFirst({
    where: {
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
  });

  if (existing) {
    if (!existing.active) {
      return prisma.category.update({
        where: { id: existing.id },
        data: { active: true, name },
      });
    }

    return existing;
  }

  return prisma.category.create({
    data: { name },
  });
};

const run = async () => {
  for (const categoryName of categoryNames) {
    await ensureCategory(categoryName);
  }

  const categories = await prisma.category.findMany({
    where: { active: true },
    select: { id: true, name: true },
  });

  const categoryByName = new Map(
    categories.map((category) => [normalize(category.name), category])
  );

  const products = await prisma.product.findMany({
    where: { active: true },
    include: { category: true },
    orderBy: { id: 'asc' },
  });

  const updates = [];

  for (const product of products) {
    const targetCategoryName = detectCategoryName(product.name);
    const targetCategory = categoryByName.get(normalize(targetCategoryName));

    if (!targetCategory) {
      throw new Error(`Category not found: ${targetCategoryName}`);
    }

    if (product.categoryId !== targetCategory.id) {
      await prisma.product.update({
        where: { id: product.id },
        data: { categoryId: targetCategory.id },
      });

      updates.push({
        id: product.id,
        name: product.name,
        from: product.category?.name || null,
        to: targetCategory.name,
      });
    }
  }

  console.log(JSON.stringify({
    updatedCount: updates.length,
    updates,
  }, null, 2));
};

run()
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
