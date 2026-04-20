import prisma from '../db/prisma.js';

export type ReminderActor = {
  userId: number;
  isAdmin: boolean;
};

const createHttpError = (message: string, status: number) =>
  Object.assign(new Error(message), { status });

export class ReminderService {
  static async getReminders(actor: ReminderActor) {
    return await prisma.reminder.findMany({
      where: actor.isAdmin ? undefined : { userId: actor.userId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  static async createReminder(data: {
    userId: number;
    title: string;
    description?: string;
    dueDate: string;
    type?: string;
    referenceId?: number;
  }) {
    return await prisma.reminder.create({
      data: {
        ...data,
        dueDate: new Date(data.dueDate),
      },
    });
  }

  static async completeReminder(id: number) {
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) {
      throw createHttpError('Reminder not found', 404);
    }

    return await prisma.reminder.update({
      where: { id },
      data: { isCompleted: true },
    });
  }

  static async completeReminderForActor(id: number, actor: ReminderActor) {
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder || (!actor.isAdmin && reminder.userId !== actor.userId)) {
      throw createHttpError('Reminder not found', 404);
    }

    return await prisma.reminder.update({
      where: { id },
      data: { isCompleted: true },
    });
  }

  static async updateReminder(id: number, data: {
    title?: string;
    description?: string;
    dueDate?: string;
    type?: string;
    isCompleted?: boolean;
  }) {
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) {
      throw createHttpError('Reminder not found', 404);
    }

    return await prisma.reminder.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
  }

  static async updateReminderForActor(id: number, actor: ReminderActor, data: {
    title?: string;
    description?: string;
    dueDate?: string;
    type?: string;
    isCompleted?: boolean;
  }) {
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder || (!actor.isAdmin && reminder.userId !== actor.userId)) {
      throw createHttpError('Reminder not found', 404);
    }

    return await prisma.reminder.update({
      where: { id },
      data: {
        ...data,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
  }

  static async deleteReminder(id: number) {
    const reminder = await prisma.reminder.findUnique({ where: { id } });
    if (!reminder) {
      throw createHttpError('Reminder not found', 404);
    }

    return await prisma.reminder.delete({
      where: { id },
    });
  }
}
