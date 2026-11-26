
# Tugas 08 - Pengujian Unit dan TDD

## Identitas
- Nama: M Ali Fauzi JR
- NPM: 243040079
- Kelas: A

## Deskripsi
Proyek ini merupakan implementasi pengujian unit dan
Test-Driven Development (TDD) pada fungsi submitEnrollment
untuk proses pendaftaran mata kuliah pada Portal KRS.

## Teknologi
- Node.js
- JavaScript (ES Modules)
- Node.js Test Runner (node:test)
- Git dan GitHub

## Instalasi
Pastikan Node.js sudah terpasang.

Jalankan:
npm install

## Menjalankan Semua Pengujian
npm test

## Menjalankan Satu File Pengujian
node --test test/submitEnrollment.test.js

## Unit Testing
Pengujian dilakukan menggunakan in-memory test doubles
untuk idempotency, seat, dan enrollment.

Terdapat 12 skenario pengujian UT01 sampai UT12.

## Mutation Testing
Mutation dilakukan dengan menghilangkan pemeriksaan
fingerprint pada idempotency.

UT03 berhasil mendeteksi perubahan tersebut.
Setelah kode dipulihkan, seluruh pengujian kembali PASS.

## Batasan
Pengujian ini berfokus pada unit submitEnrollment.
Pengujian tidak membuktikan atomicity transaksi database,
kondisi race pada penyimpanan nyata, maupun integrasi
dengan sistem Portal KRS sesungguhnya.
