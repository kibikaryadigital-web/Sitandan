import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hitungTahun, pratinjau, statusFasilitas, daftarTahunAplikasi, jatuhTempo,
  sudahLewatJatuhTempo, urai, keAngka, normalisasi,
} from "./pajak.js";

const r = (id, tanggal, berat, harga, extra = {}) => ({
  id, tanggal, pembeli: "Toke", beratKg: String(berat), hargaPerKg: String(harga), ...extra,
});

test("di bawah Rp500 juta: tidak ada pajak", () => {
  const h = hitungTahun([r(1, "2026-01-10", 100000, 3000)], 2026); // 300 jt
  assert.equal(h.total.omzet, 300_000_000);
  assert.equal(h.total.pajak, 0);
});

test("transaksi yang menyeberangi Rp500 juta hanya dikenai atas kelebihannya", () => {
  const recs = [
    r(1, "2026-01-10", 150000, 3000), // 450 jt
    r(2, "2026-02-10", 50000, 3000),  // 150 jt → akum 600 jt, kena 100 jt
    r(3, "2026-03-10", 10000, 3000),  // 30 jt, kena penuh
  ];
  const h = hitungTahun(recs, 2026);
  assert.equal(h.bulan[0].pajak, 0);
  assert.equal(h.bulan[1].pajak, 500_000);
  assert.equal(h.bulan[2].pajak, 150_000);
  assert.equal(h.total.pajak, 650_000);
  assert.equal(h.total.kena, 130_000_000);
});

test("total pajak = 0,5% x (omzet - 500 jt) apa pun urutan input", () => {
  const recs = [r(5, "2026-06-01", 200000, 2500), r(2, "2026-01-01", 100000, 2500), r(9, "2026-03-01", 50000, 2500)];
  const h = hitungTahun(recs, 2026);
  assert.equal(h.total.omzet, 875_000_000);
  assert.equal(h.total.pajak, Math.round(375_000_000 * 0.005));
});

test("tanggal sama diurutkan stabil menurut id", () => {
  const h = hitungTahun([r(2, "2026-01-01", 1, 400_000_000), r(1, "2026-01-01", 1, 200_000_000)], 2026);
  assert.equal(h.perRecord[1].kena, 0);
  assert.equal(h.perRecord[2].kena, 100_000_000);
});

test("dipotong pembeli mengurangi setor sendiri, kelebihan dicatat", () => {
  const recs = [r(1, "2026-01-10", 200000, 3000, { dipotongPembeli: "500000" })]; // 600 jt, pajak 500rb
  const h = hitungTahun(recs, 2026);
  assert.equal(h.bulan[0].pajak, 500_000);
  assert.equal(h.bulan[0].setor, 0);
  const h2 = hitungTahun([r(1, "2026-01-10", 200000, 3000, { dipotongPembeli: "800000" })], 2026);
  assert.equal(h2.bulan[0].lebih, 300_000);
});

test("tahun lain tidak ikut dihitung", () => {
  const h = hitungTahun([r(1, "2025-12-31", 200000, 3000), r(2, "2026-01-01", 1000, 3000)], 2026);
  assert.equal(h.total.omzet, 3_000_000);
});

test("pratinjau: transaksi baru menyeberangi batas", () => {
  const recs = [r(1, "2026-01-10", 160000, 3000)]; // 480 jt
  const p = pratinjau(recs, r(null, "2026-02-01", 10000, 3000), null); // +30 jt → kena 10 jt
  assert.equal(p.pajak, 50_000);
  assert.equal(p.geser, false);
});

test("pratinjau: transaksi mundur tanggal memberi tanda geser", () => {
  const recs = [r(1, "2026-05-10", 200000, 3000)]; // 600 jt (kena 100 jt)
  const p = pratinjau(recs, r(null, "2026-01-01", 10000, 3000), null);
  assert.equal(p.pajak, 150_000); // tambahan total = 30 jt x 0,5%
  assert.equal(p.geser, true);    // transaksi Jan sendiri bebas, pajaknya pindah ke Mei
});

test("pratinjau: edit tidak menghitung dua kali", () => {
  const recs = [r(1, "2026-01-10", 200000, 3000)]; // 600 jt
  const p = pratinjau(recs, { ...recs[0], beratKg: "200000" }, 1);
  assert.equal(p.pajak, 500_000);
});

test("tanpa batas waktu bagi OP (PP 20/2026)", () => {
  assert.equal(statusFasilitas(2026, []).aktif, true);
  assert.equal(statusFasilitas(2040, []).aktif, true);
});

test("pilihan tahun mulai 2026 dan bertambah tiap tahun", () => {
  assert.deepEqual(daftarTahunAplikasi(new Date(2026, 9, 13)), [2026]);
  assert.deepEqual(daftarTahunAplikasi(new Date(2027, 0, 2)), [2027, 2026]);
  assert.deepEqual(daftarTahunAplikasi(new Date(2025, 5, 1)), [2026]);
});

test("omzet > 4,8 M di tahun sebelumnya menutup fasilitas", () => {
  const recs = [r(1, "2025-03-01", 2_000_000, 2500)]; // 5 M
  assert.equal(statusFasilitas(2025, recs).aktif, true);
  const s = statusFasilitas(2026, recs);
  assert.equal(s.aktif, false);
  assert.equal(s.tahunLewat, 2025);
  assert.equal(hitungTahun(recs, 2026, false).total.pajak, 0);
});

test("jatuh tempo tgl 15 bulan berikutnya, geser jika akhir pekan", () => {
  const jt = jatuhTempo(2026, 0); // 15 Feb 2026 = Minggu → Senin 16 Feb
  assert.equal(jt.getMonth(), 1);
  assert.equal(jt.getDate(), 16);
  const des = jatuhTempo(2026, 11); // 15 Jan 2027 = Jumat
  assert.equal(des.getFullYear(), 2027);
  assert.equal(des.getDate(), 15);
  assert.equal(sudahLewatJatuhTempo(2026, 11, new Date(2027, 0, 15, 23, 0)), false);
  assert.equal(sudahLewatJatuhTempo(2026, 11, new Date(2027, 0, 16, 0, 1)), true);
});

test("validasi tanggal & angka", () => {
  assert.equal(urai("2026-02-30"), null);
  assert.deepEqual(urai("2026-02-28"), { y: 2026, m: 1, d: 28 });
  assert.equal(keAngka("2.500"), 2500);
  assert.equal(keAngka(""), 0);
  assert.equal(keAngka("abc"), 0);
});

test("normalisasi membuang data rusak dan id ganda", () => {
  const n = normalisasi([{ id: 1, tanggal: "2026-01-01", pembeli: "A", beratKg: "10", hargaPerKg: "2000" }, { id: 1, tanggal: "2026-01-02", pembeli: "B", beratKg: "5", hargaPerKg: "2000" }, { tanggal: "salah" }, null]);
  assert.equal(n.length, 2);
  assert.notEqual(n[0].id, n[1].id);
});
