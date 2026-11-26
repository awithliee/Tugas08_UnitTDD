
import test from "node:test";
import assert from "node:assert/strict";

import { submitEnrollment } from "../src/submitEnrollment.js";

test("UT01: pendaftaran baru berhasil ketika kursi tersedia", async () => {
  const result = await submitEnrollment(
    {
      studentId: "MHS001",
      classId: "KLS001",
      term: "2026-GANJIL",
      idempotencyKey: "abcdefghijklmnop",
    },
    {}
  );

  assert.equal(result.code, "OK");
});
