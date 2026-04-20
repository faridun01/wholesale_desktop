import assert from 'node:assert/strict';
import prisma from '../db/prisma.js';
import { ReminderService } from './reminder.service.js';

type ReminderRecord = {
  id: number;
  userId: number;
  title: string;
  dueDate: Date;
  isCompleted: boolean;
};

const makeReminderRepo = (records: ReminderRecord[]) => {
  const calls: {
    findMany: any[];
    findUnique: any[];
    update: any[];
  } = {
    findMany: [],
    findUnique: [],
    update: [],
  };

  return {
    calls,
    findMany: async (args: any) => {
      calls.findMany.push(args);
      const scopedUserId = args?.where?.userId;
      if (!scopedUserId) {
        return records;
      }
      return records.filter((record) => record.userId === scopedUserId);
    },
    findUnique: async (args: any) => {
      calls.findUnique.push(args);
      return records.find((record) => record.id === args?.where?.id) ?? null;
    },
    update: async (args: any) => {
      calls.update.push(args);
      const record = records.find((item) => item.id === args?.where?.id);
      if (!record) {
        throw new Error('Reminder not found');
      }
      if (typeof args?.data?.isCompleted === 'boolean') {
        record.isCompleted = args.data.isCompleted;
      }
      if (args?.data?.title) {
        record.title = String(args.data.title);
      }
      if (args?.data?.dueDate instanceof Date) {
        record.dueDate = args.data.dueDate;
      }
      return record;
    },
  };
};

const withMockedReminderRepo = async (
  records: ReminderRecord[],
  run: (repo: ReturnType<typeof makeReminderRepo>) => Promise<void>
) => {
  const repo = makeReminderRepo(records);
  const reminderRepo = prisma.reminder as any;
  const original = {
    findMany: reminderRepo.findMany,
    findUnique: reminderRepo.findUnique,
    update: reminderRepo.update,
  };

  reminderRepo.findMany = repo.findMany;
  reminderRepo.findUnique = repo.findUnique;
  reminderRepo.update = repo.update;

  try {
    await run(repo);
  } finally {
    reminderRepo.findMany = original.findMany;
    reminderRepo.findUnique = original.findUnique;
    reminderRepo.update = original.update;
  }
};

const tests: Array<{ name: string; run: () => Promise<void> }> = [
  {
    name: 'getReminders limits non-admin access to own reminders',
    run: async () => {
      await withMockedReminderRepo(
        [
          { id: 1, userId: 10, title: 'mine', dueDate: new Date(), isCompleted: false },
          { id: 2, userId: 20, title: 'other', dueDate: new Date(), isCompleted: false },
        ],
        async (repo) => {
          const result = await ReminderService.getReminders({ userId: 10, isAdmin: false });
          assert.equal(result.length, 1);
          assert.equal(result[0].id, 1);
          assert.deepEqual(repo.calls.findMany[0].where, { userId: 10 });
        }
      );
    },
  },
  {
    name: 'updateReminderForActor denies access to foreign reminder for non-admin',
    run: async () => {
      await withMockedReminderRepo(
        [{ id: 2, userId: 20, title: 'other', dueDate: new Date(), isCompleted: false }],
        async (repo) => {
          await assert.rejects(
            ReminderService.updateReminderForActor(
              2,
              { userId: 10, isAdmin: false },
              { title: 'hacked' }
            ),
            (error: any) => error?.status === 404
          );
          assert.equal(repo.calls.update.length, 0);
        }
      );
    },
  },
  {
    name: 'updateReminderForActor allows owner and updates reminder',
    run: async () => {
      await withMockedReminderRepo(
        [{ id: 1, userId: 10, title: 'mine', dueDate: new Date(), isCompleted: false }],
        async (repo) => {
          const result = await ReminderService.updateReminderForActor(
            1,
            { userId: 10, isAdmin: false },
            { title: 'updated title' }
          );
          assert.equal(result.title, 'updated title');
          assert.equal(repo.calls.update.length, 1);
        }
      );
    },
  },
  {
    name: 'completeReminderForActor allows admin to complete any reminder',
    run: async () => {
      await withMockedReminderRepo(
        [{ id: 5, userId: 99, title: 'other', dueDate: new Date(), isCompleted: false }],
        async () => {
          const result = await ReminderService.completeReminderForActor(5, {
            userId: 1,
            isAdmin: true,
          });
          assert.equal(result.isCompleted, true);
        }
      );
    },
  },
];

const main = async () => {
  let failed = 0;

  for (const testCase of tests) {
    try {
      await testCase.run();
      console.log(`PASS: ${testCase.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${testCase.name}`);
      console.error(error);
    }
  }

  if (failed > 0) {
    process.exitCode = 1;
    throw new Error(`${failed} reminder access test(s) failed`);
  }

  console.log(`All reminder access tests passed: ${tests.length}`);
};

await main();

