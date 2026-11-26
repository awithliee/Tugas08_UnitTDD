
export async function submitEnrollment(input, ports) {
  const reservation = await ports.seat.tryReserve(input.classId);

  if (!reservation) {
    return { code: "CLASS_FULL" };
  }

  try {
    const enrollment = await ports.enrollment.save({
      studentId: input.studentId,
      classId: input.classId,
      term: input.term,
    });

    return {
      code: "OK",
      enrollmentId: enrollment.id,
    };
  } catch (error) {
    await ports.seat.release(reservation);
    return { code: "SAVE_FAILED" };
  }
}
