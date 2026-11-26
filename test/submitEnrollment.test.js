
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
    ports
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
        const record = records.get(
          getKey(token.scope, token.key)
        );

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
