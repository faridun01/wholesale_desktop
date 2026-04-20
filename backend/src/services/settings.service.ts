import prisma from '../db/prisma.js';

export class SettingsService {
  static async getSettings() {
    const settings = await prisma.setting.findMany();
    return settings.reduce((acc: any, curr: any) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});
  }

  static async updateSetting(key: string, value: string) {
    return await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  static async getCategories() {
    return await prisma.category.findMany({
      where: { active: true },
      orderBy: { name: 'asc' }
    });
  }

  static async ensureCategory(name: string) {
    const normalizedName = String(name || '').trim();
    if (!normalizedName) {
      throw new Error('Category name is required');
    }

    const existing = await prisma.category.findFirst({
      where: {
        name: {
          equals: normalizedName,

        },
      },
    });

    if (existing) {
      if (!existing.active) {
        return prisma.category.update({
          where: { id: existing.id },
          data: { active: true, name: normalizedName },
        });
      }
      return existing;
    }

    return prisma.category.create({
      data: { name: normalizedName },
    });
  }
}
