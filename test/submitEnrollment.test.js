import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";

test("UT01: pendaftaran baru berhasil ketika kursi tersedia", async () => {
  // Data tiruan untuk menggantikan layanan kursi dan database
  const ports = {
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

test("UT02: permintaan yang sama tidak membuat pendaftaran kedua", async () => {
  let reserveCount = 0;
  let saveCount = 0;
  let enrollmentNumber = 0;

  const ports = {
    idempotency: {
      find: async () => null,
      reserve: async () => ({ token: "TOKEN001" }),
      complete: async () => {},
      abort: async () => {},
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
