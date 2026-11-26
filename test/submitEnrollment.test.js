import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";

// UT01: Pendaftaran baru berhasil
test("UT01: pendaftaran baru berhasil ketika kursi tersedia", async () => {
  const records = new Map();

  const ports = {
    idempotency: {
      find: async () => null,

      reserve: async () => ({ token: "TOKEN001" }),

      complete: async () => {},

      abort: async () => {},
    },

    seat: {
      tryReserve: async (classId) => ({
        classId,
        reservationId: "RES001",
      }),

      release: async () => {},
    },

    enrollment: {
      save: async (record) => ({
        id: "ENR001",
        ...record,
      }),
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "abcdefghijklmnop",
    },
    ports,
  );

  assert.equal(result.code, "OK");
  assert.equal(result.enrollmentId, "ENR001");
});

// UT02: Replay tidak membuat pendaftaran kedua
test("UT02: permintaan yang sama tidak membuat pendaftaran kedua", async () => {
  let reserveCount = 0;
  let saveCount = 0;
  let enrollmentNumber = 0;

  // Penyimpanan tiruan untuk idempotency
  const records = new Map();

  const getKey = (scope, key) => `${scope}:${key}`;

  const ports = {
    idempotency: {
      find: async (scope, key) => {
        const record = records.get(getKey(scope, key));

        return record?.result ? record : null;
      },

      reserve: async (scope, key, fingerprint) => {
        const storageKey = getKey(scope, key);

        if (records.has(storageKey)) {
          return null;
        }

        const token = { scope, key };

        records.set(storageKey, {
          fingerprint,
          result: null,
          token,
        });

        return token;
      },

      complete: async (token, result) => {
        const record = records.get(getKey(token.scope, token.key));

        record.result = result;
      },

      abort: async (token) => {
        records.delete(getKey(token.scope, token.key));
      },
    },

    seat: {
      tryReserve: async (classId) => {
        reserveCount++;

        return {
          classId,
          reservationId: "RES001",
        };
      },

      release: async () => {},
    },

    enrollment: {
      save: async (record) => {
        saveCount++;
        enrollmentNumber++;

        return {
          id: `ENR00${enrollmentNumber}`,
          ...record,
        };
      },
    },
  };

  const input = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(input, ports);
  const secondResult = await submitEnrollment(input, ports);

  assert.deepEqual(secondResult, firstResult);
  assert.equal(reserveCount, 1);
  assert.equal(saveCount, 1);
});

test("UT03: key yang sama dengan kelas berbeda menghasilkan conflict", async () => {
  const records = new Map();
  let reserveCount = 0;
  let saveCount = 0;

  const getKey = (scope, key) => `${scope}:${key}`;

  const ports = {
    idempotency: {
      find: async (scope, key) => {
        const record = records.get(getKey(scope, key));
        return record?.result ? record : null;
      },

      reserve: async (scope, key, fingerprint) => {
        const storageKey = getKey(scope, key);

        if (records.has(storageKey)) return null;

        const token = { scope, key };

        records.set(storageKey, {
          fingerprint,
          result: null,
          token,
        });

        return token;
      },

      complete: async (token, result) => {
        records.get(getKey(token.scope, token.key)).result = result;
      },

      abort: async (token) => {
        records.delete(getKey(token.scope, token.key));
      },
    },

    seat: {
      tryReserve: async (classId) => {
        reserveCount++;
        return { classId, reservationId: "RES001" };
      },
      release: async () => {},
    },

    enrollment: {
      save: async (record) => {
        saveCount++;
        return { id: "ENR001", ...record };
      },
    },
  };

  const firstInput = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const secondInput = {
    ...firstInput,
    classId: "KLS002",
  };

  const firstResult = await submitEnrollment(firstInput, ports);
  const secondResult = await submitEnrollment(secondInput, ports);

  assert.equal(firstResult.code, "OK");
  assert.equal(secondResult.code, "IDEMPOTENCY_CONFLICT");
  assert.equal(reserveCount, 1);
  assert.equal(saveCount, 1);
});

// UT04: Kelas penuh tidak membuat pendaftaran
test("UT04: kelas penuh tidak membuat pendaftaran", async () => {
  let saveCount = 0;
  let abortCount = 0;

  const ports = {
    idempotency: {
      find: async () => null,

      reserve: async () => ({
        token: "TOKEN004",
      }),

      complete: async () => {},

      abort: async () => {
        abortCount++;
      },
    },

    seat: {
      tryReserve: async () => null,

      release: async () => {},
    },

    enrollment: {
      save: async () => {
        saveCount++;
        return { id: "ENR004" };
      },
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "abcdefghijklmnop",
    },
    ports,
  );

  assert.equal(result.code, "CLASS_FULL");
  assert.equal(saveCount, 0);
  assert.equal(abortCount, 1);
});

test("UT05: kegagalan penyimpanan mengembalikan kursi dan membatalkan klaim", async () => {
  let releaseCount = 0;
  let abortCount = 0;

  const ports = {
    idempotency: {
      find: async () => null,

      reserve: async () => ({
        token: "TOKEN005",
      }),

      complete: async () => {},

      abort: async () => {
        abortCount++;
      },
    },

    seat: {
      tryReserve: async () => ({
        classId: "KLS001",
        reservationId: "RES005",
      }),

      release: async () => {
        releaseCount++;
      },
    },

    enrollment: {
      save: async () => {
        throw new Error("Simulasi database gagal");
      },
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "abcdefghijklmnop",
    },
    ports,
  );

  assert.equal(result.code, "SAVE_FAILED");
  assert.equal(releaseCount, 1);
  assert.equal(abortCount, 1);
});

test("UT06: percobaan ulang berhasil setelah penyimpanan gagal", async () => {
  const records = new Map();
  let saveCount = 0;
  let seatCount = 0;

  const getKey = (scope, key) => `${scope}:${key}`;

  const ports = {
    idempotency: {
      find: async (scope, key) => {
        const record = records.get(getKey(scope, key));
        return record?.result ? record : null;
      },

      reserve: async (scope, key, fingerprint) => {
        const storageKey = getKey(scope, key);

        if (records.has(storageKey)) return null;

        const token = { scope, key };

        records.set(storageKey, {
          fingerprint,
          result: null,
          token,
        });

        return token;
      },

      complete: async (token, result) => {
        records.get(getKey(token.scope, token.key)).result = result;
      },

      abort: async (token) => {
        records.delete(getKey(token.scope, token.key));
      },
    },

    seat: {
      tryReserve: async (classId) => {
        seatCount++;

        return {
          classId,
          reservationId: `RES00${seatCount}`,
        };
      },

      release: async () => {},
    },

    enrollment: {
      save: async (record) => {
        saveCount++;

        if (saveCount === 1) {
          throw new Error("Simulasi database gagal");
        }

        return {
          id: "ENR006",
          ...record,
        };
      },
    },
  };

  const input = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(input, ports);
  const secondResult = await submitEnrollment(input, ports);

  assert.equal(firstResult.code, "SAVE_FAILED");
  assert.equal(secondResult.code, "OK");
  assert.equal(secondResult.enrollmentId, "ENR006");
  assert.equal(seatCount, 2);
  assert.equal(saveCount, 2);
});

test("UT07: key dengan panjang 15 karakter ditolak", async () => {
  let mutationCount = 0;

  const ports = {
    idempotency: {
      find: async () => null,

      reserve: async () => {
        mutationCount++;
        return { token: "TOKEN007" };
      },

      complete: async () => {
        mutationCount++;
      },

      abort: async () => {
        mutationCount++;
      },
    },

    seat: {
      tryReserve: async () => {
        mutationCount++;
        return { reservationId: "RES007" };
      },

      release: async () => {
        mutationCount++;
      },
    },

    enrollment: {
      save: async () => {
        mutationCount++;
        return { id: "ENR007" };
      },
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "123456789012345",
    },
    ports,
  );

  assert.equal(result.code, "INVALID_KEY");
  assert.equal(mutationCount, 0);
});

test("UT08: key dengan panjang 16 karakter diterima", async () => {
  const ports = {
    idempotency: {
      find: async () => null,
      reserve: async () => ({ token: "TOKEN008" }),
      complete: async () => {},
      abort: async () => {},
    },

    seat: {
      tryReserve: async (classId) => ({
        classId,
        reservationId: "RES008",
      }),
      release: async () => {},
    },

    enrollment: {
      save: async (record) => ({
        id: "ENR008",
        ...record,
      }),
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "1234567890123456",
    },
    ports,
  );

  assert.equal(result.code, "OK");
  assert.equal(result.enrollmentId, "ENR008");
});

test("UT09: key dengan panjang 64 karakter diterima", async () => {
  const ports = {
    idempotency: {
      find: async () => null,
      reserve: async () => ({ token: "TOKEN009" }),
      complete: async () => {},
      abort: async () => {},
    },

    seat: {
      tryReserve: async (classId) => ({
        classId,
        reservationId: "RES009",
      }),
      release: async () => {},
    },

    enrollment: {
      save: async (record) => ({
        id: "ENR009",
        ...record,
      }),
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey:
        "1234567890123456789012345678901234567890123456789012345678901234",
    },
    ports,
  );

  assert.equal(result.code, "OK");
  assert.equal(result.enrollmentId, "ENR009");
});

test("UT10: key dengan panjang 65 karakter ditolak", async () => {
  let mutationCount = 0;

  const ports = {
    idempotency: {
      find: async () => null,

      reserve: async () => {
        mutationCount++;
        return { token: "TOKEN010" };
      },

      complete: async () => {
        mutationCount++;
      },

      abort: async () => {
        mutationCount++;
      },
    },

    seat: {
      tryReserve: async () => {
        mutationCount++;
        return { reservationId: "RES010" };
      },

      release: async () => {
        mutationCount++;
      },
    },

    enrollment: {
      save: async () => {
        mutationCount++;
        return { id: "ENR010" };
      },
    },
  };

  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey:
        "12345678901234567890123456789012345678901234567890123456789012345",
    },
    ports,
  );

  assert.equal(result.code, "INVALID_KEY");
  assert.equal(mutationCount, 0);
});

test("UT11: key sama pada mahasiswa berbeda tidak menggunakan hasil lama", async () => {
  const records = new Map();
  let saveCount = 0;

  const getKey = (scope, key) => `${scope}:${key}`;

  const ports = {
    idempotency: {
      find: async (scope, key) => {
        const record = records.get(getKey(scope, key));
        return record?.result ? record : null;
      },

      reserve: async (scope, key, fingerprint) => {
        const storageKey = getKey(scope, key);

        if (records.has(storageKey)) return null;

        const token = { scope, key };

        records.set(storageKey, {
          fingerprint,
          result: null,
          token,
        });

        return token;
      },

      complete: async (token, result) => {
        records.get(getKey(token.scope, token.key)).result = result;
      },

      abort: async (token) => {
        records.delete(getKey(token.scope, token.key));
      },
    },

    seat: {
      tryReserve: async (classId) => ({
        classId,
        reservationId: "RES011",
      }),

      release: async () => {},
    },

    enrollment: {
      save: async (record) => {
        saveCount++;

        return {
          id: `ENR00${saveCount}`,
          ...record,
        };
      },
    },
  };

  const input = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(input, ports);

  const secondResult = await submitEnrollment(
    {
      ...input,
      studentId: "MHS002",
    },
    ports,
  );

  assert.equal(firstResult.code, "OK");
  assert.equal(secondResult.code, "OK");
  assert.notEqual(firstResult.enrollmentId, secondResult.enrollmentId);
  assert.equal(saveCount, 2);
});

test("UT12: replay tetap mengembalikan hasil pertama meskipun kelas sudah penuh", async () => {
  const records = new Map();
  let seatCount = 0;
  let saveCount = 0;

  const getKey = (scope, key) => `${scope}:${key}`;

  const ports = {
    idempotency: {
      find: async (scope, key) => {
        const record = records.get(getKey(scope, key));
        return record?.result ? record : null;
      },

      reserve: async (scope, key, fingerprint) => {
        const storageKey = getKey(scope, key);

        if (records.has(storageKey)) return null;

        const token = { scope, key };

        records.set(storageKey, {
          fingerprint,
          result: null,
          token,
        });

        return token;
      },

      complete: async (token, result) => {
        records.get(getKey(token.scope, token.key)).result = result;
      },

      abort: async (token) => {
        records.delete(getKey(token.scope, token.key));
      },
    },

    seat: {
      tryReserve: async (classId) => {
        seatCount++;

        if (seatCount === 1) {
          return {
            classId,
            reservationId: "RES012",
          };
        }

        return null;
      },

      release: async () => {},
    },

    enrollment: {
      save: async (record) => {
        saveCount++;

        return {
          id: "ENR012",
          ...record,
        };
      },
    },
  };

  const input = {
    studentId: "MHS001",
    classId: "KLS001",
    term: "2026-GANJIL",
    idempotencyKey: "abcdefghijklmnop",
  };

  const firstResult = await submitEnrollment(input, ports);
  const secondResult = await submitEnrollment(input, ports);

  assert.equal(firstResult.code, "OK");
  assert.deepEqual(secondResult, firstResult);
  assert.equal(seatCount, 1);
  assert.equal(saveCount, 1);
});
