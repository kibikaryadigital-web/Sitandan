// =====================================================================
//  SITANDAN — Unduh rekap sebagai Excel (.xlsx) dan PDF
//  Dibuat tanpa library tambahan, jadi tidak perlu `npm install` apa pun.
// =====================================================================
import { ATURAN, BANTUAN, BULAN, keAngka, omzetOf, potongOf, formatTanggal } from "./pajak.js";

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
const angka = (n) => Math.round(n || 0).toLocaleString("id-ID");

function tanggalPanjang(d = new Date()) {
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

/** Susun data rekap yang dipakai Excel dan PDF. */
export function siapkanRekap(hasil, tahun, setorMap) {
  const bulan = hasil.bulan.map((b) => {
    const recs = hasil.list.filter((r) => Number(r.tanggal.slice(5, 7)) - 1 === b.bulan);
    const lunas = setorMap?.[`${tahun}-${b.bulan}`];
    return {
      ...b,
      nama: BULAN[b.bulan],
      berat: recs.reduce((s, r) => s + keAngka(r.beratKg), 0),
      status: b.setor > 0 ? (lunas ? "Sudah disetor" : "Belum disetor") : b.omzet > 0 ? "Tidak perlu setor" : "",
    };
  });
  const total = { ...hasil.total, berat: bulan.reduce((s, b) => s + b.berat, 0), jumlah: hasil.list.length };
  const rincian = hasil.list.map((r) => ({
    tanggal: r.tanggal,
    pembeli: r.pembeli,
    berat: keAngka(r.beratKg),
    harga: keAngka(r.hargaPerKg),
    nilai: omzetOf(r),
    pajak: Math.round(hasil.perRecord[r.id]?.pajak || 0),
    potong: potongOf(r),
    keterangan: r.keterangan || "",
  }));
  return { tahun, bulan, total, rincian };
}

// ---------------------------------------------------------------------
//  ZIP sederhana (tanpa kompresi) — cukup untuk membungkus file .xlsx
// ---------------------------------------------------------------------
const CRC_TABEL = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABEL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function buatZip(files) {
  const enc = new TextEncoder();
  const bagian = [];
  const pusat = [];
  let offset = 0;
  for (const f of files) {
    const nama = enc.encode(f.nama);
    const isi = typeof f.isi === "string" ? enc.encode(f.isi) : f.isi;
    const crc = crc32(isi);
    const lokal = new DataView(new ArrayBuffer(30));
    lokal.setUint32(0, 0x04034b50, true);
    lokal.setUint16(4, 20, true);
    lokal.setUint16(6, 0x0800, true); // nama file UTF-8
    lokal.setUint16(8, 0, true); // stored
    lokal.setUint16(12, 0x21, true); // tanggal DOS 1980-01-01
    lokal.setUint32(14, crc, true);
    lokal.setUint32(18, isi.length, true);
    lokal.setUint32(22, isi.length, true);
    lokal.setUint16(26, nama.length, true);
    bagian.push(new Uint8Array(lokal.buffer), nama, isi);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, isi.length, true);
    c.setUint32(24, isi.length, true);
    c.setUint16(28, nama.length, true);
    c.setUint32(42, offset, true);
    pusat.push(new Uint8Array(c.buffer), nama);
    offset += 30 + nama.length + isi.length;
  }
  const ukPusat = pusat.reduce((s, b) => s + b.length, 0);
  const akhir = new DataView(new ArrayBuffer(22));
  akhir.setUint32(0, 0x06054b50, true);
  akhir.setUint16(8, files.length, true);
  akhir.setUint16(10, files.length, true);
  akhir.setUint32(12, ukPusat, true);
  akhir.setUint32(16, offset, true);
  const semua = [...bagian, ...pusat, new Uint8Array(akhir.buffer)];
  const out = new Uint8Array(semua.reduce((s, b) => s + b.length, 0));
  let p = 0;
  for (const b of semua) { out.set(b, p); p += b.length; }
  return out;
}

// ---------------------------------------------------------------------
//  XLSX
// ---------------------------------------------------------------------
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kolom = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// Gaya: 0 biasa, 1 judul, 2 kepala tabel, 3 angka, 4 angka tebal (total), 5 teks tebal, 6 teks abu
function sel(nilai, r, c, gaya = 0) {
  const ref = `${kolom(c)}${r}`;
  if (nilai === null || nilai === undefined || nilai === "") return gaya ? `<c r="${ref}" s="${gaya}"/>` : "";
  if (typeof nilai === "number") return `<c r="${ref}" s="${gaya || 3}"><v>${nilai}</v></c>`;
  return `<c r="${ref}" t="inlineStr" s="${gaya}"><is><t xml:space="preserve">${esc(nilai)}</t></is></c>`;
}
function lembar(baris, lebar, gabung = []) {
  const rows = baris.map((cells, i) => `<row r="${i + 1}">${cells.map(([v, g], c) => sel(v, i + 1, c, g)).join("")}</row>`).join("");
  const cols = lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("");
  const merge = gabung.length ? `<mergeCells count="${gabung.length}">${gabung.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols>${cols}</cols><sheetData>${rows}</sheetData>${merge}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup orientation="landscape" paperSize="9"/></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF1D4A2C"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1D4A2C"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EFDC"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFD6E0D2"/></left><right style="thin"><color rgb="FFD6E0D2"/></right><top style="thin"><color rgb="FFD6E0D2"/></top><bottom style="thin"><color rgb="FFD6E0D2"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="7">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function buatXlsx(rekap) {
  const { tahun, bulan, total, rincian } = rekap;
  const T = (s) => [s, 0];
  const H = (s) => [s, 2];
  const N = (n) => [n, 3];
  const NB = (n) => [n, 4];
  const B = (s) => [s, 5];
  const S = (s) => [s, 6];

  const kepala = [
    [["SITANDAN - Rekap Penjualan TBS dan PPh Final", 1]],
    [T(`Tahun Pajak ${tahun}. Dasar: ${ATURAN.dasarHukum}. Kode billing setor sendiri: ${ATURAN.kodeBilling}.`)],
    [T(`Diunduh ${tanggalPanjang()}. Peredaran bruto per bulan dipakai untuk Lampiran 3B Bagian A SPT Tahunan.`)],
    [],
  ];
  const tabel1 = [
    [H("Bulan"), H("Jumlah Penjualan"), H("Berat (kg)"), H("Peredaran Bruto (Rp)"), H("Peredaran Bruto Kena Pajak (Rp)"), H("PPh Final 0,5% (Rp)"), H("Dipotong Pembeli (Rp)"), H("Disetor Sendiri (Rp)"), H("Status Setor")],
    ...bulan.map((b) => [S(b.nama), N(b.jumlah), N(b.berat), N(b.omzet), N(b.kena), N(b.pajak), N(b.potong), N(b.setor), S(b.status)]),
    [B("TOTAL"), NB(total.jumlah), NB(total.berat), NB(total.omzet), NB(total.kena), NB(total.pajak), NB(total.potong), NB(total.setor), B("")],
  ];
  const sheet1 = lembar([...kepala, ...tabel1], [14, 12, 14, 20, 22, 18, 18, 18, 18], ["A1:I1", "A2:I2", "A3:I3"]);

  const tabel2 = [
    [["Rincian Penjualan TBS " + tahun, 1]],
    [],
    [H("Tanggal"), H("Dijual ke"), H("Berat (kg)"), H("Harga per kg (Rp)"), H("Nilai Penjualan (Rp)"), H("PPh Final (Rp)"), H("Dipotong Pembeli (Rp)"), H("Catatan")],
    ...rincian.map((r) => [S(formatTanggal(r.tanggal, { day: "2-digit", month: "2-digit", year: "numeric" })), S(r.pembeli), N(r.berat), N(r.harga), N(r.nilai), N(r.pajak), N(r.potong), S(r.keterangan)]),
    [B("TOTAL"), B(""), NB(total.berat), B(""), NB(total.omzet), NB(Math.round(total.kena * ATURAN.tarif)), NB(total.potong), B("")],
  ];
  const sheet2 = lembar(tabel2, [13, 26, 13, 16, 20, 16, 18, 30], ["A1:H1"]);

  const files = [
    { nama: "[Content_Types].xml", isi: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { nama: "_rels/.rels", isi: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nama: "xl/workbook.xml", isi: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Rekap Bulanan" sheetId="1" r:id="rId1"/><sheet name="Rincian Penjualan" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { nama: "xl/_rels/workbook.xml.rels", isi: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nama: "xl/styles.xml", isi: STYLES },
    { nama: "xl/worksheets/sheet1.xml", isi: sheet1 },
    { nama: "xl/worksheets/sheet2.xml", isi: sheet2 },
  ];
  return buatZip(files);
}

// ---------------------------------------------------------------------
//  PDF (A4, font Helvetica bawaan PDF)
// ---------------------------------------------------------------------
const LEBAR_HURUF = { " ": 278, ".": 278, ",": 278, "-": 333, R: 722, p: 556, "(": 333, ")": 333, "%": 889 };
function lebarTeks(s, ukuran, tebal = false) {
  let w = 0;
  for (const ch of String(s)) {
    if (/[0-9]/.test(ch)) w += 556;
    else if (LEBAR_HURUF[ch]) w += LEBAR_HURUF[ch];
    else if (/[A-Z]/.test(ch)) w += 667;
    else if (/[il]/.test(ch)) w += 222;
    else if (/[mw]/.test(ch)) w += 833;
    else w += 556;
  }
  return (w * ukuran * (tebal ? 1.04 : 1)) / 1000;
}
function teksAman(s) {
  return String(s)
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, "?")
    .replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function potong(s, maks, ukuran) {
  let t = String(s);
  if (lebarTeks(t, ukuran) <= maks) return t;
  while (t.length > 1 && lebarTeks(t + "...", ukuran) > maks) t = t.slice(0, -1);
  return t + "...";
}

class Halaman {
  constructor() { this.ops = []; }
  warnaIsi(r, g, b) { this.ops.push(`${r} ${g} ${b} rg`); return this; }
  warnaGaris(r, g, b) { this.ops.push(`${r} ${g} ${b} RG`); return this; }
  kotak(x, y, w, h) { this.ops.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); return this; }
  garis(x1, y1, x2, y2, tebal = 0.6) { this.ops.push(`${tebal} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); return this; }
  teks(s, x, y, { ukuran = 10, tebal = false, kanan = false } = {}) {
    const xx = kanan ? x - lebarTeks(s, ukuran, tebal) : x;
    this.ops.push(`BT /${tebal ? "F2" : "F1"} ${ukuran} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (${teksAman(s)}) Tj ET`);
    return this;
  }
}

const HIJAU = [0.114, 0.29, 0.173];
const HIJAU_MUDA = [0.89, 0.937, 0.863];
const ORANYE = [0.769, 0.255, 0.059];
const ABU = [0.29, 0.37, 0.31];
const GARIS = [0.84, 0.878, 0.824];

function kepalaHalaman(h, judul, sub) {
  h.warnaIsi(...HIJAU).kotak(0, 772, 595, 70);
  h.warnaIsi(1, 1, 1).teks("SITANDAN", 40, 812, { ukuran: 20, tebal: true });
  h.teks("Penjualan TBS Tercatat, Menghitung Pajaknya Mudah", 40, 795, { ukuran: 9.5 });
  h.teks("KANWIL DJP RIAU", 555, 812, { ukuran: 10, tebal: true, kanan: true });
  h.teks("Direktorat Jenderal Pajak", 555, 797, { ukuran: 8.5, kanan: true });
  h.warnaIsi(0.08, 0.14, 0.1).teks(judul, 40, 742, { ukuran: 14, tebal: true });
  if (sub) h.warnaIsi(...ABU).teks(sub, 40, 726, { ukuran: 9.5 });
}
function kakiHalaman(h, no, jumlah) {
  h.warnaGaris(...GARIS).garis(40, 58, 555, 58);
  h.warnaIsi(...ABU);
  h.teks(`Dibuat dengan SITANDAN pada ${tanggalPanjang()}. Alat bantu pencatatan, bukan penetapan pajak.`, 40, 44, { ukuran: 7.5 });
  h.teks(`Bantuan: Kring Pajak ${BANTUAN.kringPajak}  |  WhatsApp Helpdesk Kanwil DJP Riau ${BANTUAN.waKanwilTampil}`, 40, 33, { ukuran: 7.5 });
  h.teks(`Halaman ${no} dari ${jumlah}`, 555, 44, { ukuran: 7.5, kanan: true });
}

export function buatPdf(rekap) {
  const { tahun, bulan, total, rincian } = rekap;
  const halaman = [];

  // --- Halaman 1: ringkasan + rekap bulanan
  const h1 = new Halaman();
  kepalaHalaman(h1, `Rekap Penjualan TBS dan PPh Final - Tahun Pajak ${tahun}`, `Dasar: ${ATURAN.dasarHukum}. Kode billing setor sendiri ${ATURAN.kodeBilling}.`);
  const ringkas = [
    ["Peredaran bruto (omzet)", rp(total.omzet)],
    ["Bagian tidak kena pajak", rp(Math.min(total.omzet, ATURAN.omzetTidakKenaPajak))],
    ["Peredaran bruto kena pajak", rp(total.kena)],
    ["PPh final 0,5% terutang", rp(total.pajak)],
    ["Dipotong pembeli", rp(total.potong)],
    ["Disetor sendiri", rp(total.setor)],
  ];
  let y = 700;
  h1.warnaIsi(...HIJAU_MUDA).kotak(40, y - 6 - ringkas.length * 17, 515, ringkas.length * 17 + 14);
  y -= 8;
  for (const [k, v] of ringkas) {
    h1.warnaIsi(...ABU).teks(k, 52, y - 4, { ukuran: 10 });
    h1.warnaIsi(...(k.startsWith("PPh") ? ORANYE : HIJAU)).teks(v, 543, y - 4, { ukuran: 10, tebal: true, kanan: true });
    y -= 17;
  }

  y -= 26;
  h1.warnaIsi(0.08, 0.14, 0.1).teks("Rekap bulanan (isian Lampiran 3B Bagian A)", 40, y, { ukuran: 11, tebal: true });
  y -= 12;
  const kol = [
    { judul: "Bulan", x: 46, kanan: false },
    { judul: "Peredaran bruto", x: 205, kanan: true },
    { judul: "Kena pajak", x: 300, kanan: true },
    { judul: "PPh 0,5%", x: 375, kanan: true },
    { judul: "Disetor sendiri", x: 460, kanan: true },
    { judul: "Status", x: 468, kanan: false },
  ];
  h1.warnaIsi(...HIJAU).kotak(40, y - 18, 515, 20);
  h1.warnaIsi(1, 1, 1);
  for (const k of kol) h1.teks(k.judul, k.x, y - 12, { ukuran: 8.5, tebal: true, kanan: k.kanan });
  y -= 18;
  bulan.forEach((b, i) => {
    if (i % 2 === 1) h1.warnaIsi(0.965, 0.976, 0.96).kotak(40, y - 18, 515, 18);
    const isi = [b.nama, b.omzet ? angka(b.omzet) : "-", b.kena ? angka(b.kena) : "-", b.pajak ? angka(b.pajak) : "-", b.setor ? angka(b.setor) : "-", b.status];
    isi.forEach((v, j) => {
      h1.warnaIsi(...(j === 3 && b.pajak ? ORANYE : b.omzet ? [0.08, 0.14, 0.1] : [0.55, 0.6, 0.56]));
      h1.teks(j === 5 ? potong(v, 80, 8.5) : v, kol[j].x, y - 12.5, { ukuran: 8.5, kanan: kol[j].kanan });
    });
    y -= 18;
  });
  h1.warnaGaris(...HIJAU).garis(40, y, 555, y, 1.2);
  h1.warnaIsi(...HIJAU);
  ["TOTAL", angka(total.omzet), angka(total.kena), angka(total.pajak), angka(total.setor)].forEach((v, j) =>
    h1.teks(v, kol[j].x, y - 14, { ukuran: 9, tebal: true, kanan: kol[j].kanan })
  );
  y -= 34;
  h1.warnaIsi(...ABU).teks("Angka dalam rupiah. Omzet sampai Rp500 juta per tahun tidak dikenai pajak; bagian di atasnya dikenai PPh final 0,5%.", 40, y, { ukuran: 8 });
  h1.teks("Pajak disetor paling lambat tanggal 15 bulan berikutnya. SPT Tahunan dilaporkan paling lambat 31 Maret tahun berikutnya.", 40, y - 12, { ukuran: 8 });
  halaman.push(h1);

  // --- Halaman berikutnya: rincian penjualan
  const PER_HAL = 30;
  for (let i = 0; i < Math.max(rincian.length, 1); i += PER_HAL) {
    const h = new Halaman();
    kepalaHalaman(h, `Rincian Penjualan TBS ${tahun}`, `${rincian.length} penjualan tercatat.`);
    let yy = 706;
    const k2 = [
      { j: "Tanggal", x: 46 }, { j: "Dijual ke", x: 108 }, { j: "Berat (kg)", x: 300, k: true },
      { j: "Harga/kg", x: 360, k: true }, { j: "Nilai penjualan", x: 450, k: true }, { j: "PPh final", x: 549, k: true },
    ];
    h.warnaIsi(...HIJAU).kotak(40, yy - 18, 515, 20);
    h.warnaIsi(1, 1, 1);
    for (const k of k2) h.teks(k.j, k.x, yy - 12, { ukuran: 8.5, tebal: true, kanan: k.k });
    yy -= 18;
    const potongan = rincian.slice(i, i + PER_HAL);
    if (!potongan.length) h.warnaIsi(...ABU).teks("Belum ada penjualan tercatat.", 46, yy - 14, { ukuran: 9 });
    potongan.forEach((r, n) => {
      if (n % 2 === 1) h.warnaIsi(0.965, 0.976, 0.96).kotak(40, yy - 18, 515, 18);
      h.warnaIsi(0.08, 0.14, 0.1);
      const isi = [formatTanggal(r.tanggal, { day: "2-digit", month: "2-digit", year: "numeric" }), potong(r.pembeli, 140, 8.5), angka(r.berat), angka(r.harga), angka(r.nilai), r.pajak ? angka(r.pajak) : "-"];
      isi.forEach((v, j) => {
        if (j === 5 && r.pajak) h.warnaIsi(...ORANYE);
        h.teks(v, k2[j].x, yy - 12.5, { ukuran: 8.5, kanan: k2[j].k });
      });
      yy -= 18;
    });
    if (i + PER_HAL >= rincian.length && rincian.length) {
      h.warnaGaris(...HIJAU).garis(40, yy, 555, yy, 1.2);
      h.warnaIsi(...HIJAU);
      h.teks("TOTAL", 46, yy - 14, { ukuran: 9, tebal: true });
      h.teks(angka(total.berat), 300, yy - 14, { ukuran: 9, tebal: true, kanan: true });
      h.teks(angka(total.omzet), 450, yy - 14, { ukuran: 9, tebal: true, kanan: true });
    }
    halaman.push(h);
  }

  halaman.forEach((h, i) => kakiHalaman(h, i + 1, halaman.length));
  return susunPdf(halaman.map((h) => h.ops.join("\n")));
}

function susunPdf(isiHalaman) {
  const obj = [];
  const n = isiHalaman.length;
  // 1 katalog, 2 pages, 3 F1, 4 F2, lalu tiap halaman: page + content
  obj[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  const kids = isiHalaman.map((_, i) => `${5 + i * 2} 0 R`).join(" ");
  obj[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  obj[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  obj[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  isiHalaman.forEach((stream, i) => {
    const p = 5 + i * 2;
    obj[p] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${p + 1} 0 R >>`;
    obj[p + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const posisi = [];
  for (let i = 1; i < obj.length; i++) {
    posisi[i] = out.length;
    out += `${i} 0 obj\n${obj[i]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${obj.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < obj.length; i++) out += String(posisi[i]).padStart(10, "0") + " 00000 n \n";
  out += `trailer\n<< /Size ${obj.length} /Root 1 0 R /Info << /Title (Rekap SITANDAN) /Producer (SITANDAN) >> >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
