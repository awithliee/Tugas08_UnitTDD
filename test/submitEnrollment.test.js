
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
    ports
  );

  assert.equal(result.code, "OK");
  assert.equal(result.enrollmentId, "ENR001");
});
