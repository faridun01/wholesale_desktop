import assert from 'node:assert/strict';

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };

  return res;
};

const tests: Array<{ name: string; run: () => Promise<void> }> = [
  {
    name: 'authenticate returns 401 for malformed cookie without throwing',
    run: async () => {
      process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
      const { authenticate } = await import('./auth.middleware.js');

      const req = {
        headers: {
          cookie: 'auth_token=%E0%A4%A',
        },
      } as any;
      const res = createMockResponse();
      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      await authenticate(req, res as any, next as any);

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'Invalid token' });
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
    throw new Error(`${failed} auth middleware test(s) failed`);
  }

  console.log(`All auth middleware tests passed: ${tests.length}`);
};

await main();

