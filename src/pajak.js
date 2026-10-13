// =====================================================================
//  SITANDAN — Logika perhitungan PPh Final UMKM untuk pekebun sawit
//  Dasar: PP 55/2022 sebagaimana diubah dengan PP 20/2026
//  Semua angka aturan ada di objek ATURAN. Bila aturan berubah,
//  cukup ubah di sini — tidak perlu menyentuh tampilan.
// =====================================================================

export const ATURAN = {
  dasarHukum: "PP 55/2022 jo. PP 20/2026",
  tarif: 0.005, // 0,5% (Pasal 56 ayat 2)
  omzetTidakKenaPajak: 500_000_000, // WP OP: Rp500 juta pertama per tahun tidak dikenai PPh
  batasOmzet: 4_800_000_000, // peredaran bruto maksimal per tahun pajak (Pasal 57 ayat 1)
  // PP 20/2026: tidak ada batas jangka waktu bagi WP orang pribadi.
  // Fasilitas hanya berhenti bila omzet satu tahun melewati batasOmzet.
  tahunAwalAplikasi: 2026, // pencatatan di Sitandan dimulai TP 2026
  kodeBilling: "411128-420", // KAP-KJS PPh Final UMKM disetor sendiri
  tanggalJatuhTempo: 15, // paling lambat tgl 15 bulan berikutnya
};

export const BANTUAN = {
  kringPajak: "1500200",
  waKanwil: "628117774040", // Helpdesk Kanwil DJP Riau (format internasional untuk wa.me)
  waKanwilTampil: "0811-7774-040",
};

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// ---------- Utilitas angka & tanggal ----------

/** Ambil angka dari string apa pun ("2.500", "2500", 2500) → 2500. Kosong/invalid → 0 */
export function keAngka(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const digit = String(v).replace(/[^\d]/g, "");
  return digit ? Number(digit) : 0;
}

export function formatRp(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

/** Versi ringkas untuk kartu kecil: Rp 1,2 M / Rp 350 jt */
export function formatRpSingkat(n) {
  const v = Math.round(n || 0);
  if (v >= 1_000_000_000) return "Rp " + (v / 1_000_000_000).toLocaleString("id-ID", { maximumFractionDigits: 2 }) + " M";
  if (v >= 1_000_000) return "Rp " + (v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " jt";
  return formatRp(v);
}

export function formatRibuan(digits) {
  const n = keAngka(digits);
  return n ? n.toLocaleString("id-ID") : "";
}

/**
 * "2026-03-07" → {y:2026, m:2, d:7}  (m = 0..11)
 * Sengaja tidak memakai new Date("YYYY-MM-DD") karena itu dibaca sebagai UTC
 * dan bisa bergeser satu hari di zona waktu tertentu.
 */
export function urai(tgl) {
  if (!tgl || typeof tgl !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tgl);
  if (!m) return null;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const cek = new Date(y, mo, d);
  if (cek.getFullYear() !== y || cek.getMonth() !== mo || cek.getDate() !== d) return null;
  return { y, m: mo, d };
}

export const tahunDari = (tgl) => urai(tgl)?.y ?? null;
export const bulanDari = (tgl) => urai(tgl)?.m ?? null;

export function hariIniISO(now = new Date()) {
  const p = (x) => String(x).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function formatTanggal(tgl, opsi = { day: "numeric", month: "short", year: "numeric" }) {
  const u = urai(tgl);
  if (!u) return "—";
  return new Date(u.y, u.m, u.d).toLocaleDateString("id-ID", opsi);
}

/**
 * Jatuh tempo setor masa (tahun, bulan 0..11): tgl 15 bulan berikutnya.
 * Bila jatuh pada Sabtu/Minggu, bergeser ke Senin berikutnya.
 * (Libur nasional tidak dihitung — tampilan memberi catatan.)
 */
export function jatuhTempo(tahun, bulan) {
  const d = new Date(tahun, bulan + 1, ATURAN.tanggalJatuhTempo);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}

export function formatJatuhTempo(tahun, bulan) {
  return jatuhTempo(tahun, bulan).toLocaleDateString("id-ID", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

/** Terlambat bila hari ini sudah melewati tanggal jatuh tempo (hari jatuh tempo masih aman). */
export function sudahLewatJatuhTempo(tahun, bulan, now = new Date()) {
  const jt = jatuhTempo(tahun, bulan);
  const hari = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return hari > jt;
}

// ---------- Data transaksi ----------

export const omzetOf = (r) => Math.round(keAngka(r.beratKg) * keAngka(r.hargaPerKg));
export const potongOf = (r) => keAngka(r.dipotongPembeli);

/** Urutan kronologis yang stabil: tanggal, lalu urutan input (id). */
export function urutKronologis(a, b) {
  if (a.tanggal !== b.tanggal) return a.tanggal < b.tanggal ? -1 : 1;
  return (a.id || 0) - (b.id || 0);
}

/** Bersihkan data lama/rusak dari localStorage supaya tidak memicu error tampilan. */
export function normalisasi(list) {
  if (!Array.isArray(list)) return [];
  const sudah = new Set();
  const hasil = [];
  for (const r of list) {
    if (!r || typeof r !== "object" || !urai(r.tanggal)) continue;
    let id = Number(r.id);
    if (!Number.isFinite(id) || sudah.has(id)) id = Date.now() + Math.random();
    sudah.add(id);
    hasil.push({
      id,
      tanggal: r.tanggal,
      pembeli: String(r.pembeli ?? "").trim() || "Tanpa nama",
      beratKg: String(keAngka(r.beratKg)),
      hargaPerKg: String(keAngka(r.hargaPerKg)),
      keterangan: String(r.keterangan ?? ""),
      dipotongPembeli: String(keAngka(r.dipotongPembeli)),
    });
  }
  return hasil;
}

// ---------- Fasilitas PPh Final ----------

export function omzetPerTahun(records) {
  const map = {};
  for (const r of records) {
    const y = tahunDari(r.tanggal);
    if (y) map[y] = (map[y] || 0) + omzetOf(r);
  }
  return map;
}

/**
 * Apakah tahun ini masih boleh memakai PPh Final 0,5%?
 * Satu-satunya penghenti untuk WP OP: omzet di salah satu tahun sebelumnya
 * melewati Rp4,8 M → mulai tahun berikutnya memakai tarif umum.
 */
export function statusFasilitas(tahun, records) {
  const perTahun = omzetPerTahun(records);
  const tahunLewat = Object.keys(perTahun)
    .map(Number)
    .filter((y) => y < tahun && perTahun[y] > ATURAN.batasOmzet)
    .sort((a, b) => a - b)[0];
  if (tahunLewat) return { aktif: false, alasan: "omzet", tahunLewat };
  return { aktif: true };
}

/** Pilihan tahun di aplikasi: 2026 s.d. tahun berjalan. */
export function daftarTahunAplikasi(now = new Date()) {
  const akhir = Math.max(now.getFullYear(), ATURAN.tahunAwalAplikasi);
  const out = [];
  for (let y = akhir; y >= ATURAN.tahunAwalAplikasi; y--) out.push(y);
  return out;
}

/**
 * Hitung pajak satu tahun.
 * - Rp500 juta pertama (kumulatif sejak Januari) tidak dikenai pajak.
 * - Bagian omzet di atasnya dikenai 0,5%, dibebankan ke transaksi/bulan
 *   tempat omzet itu terjadi (urutan kronologis).
 * - PPh per bulan dibulatkan ke rupiah penuh (untuk kode billing).
 */
export function hitungTahun(records, tahun, aktif = true) {
  const list = records.filter((r) => tahunDari(r.tanggal) === tahun).sort(urutKronologis);
  const perRecord = {};
  const bulan = Array.from({ length: 12 }, (_, i) => ({
    bulan: i, omzet: 0, kena: 0, pajak: 0, potong: 0, setor: 0, lebih: 0, jumlah: 0,
  }));
  let akum = 0;
  for (const r of list) {
    const o = omzetOf(r);
    const sebelum = akum;
    akum += o;
    const kena = aktif ? Math.max(0, akum - Math.max(sebelum, ATURAN.omzetTidakKenaPajak)) : 0;
    perRecord[r.id] = { omzet: o, kena, pajak: kena * ATURAN.tarif, akumSesudah: akum };
    const b = bulan[bulanDari(r.tanggal)];
    b.omzet += o;
    b.kena += kena;
    b.potong += aktif ? potongOf(r) : 0;
    b.jumlah += 1;
  }
  let total = { omzet: 0, kena: 0, pajak: 0, potong: 0, setor: 0, lebih: 0 };
  for (const b of bulan) {
    b.pajak = Math.round(b.kena * ATURAN.tarif);
    b.setor = Math.max(0, b.pajak - b.potong);
    b.lebih = Math.max(0, b.potong - b.pajak);
    for (const k of Object.keys(total)) total[k] += b[k];
  }
  return { list, perRecord, bulan, total };
}

/**
 * Pratinjau saat mengisi form: berapa PPh yang timbul karena transaksi ini.
 * = pajak tahun itu dengan transaksi ini − pajak tahun itu tanpa transaksi ini.
 */
export function pratinjau(records, kandidat, editId, aktif = true) {
  const tahun = tahunDari(kandidat.tanggal);
  const omzet = omzetOf(kandidat);
  if (!tahun || !omzet) return null;
  const lain = records.filter((r) => r.id !== editId);
  const idK = editId ?? "__baru__";
  const tanpa = hitungTahun(lain, tahun, aktif);
  const dengan = hitungTahun([...lain, { ...kandidat, id: idK === "__baru__" ? Number.MAX_SAFE_INTEGER : idK }], tahun, aktif);
  const tambahan = (dengan.total.kena - tanpa.total.kena) * ATURAN.tarif;
  const rec = dengan.perRecord[idK === "__baru__" ? Number.MAX_SAFE_INTEGER : idK];
  const geser = Math.abs((rec?.pajak || 0) - tambahan) >= 1;
  return {
    tahun,
    omzet,
    pajak: tambahan,
    omzetSebelum: tanpa.total.omzet,
    omzetSesudah: dengan.total.omzet,
    sisaBebas: Math.max(0, ATURAN.omzetTidakKenaPajak - dengan.total.omzet),
    lewat48: dengan.total.omzet > ATURAN.batasOmzet,
    geser,
  };
}
