export async function submitEnrollment(input, ports) {
  // Validasi panjang idempotency key
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 16 ||
    input.idempotencyKey.length > 64
  ) {
    return { code: "INVALID_KEY" };
  }

  const scope = `${input.studentId}:${input.term}`;

  const fingerprint = JSON.stringify({
    studentId: input.studentId,
    classId: input.classId,
    term: input.term,
  });

  // Periksa apakah permintaan pernah diproses
  const existing = await ports.idempotency.find(scope, input.idempotencyKey);

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return { code: "IDEMPOTENCY_CONFLICT" };
    }

    return existing.result;
  }

  // Buat klaim sementara untuk idempotency key
  const token = await ports.idempotency.reserve(
    scope,
    input.idempotencyKey,
    fingerprint,
  );

  if (!token) {
    return { code: "IDEMPOTENCY_CONFLICT" };
  }

  const reservation = await ports.seat.tryReserve(input.classId);

  if (!reservation) {
    await ports.idempotency.abort(token);
    return { code: "CLASS_FULL" };
  }

  try {
    const enrollment = await ports.enrollment.save({
      studentId: input.studentId,
      classId: input.classId,
      term: input.term,
    });

    const result = {
      code: "OK",
      enrollmentId: enrollment.id,
    };

    await ports.idempotency.complete(token, result);

    return result;
  } catch (error) {
    await ports.seat.release(reservation);
    await ports.idempotency.abort(token);

    return { code: "SAVE_FAILED" };
  }
}
