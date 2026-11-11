import { useEffect, useMemo, useRef, useState } from "react";
import {
  ATURAN, BANTUAN, BULAN, keAngka, formatRp, formatRpSingkat, formatRibuan, urai, tahunDari,
  hariIniISO, formatTanggal, formatJatuhTempo, sudahLewatJatuhTempo, jatuhTempo,
  omzetOf, potongOf, normalisasi, statusFasilitas, daftarTahunAplikasi, hitungTahun, pratinjau,
} from "./pajak.js";
import { siapkanRekap, buatXlsx, buatPdf } from "./ekspor.js";
import logoKemenkeu from "./assets/logo-kemenkeu.png";
import logoSitandan from "./assets/logo-sitandan.webp";
import ikonSitandan from "./assets/ikon-sitandan.webp";

// Kunci penyimpanan.
const KEY_RECORDS = "sitandan_v2_records";
const KEY_SETOR = "sitandan_v2_setor";
// Versi SITANDAN yang tayang sebelumnya menyimpan data di kunci ini.
// Data lama dipindahkan sekali saja ke KEY_RECORDS (data lama tidak dihapus).
const KEY_LAMA = "sitandan_records";
const KEY_MIGRASI = "sitandan_migrasi_v1";

function muatAwal() {
  const kini = baca(KEY_RECORDS, []);
  let gabung = Array.isArray(kini) ? kini : [];
  try {
    if (!localStorage.getItem(KEY_MIGRASI)) {
      const lama = baca(KEY_LAMA, []);
      if (Array.isArray(lama) && lama.length) {
        const peta = new Map(gabung.map((r) => [String(r.id), r]));
        for (const r of lama) if (r && !peta.has(String(r.id))) peta.set(String(r.id), r);
        gabung = [...peta.values()];
      }
      localStorage.setItem(KEY_MIGRASI, new Date().toISOString());
    }
  } catch { /* penyimpanan diblokir: pakai yang ada */ }
  return normalisasi(gabung);
}

const TANGGAL_MIN = `${ATURAN.tahunAwalAplikasi}-01-01`;
const WA_URL = `https://wa.me/${BANTUAN.waKanwil}?text=${encodeURIComponent("Halo Helpdesk Kanwil DJP Riau, saya pekebun sawit pengguna SITANDAN ingin bertanya tentang ")}`;

function baca(key, awal) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : awal;
  } catch {
    return awal;
  }
}
function simpan(key, nilai) {
  try {
    localStorage.setItem(key, JSON.stringify(nilai));
    return true;
  } catch {
    return false;
  }
}
function unduh(nama, isi, tipe) {
  const blob = new Blob([isi], { type: tipe });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const formKosong = () => ({
  tanggal: hariIniISO(), pembeli: "", beratKg: "", hargaPerKg: "", keterangan: "", dipotongPembeli: "",
});

const MENU = [
  { id: "home", label: "Beranda", Icon: IconRumah },
  { id: "catat", label: "Catat", Icon: IconPena },
  { id: "rekap", label: "Rekap", Icon: IconGrafik },
  { id: "spt", label: "SPT", Icon: IconBerkas },
];

export default function Sitandan() {
  const [records, setRecords] = useState(muatAwal);
  const [setorMap, setSetorMap] = useState(() => baca(KEY_SETOR, {}) || {});
  const [form, setForm] = useState(formKosong);
  const [tab, setTab] = useState("home");
  const [tahun, setTahun] = useState(() => daftarTahunAplikasi()[0]);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [konfirmasi, setKonfirmasi] = useState(null);
  const [bukaAtur, setBukaAtur] = useState(false);
  const [bukaLain, setBukaLain] = useState(false);
  const [cobaKirim, setCobaKirim] = useState(false);
  const [semua, setSemua] = useState(false);
  const toastTimer = useRef(null);
  const fileRef = useRef(null);
  const gagalSimpan = useRef(false);

  // ---------- Font & meta (sekali) ----------
  useEffect(() => {
    if (!document.getElementById("st-font")) {
      const l = document.createElement("link");
      l.id = "st-font";
      l.rel = "stylesheet";
      l.href = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap";
      document.head.appendChild(l);
    }
    let m = document.querySelector('meta[name="theme-color"]');
    if (!m) {
      m = document.createElement("meta");
      m.name = "theme-color";
      document.head.appendChild(m);
    }
    m.content = "#1d4a2c";
    document.title = "SITANDAN | Penjualan TBS Tercatat, Menghitung Pajaknya Mudah";
  }, []);

  // ---------- Simpan otomatis ----------
  useEffect(() => {
    if (!simpan(KEY_RECORDS, records) && !gagalSimpan.current) {
      gagalSimpan.current = true;
      tampilkan("Data tidak bisa disimpan di perangkat ini. Unduh cadangan lewat menu Pengaturan.", "error");
    }
  }, [records]);
  useEffect(() => { simpan(KEY_SETOR, setorMap); }, [setorMap]);

  // Sinkron bila aplikasi terbuka di dua tab
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY_RECORDS) setRecords(normalisasi(baca(KEY_RECORDS, [])));
      if (e.key === KEY_SETOR) setSetorMap(baca(KEY_SETOR, {}) || {});
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!konfirmasi && !bukaAtur) return;
    const onKey = (e) => {
      if (e.key === "Escape") { setKonfirmasi(null); setBukaAtur(false); }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [konfirmasi, bukaAtur]);

  function tampilkan(msg, type = "ok") {
    clearTimeout(toastTimer.current);
    setToast({ msg, type, key: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  function pindahTab(id) {
    setTab(id);
    setSemua(false);
    window.scrollTo({ top: 0 });
  }

  // ---------- Data turunan ----------
  const daftarTahun = daftarTahunAplikasi();
  const status = useMemo(() => statusFasilitas(tahun, records), [tahun, records]);
  const hasil = useMemo(() => hitungTahun(records, tahun, status.aktif), [records, tahun, status.aktif]);
  const transaksiTahun = useMemo(() => [...hasil.list].reverse(), [hasil]);
  const pembeliLama = useMemo(() => [...new Set(records.map((r) => r.pembeli))].slice(0, 40), [records]);

  const tagihan = useMemo(() => {
    const tahunAda = [...new Set(records.map((r) => tahunDari(r.tanggal)).filter((y) => y >= ATURAN.tahunAwalAplikasi))];
    const out = [];
    for (const y of tahunAda) {
      const st = statusFasilitas(y, records);
      const h = hitungTahun(records, y, st.aktif);
      for (const b of h.bulan) {
        if (b.setor > 0 && !setorMap[`${y}-${b.bulan}`]) {
          out.push({ tahun: y, bulan: b.bulan, jumlah: b.setor, lewat: sudahLewatJatuhTempo(y, b.bulan) });
        }
      }
    }
    return out.sort((a, b) => jatuhTempo(a.tahun, a.bulan) - jatuhTempo(b.tahun, b.bulan));
  }, [records, setorMap]);

  const tahunForm = tahunDari(form.tanggal);
  const statusForm = useMemo(
    () => (tahunForm ? statusFasilitas(tahunForm, records) : { aktif: true }),
    [tahunForm, records]
  );
  const pra = useMemo(() => pratinjau(records, form, editId, statusForm.aktif), [records, form, editId, statusForm.aktif]);

  // ---------- Validasi ----------
  const hariIni = hariIniISO();
  const galat = {};
  if (!urai(form.tanggal)) galat.tanggal = "Pilih tanggal penjualan.";
  else if (form.tanggal > hariIni) galat.tanggal = "Tanggal tidak boleh melewati hari ini.";
  else if (form.tanggal < TANGGAL_MIN) galat.tanggal = `SITANDAN mencatat penjualan mulai 1 Januari ${ATURAN.tahunAwalAplikasi}.`;
  if (!form.pembeli.trim()) galat.pembeli = "Tulis nama toke, pengepul, atau PKS.";
  if (!keAngka(form.beratKg)) galat.beratKg = "Isi berat lebih dari 0 kg.";
  if (!keAngka(form.hargaPerKg)) galat.hargaPerKg = "Isi harga per kg.";
  const harga = keAngka(form.hargaPerKg);
  const peringatanHarga = harga && (harga < 500 || harga > 10_000)
    ? `Harga Rp ${harga.toLocaleString("id-ID")}/kg tidak lazim untuk TBS. Periksa lagi angkanya.`
    : null;
  const adaGalat = Object.keys(galat).length > 0;
  const g = (k) => (cobaKirim ? galat[k] : null);

  // ---------- Aksi ----------
  function kirim(e) {
    e?.preventDefault();
    setCobaKirim(true);
    if (adaGalat) {
      tampilkan("Lengkapi isian yang ditandai merah.", "error");
      return;
    }
    const data = {
      tanggal: form.tanggal,
      pembeli: form.pembeli.trim(),
      beratKg: String(keAngka(form.beratKg)),
      hargaPerKg: String(keAngka(form.hargaPerKg)),
      keterangan: form.keterangan.trim(),
      dipotongPembeli: String(keAngka(form.dipotongPembeli)),
    };
    if (editId !== null) {
      setRecords((rs) => rs.map((r) => (r.id === editId ? { ...r, ...data } : r)));
      tampilkan("Perubahan tersimpan.");
    } else {
      const ids = new Set(records.map((r) => r.id));
      let id = Date.now();
      while (ids.has(id)) id += 1;
      setRecords((rs) => [{ ...data, id }, ...rs]);
      tampilkan(pra?.pajak > 0 ? `Tersimpan. PPh dari penjualan ini ${formatRp(pra.pajak)}.` : "Penjualan tersimpan.");
    }
    const y = tahunDari(data.tanggal);
    if (y !== tahun) setTahun(y);
    setEditId(null);
    setForm(formKosong());
    setBukaLain(false);
    setCobaKirim(false);
    pindahTab("home");
  }

  function mulaiEdit(r) {
    setForm({
      tanggal: r.tanggal, pembeli: r.pembeli, beratKg: r.beratKg, hargaPerKg: r.hargaPerKg,
      keterangan: r.keterangan || "", dipotongPembeli: keAngka(r.dipotongPembeli) ? r.dipotongPembeli : "",
    });
    setBukaLain(keAngka(r.dipotongPembeli) > 0);
    setEditId(r.id);
    setCobaKirim(false);
    pindahTab("catat");
  }

  function batalEdit() {
    setEditId(null);
    setForm(formKosong());
    setCobaKirim(false);
    setBukaLain(false);
  }

  function mintaHapus(r) {
    setKonfirmasi({
      judul: "Hapus penjualan ini?",
      isi: `${r.pembeli}, ${formatTanggal(r.tanggal)}, ${formatRp(omzetOf(r))}. Pajak bulan-bulan berikutnya akan dihitung ulang.`,
      tombol: "Hapus",
      bahaya: true,
      aksi: () => {
        setRecords((rs) => rs.filter((x) => x.id !== r.id));
        if (editId === r.id) batalEdit();
        tampilkan("Penjualan dihapus.", "info");
      },
    });
  }

  function tandaiSetor(y, b) {
    const key = `${y}-${b}`;
    const sudah = !!setorMap[key];
    setSetorMap((m) => {
      const n = { ...m };
      if (sudah) delete n[key];
      else n[key] = hariIniISO();
      return n;
    });
    tampilkan(sudah ? `${BULAN[b]} ${y} ditandai belum disetor.` : `${BULAN[b]} ${y} ditandai sudah disetor.`, sudah ? "info" : "ok");
  }

  function unduhCadangan() {
    const isi = JSON.stringify({ aplikasi: "sitandan", versi: 4, dibuat: new Date().toISOString(), records, setor: setorMap }, null, 2);
    unduh(`sitandan-cadangan-${hariIniISO()}.json`, isi, "application/json");
    tampilkan("File cadangan diunduh. Simpan di tempat aman.");
  }

  function pulihkan(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        const masuk = normalisasi(Array.isArray(d) ? d : d.records);
        if (!masuk.length) throw new Error("kosong");
        setKonfirmasi({
          judul: `Pulihkan ${masuk.length} penjualan?`,
          isi: "Data dari file digabung dengan data di perangkat ini. Penjualan yang sama tidak akan tercatat dua kali.",
          tombol: "Pulihkan",
          aksi: () => {
            setRecords((rs) => {
              const ada = new Map(rs.map((r) => [r.id, r]));
              for (const r of masuk) ada.set(r.id, r);
              return normalisasi([...ada.values()]);
            });
            if (d.setor && typeof d.setor === "object") setSetorMap((m) => ({ ...d.setor, ...m }));
            setBukaAtur(false);
            tampilkan("Data berhasil dipulihkan.");
          },
        });
      } catch {
        tampilkan("File ini bukan cadangan SITANDAN yang valid.", "error");
      }
    };
    rd.readAsText(f);
  }

  function hapusSemua() {
    setKonfirmasi({
      judul: "Hapus semua data?",
      isi: `${records.length} penjualan dan status setor akan dihapus dari perangkat ini. Unduh cadangan dulu bila masih diperlukan.`,
      tombol: "Hapus semua",
      bahaya: true,
      aksi: () => {
        setRecords([]);
        setSetorMap({});
        batalEdit();
        setBukaAtur(false);
        tampilkan("Semua data dihapus.", "info");
      },
    });
  }

  function unduhRekap(jenis) {
    if (!hasil.list.length) {
      tampilkan(`Belum ada penjualan di ${tahun} untuk diunduh.`, "info");
      return;
    }
    try {
      const rekap = siapkanRekap(hasil, tahun, setorMap);
      if (jenis === "xlsx") {
        unduh(`SITANDAN-rekap-${tahun}.xlsx`, buatXlsx(rekap), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      } else {
        unduh(`SITANDAN-rekap-${tahun}.pdf`, buatPdf(rekap), "application/pdf");
      }
      tampilkan(`Rekap ${tahun} diunduh sebagai ${jenis === "xlsx" ? "Excel" : "PDF"}.`);
    } catch {
      tampilkan("File gagal dibuat. Coba lagi.", "error");
    }
  }

  // ---------- Angka ringkasan ----------
  const T = hasil.total;
  const batas = ATURAN.omzetTidakKenaPajak;
  const pctBebas = Math.min(100, (T.omzet / batas) * 100);
  const pct48 = Math.min(100, (T.omzet / ATURAN.batasOmzet) * 100);
  const adaPotong = T.potong > 0;
  const belumSetorTahun = tagihan.filter((x) => x.tahun === tahun).reduce((s, x) => s + x.jumlah, 0);

  const tombolUnduh = (
    <div className="st-unduh" role="group" aria-label={`Unduh rekap ${tahun}`}>
      <span className="st-unduh__label">Unduh</span>
      <button type="button" className="st-unduh__btn" onClick={() => unduhRekap("xlsx")} aria-label="Unduh sebagai Excel" title="Unduh Excel">
        <IconFile warna="#1e7a45" teks="XLS" />
      </button>
      <button type="button" className="st-unduh__btn" onClick={() => unduhRekap("pdf")} aria-label="Unduh sebagai PDF" title="Unduh PDF">
        <IconFile warna="#c62a1f" teks="PDF" />
      </button>
    </div>
  );

  return (
    <div className="st">
      <style>{CSS}</style>

      {toast && (
        <div key={toast.key} className={`st-toast st-toast--${toast.type}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      )}

      {/* ---------- Strip instansi ---------- */}
      <div className="st-instansi">
        <div className="st-instansi__in">
          <img src={logoKemenkeu} alt="Kementerian Keuangan | Direktorat Jenderal Pajak" className="st-instansi__logo" />
          <span className="st-instansi__garis" aria-hidden="true" />
          <span className="st-instansi__nama">KANWIL DJP RIAU</span>
        </div>
      </div>

      {/* ---------- Kepala aplikasi + menu (desktop) ---------- */}
      <div className="st-lekat">
        <header className="st-head">
          <div className="st-head__in">
            <div className="st-brand">
              <LogoSitandan />
              <div className="st-brand__teks">
                <div className="st-brand__nama">SITANDAN</div>
                <div className="st-brand__sub"><span>Penjualan TBS Tercatat,</span> <span>Menghitung Pajaknya Mudah</span></div>
              </div>
            </div>
            <div className="st-head__aksi">
              <label className="st-visually-hidden" htmlFor="pilih-tahun">Tahun pajak</label>
              <select id="pilih-tahun" className="st-tahun" value={tahun} onChange={(e) => setTahun(parseInt(e.target.value, 10))}>
                {daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" className="st-ikonbtn" onClick={() => setBukaAtur(true)} aria-label="Pengaturan dan bantuan">
                <IconGir />
              </button>
            </div>
          </div>
        </header>

        <nav className="st-nav" aria-label="Menu utama">
          <div className="st-nav__in">
            {MENU.map(({ id, label, Icon }) => (
              <button key={id} type="button" className={`st-nav__btn ${tab === id ? "is-aktif" : ""}`}
                aria-current={tab === id ? "page" : undefined} onClick={() => pindahTab(id)}>
                <Icon />
                <span>{label}</span>
                {id === "home" && tagihan.some((t) => t.lewat) && <i className="st-nav__titik" aria-label="ada setoran terlambat" />}
              </button>
            ))}
          </div>
        </nav>
      </div>

      <main className="st-main">
        {/* ================= BERANDA ================= */}
        {tab === "home" && (
          <>
          <div className="st-hero">
            <img src={logoSitandan} width="1100" height="649" decoding="async"
              alt="SITANDAN, Penjualan TBS Tercatat, Menghitung Pajaknya Mudah. Kantor Wilayah DJP Riau" />
          </div>
          <div className="st-dua-kolom st-dua-kolom--home">
            <div className="st-kolom">
              <section className="st-nota" aria-label={`Ringkasan tahun ${tahun}`}>
                <div className="st-nota__judul">
                  <span>Omzet {tahun}</span>
                  <span>{hasil.list.length} penjualan</span>
                </div>
                <div className="st-nota__angka">{formatRp(T.omzet)}</div>
                <div className="st-nota__garis" aria-hidden="true" />
                <dl className="st-nota__baris">
                  <div>
                    <dt>PPh final terutang</dt>
                    <dd className={T.pajak > 0 ? "is-buah" : ""}>{status.aktif ? formatRp(T.pajak) : "Tarif umum"}</dd>
                  </div>
                  <div>
                    <dt>Berat terjual</dt>
                    <dd>{hasil.list.reduce((s, r) => s + keAngka(r.beratKg), 0).toLocaleString("id-ID")} kg</dd>
                  </div>
                </dl>
              </section>

              <StatusFasilitas status={status} tahun={tahun} />

              {status.aktif && (
                <section className="st-blok" aria-labelledby="judul-batas">
                  <h2 id="judul-batas" className="st-h2">Batas omzet bebas pajak</h2>
                  <div className="st-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctBebas)} aria-label="Pemakaian batas Rp500 juta">
                    <div className={`st-meter__isi ${pctBebas >= 100 ? "is-penuh" : ""}`} style={{ width: `${pctBebas}%` }} />
                  </div>
                  <p className="st-meter__ket">
                    {T.omzet < batas ? (
                      <>Masih bebas pajak. Sisa <b>{formatRp(batas - T.omzet)}</b> sebelum omzet {tahun} mencapai Rp500 juta.</>
                    ) : (
                      <>Omzet sudah melewati Rp500 juta. Setiap penjualan berikutnya di {tahun} dikenai PPh final <b>0,5%</b>.</>
                    )}
                  </p>
                  <p className="st-kecil">
                    Batas pemakaian tarif 0,5%: Rp4,8 miliar per tahun. Terpakai {pct48.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%.
                  </p>
                  {T.omzet > ATURAN.batasOmzet && (
                    <p className="st-alert st-alert--buah">
                      Omzet {tahun} melewati Rp4,8 miliar. Tarif 0,5% tetap berlaku sampai akhir {tahun}, tetapi mulai {tahun + 1} wajib memakai tarif umum dan menyelenggarakan pembukuan.
                    </p>
                  )}
                </section>
              )}

              <button type="button" className="st-cta" onClick={() => { if (editId === null) setForm(formKosong()); pindahTab("catat"); }}>
                <IconPlus /> Catat penjualan TBS
              </button>
            </div>

            <div className="st-kolom">
              {tagihan.length > 0 && (
                <section className="st-blok" aria-labelledby="judul-tagihan">
                  <h2 id="judul-tagihan" className="st-h2">Pajak yang perlu disetor</h2>
                  <ul className="st-tagihan">
                    {tagihan.slice(0, 4).map((t) => (
                      <li key={`${t.tahun}-${t.bulan}`} className={t.lewat ? "is-lewat" : ""}>
                        <div>
                          <div className="st-tagihan__bulan">Masa {BULAN[t.bulan]} {t.tahun}</div>
                          <div className="st-tagihan__jt">
                            {t.lewat ? "Terlambat. Jatuh tempo " : "Setor paling lambat "}
                            {formatJatuhTempo(t.tahun, t.bulan)}
                          </div>
                        </div>
                        <div className="st-tagihan__kanan">
                          <div className="st-tagihan__rp">{formatRp(t.jumlah)}</div>
                          <button type="button" className="st-chip" onClick={() => tandaiSetor(t.tahun, t.bulan)}>Tandai sudah setor</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {tagihan.length > 4 && <p className="st-kecil">Ada {tagihan.length - 4} masa lain di menu Rekap.</p>}
                  <p className="st-kecil">
                    Buat kode billing di Coretax DJP dengan kode akun <b>{ATURAN.kodeBilling}</b>, lalu bayar di bank, kantor pos, atau m-banking.
                    {tagihan.some((t) => t.lewat) && " Setoran yang terlambat dapat dikenai sanksi bunga."}
                  </p>
                </section>
              )}

              <section aria-labelledby="judul-riwayat">
                <div className="st-baris-judul">
                  <h2 id="judul-riwayat" className="st-h2 st-mb-0">Penjualan {tahun}</h2>
                  {transaksiTahun.length > 5 && (
                    <button type="button" className="st-link" onClick={() => setSemua((s) => !s)}>
                      {semua ? "Tampilkan 5 terakhir" : `Tampilkan semua (${transaksiTahun.length})`}
                    </button>
                  )}
                </div>
                {transaksiTahun.length === 0 ? (
                  <div className="st-kosong">
                    <LogoSitandan besar />
                    <p>Belum ada penjualan di {tahun}.</p>
                    <p className="st-kecil">Catat setiap kali menjual buah ke toke, pengepul, atau PKS. SITANDAN menghitung pajaknya otomatis.</p>
                  </div>
                ) : (
                  <ul className="st-daftar">
                    {(semua ? transaksiTahun : transaksiTahun.slice(0, 5)).map((r) => (
                      <BarisTransaksi key={r.id} r={r} info={hasil.perRecord[r.id]} aktif={status.aktif} onEdit={() => mulaiEdit(r)} onHapus={() => mintaHapus(r)} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
          </>
        )}

        {/* ================= CATAT ================= */}
        {tab === "catat" && (
          <form className="st-dua-kolom st-dua-kolom--catat" onSubmit={kirim} noValidate>
            <div className="st-kolom">
              <h1 className="st-h1">{editId !== null ? "Ubah penjualan" : "Catat penjualan TBS"}</h1>

              <Isian id="f-tanggal" label="Tanggal jual" galat={g("tanggal")}>
                <input id="f-tanggal" type="date" min={TANGGAL_MIN} max={hariIni} value={form.tanggal}
                  onChange={(e) => setForm({ ...form, tanggal: e.target.value })} className="st-input" />
              </Isian>

              <Isian id="f-pembeli" label="Dijual ke" galat={g("pembeli")}>
                <input id="f-pembeli" list="daftar-pembeli" autoComplete="off" placeholder="Nama toke, pengepul, atau PKS"
                  value={form.pembeli} maxLength={60}
                  onChange={(e) => setForm({ ...form, pembeli: e.target.value })} className="st-input" />
                <datalist id="daftar-pembeli">{pembeliLama.map((p) => <option key={p} value={p} />)}</datalist>
              </Isian>

              <div className="st-sepasang">
                <Isian id="f-berat" label="Berat bersih" galat={g("beratKg")} satuan="kg">
                  <input id="f-berat" inputMode="numeric" autoComplete="off" placeholder="2.500"
                    value={formatRibuan(form.beratKg)}
                    onChange={(e) => setForm({ ...form, beratKg: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                    className="st-input st-input--angka" />
                </Isian>
                <Isian id="f-harga" label="Harga per kg" galat={g("hargaPerKg")} awalan="Rp">
                  <input id="f-harga" inputMode="numeric" autoComplete="off" placeholder="3.500"
                    value={formatRibuan(form.hargaPerKg)}
                    onChange={(e) => setForm({ ...form, hargaPerKg: e.target.value.replace(/\D/g, "").slice(0, 7) })}
                    className="st-input st-input--angka" />
                </Isian>
              </div>
              <p className="st-kecil st-mt-0">Berat bersih adalah berat setelah potongan sortasi atau timbangan toke.</p>
              {peringatanHarga && <p className="st-alert st-alert--emas st-mt-s">{peringatanHarga}</p>}

              <Isian id="f-ket" label="Catatan (boleh kosong)">
                <input id="f-ket" placeholder="Misalnya: panen blok belakang" maxLength={80}
                  value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} className="st-input" />
              </Isian>

              <button type="button" className="st-lipat" aria-expanded={bukaLain} onClick={() => setBukaLain((v) => !v)}>
                <IconPanah buka={bukaLain} /> Pajak dipotong langsung oleh pembeli?
              </button>
              {bukaLain && (
                <div className="st-lipat__isi">
                  <Isian id="f-potong" label="PPh final dipotong pembeli" awalan="Rp">
                    <input id="f-potong" inputMode="numeric" autoComplete="off" placeholder="0"
                      value={formatRibuan(form.dipotongPembeli)}
                      onChange={(e) => setForm({ ...form, dipotongPembeli: e.target.value.replace(/\D/g, "").slice(0, 12) })}
                      className="st-input st-input--angka" />
                  </Isian>
                  <p className="st-kecil st-mt-0">Isi hanya jika ada bukti potong PPh final 0,5% dari pembeli. Jumlah ini mengurangi pajak yang harus disetor sendiri.</p>
                </div>
              )}
            </div>

            <div className="st-kolom st-kolom--lekat">
              {pra ? (
                <section className="st-nota st-nota--form" aria-live="polite" aria-label="Hasil perhitungan">
                  <div className="st-nota__judul"><span>Nota hitungan</span><span>{formatTanggal(form.tanggal)}</span></div>
                  <div className="st-nota__rumus">
                    {keAngka(form.beratKg).toLocaleString("id-ID")} kg × {formatRp(keAngka(form.hargaPerKg))}
                  </div>
                  <div className="st-nota__angka st-nota__angka--sedang">{formatRp(pra.omzet)}</div>
                  <div className="st-nota__garis" aria-hidden="true" />
                  <dl className="st-nota__baris">
                    <div>
                      <dt>PPh final dari penjualan ini</dt>
                      <dd className={pra.pajak > 0 ? "is-buah" : "is-daun"}>
                        {!statusForm.aktif ? "Tarif umum" : pra.pajak > 0 ? formatRp(pra.pajak) : "Rp 0, bebas"}
                      </dd>
                    </div>
                    <div>
                      <dt>Omzet {pra.tahun} setelah ini</dt>
                      <dd>{formatRpSingkat(pra.omzetSesudah)}</dd>
                    </div>
                  </dl>
                  {statusForm.aktif && pra.pajak === 0 && (
                    <p className="st-nota__catatan">Sisa omzet bebas pajak tahun {pra.tahun}: {formatRp(pra.sisaBebas)}.</p>
                  )}
                  {statusForm.aktif && pra.pajak > 0 && !pra.geser && (
                    <p className="st-nota__catatan">
                      {pra.omzetSebelum < batas ? "Hanya bagian omzet di atas Rp500 juta yang dikenai 0,5%. " : ""}
                      Setor paling lambat {formatJatuhTempo(pra.tahun, urai(form.tanggal).m)}.
                    </p>
                  )}
                  {statusForm.aktif && pra.geser && (
                    <p className="st-nota__catatan">
                      Tanggalnya lebih awal dari penjualan lain di {pra.tahun}, jadi pajak beberapa bulan ikut bergeser. Periksa menu Rekap setelah menyimpan.
                    </p>
                  )}
                  {!statusForm.aktif && (
                    <p className="st-nota__catatan">Tahun {pra.tahun} sudah di luar fasilitas tarif 0,5%. Hubungi KPP untuk cara menghitung dengan tarif umum.</p>
                  )}
                </section>
              ) : (
                <div className="st-nota-kosong">
                  <IconTimbangan />
                  <p>Isi berat dan harga per kg. Nilai penjualan dan pajaknya langsung muncul di sini.</p>
                </div>
              )}

              <button type="submit" className="st-cta">
                {editId !== null ? "Simpan perubahan" : "Simpan penjualan"}
              </button>
              {editId !== null && (
                <button type="button" className="st-btn-sekunder st-mb-m" onClick={() => { batalEdit(); pindahTab("home"); }}>Batal mengubah</button>
              )}

              <aside className="st-panduan">
                <h2 className="st-h3">Aturan singkat ({ATURAN.dasarHukum})</h2>
                <ul>
                  <li>Omzet sampai <b>Rp500 juta setahun</b> tidak dikenai pajak.</li>
                  <li>Omzet di atasnya dikenai <b>PPh final 0,5%</b>.</li>
                  <li>Pajak disetor paling lambat <b>tanggal 15 bulan berikutnya</b>.</li>
                  <li>Suami dan istri yang sama-sama berusaha: catat omzet keduanya di sini, karena batasnya dihitung bersama.</li>
                </ul>
              </aside>
            </div>
          </form>
        )}

        {/* ================= REKAP ================= */}
        {tab === "rekap" && (
          <>
            <div className="st-baris-judul st-baris-judul--besar">
              <h1 className="st-h1 st-mb-0">Rekap {tahun}</h1>
              {tombolUnduh}
            </div>
            <StatusFasilitas status={status} tahun={tahun} />
            <dl className="st-ringkas">
              <div><dt>Omzet</dt><dd>{formatRpSingkat(T.omzet)}</dd></div>
              <div><dt>PPh terutang</dt><dd className="is-buah">{formatRpSingkat(T.pajak)}</dd></div>
              <div><dt>Belum disetor</dt><dd>{formatRpSingkat(belumSetorTahun)}</dd></div>
            </dl>
            <ul className="st-bulan">
              {hasil.bulan.map((b) => {
                const max = Math.max(...hasil.bulan.map((x) => x.omzet), 1);
                const key = `${tahun}-${b.bulan}`;
                const lunas = !!setorMap[key];
                const lewat = !lunas && b.setor > 0 && sudahLewatJatuhTempo(tahun, b.bulan);
                if (!b.jumlah) {
                  return (
                    <li key={b.bulan} className="st-bulan__kosong">
                      <span>{BULAN[b.bulan]}</span><span>Tidak ada penjualan</span>
                    </li>
                  );
                }
                return (
                  <li key={b.bulan} className="st-bulan__isi">
                    <div className="st-bulan__atas">
                      <div>
                        <div className="st-bulan__nama">{BULAN[b.bulan]}</div>
                        <div className="st-kecil st-mt-0">{b.jumlah} penjualan</div>
                      </div>
                      <div className="st-kanan">
                        <div className="st-bulan__omzet">{formatRp(b.omzet)}</div>
                        <div className={`st-kecil st-mt-0 ${b.pajak > 0 ? "is-buah" : "is-daun"}`}>
                          {b.pajak > 0 ? `PPh ${formatRp(b.pajak)}` : status.aktif ? "Bebas pajak" : "Tarif umum"}
                        </div>
                      </div>
                    </div>
                    <div className="st-bar"><div style={{ width: `${(b.omzet / max) * 100}%` }} /></div>
                    {b.potong > 0 && (
                      <p className="st-kecil">Dipotong pembeli {formatRp(b.potong)}. Disetor sendiri {formatRp(b.setor)}{b.lebih > 0 ? `. Lebih potong ${formatRp(b.lebih)}` : ""}.</p>
                    )}
                    {b.setor > 0 && (
                      <div className="st-bulan__setor">
                        <span className={lunas ? "is-daun" : lewat ? "is-merah" : ""}>
                          {lunas
                            ? `Ditandai sudah disetor${typeof setorMap[key] === "string" ? ` pada ${formatTanggal(setorMap[key])}` : ""}`
                            : `${lewat ? "Terlambat, jatuh tempo" : "Jatuh tempo"} ${formatJatuhTempo(tahun, b.bulan)}`}
                        </span>
                        <button type="button" className={`st-chip ${lunas ? "st-chip--polos" : ""}`} onClick={() => tandaiSetor(tahun, b.bulan)}>
                          {lunas ? "Batalkan tanda" : "Tandai sudah setor"}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="st-kecil">Jatuh tempo yang jatuh di akhir pekan otomatis digeser ke Senin. Libur nasional belum diperhitungkan.</p>
          </>
        )}

        {/* ================= SPT ================= */}
        {tab === "spt" && (
          <>
            <div className="st-baris-judul st-baris-judul--besar">
              <h1 className="st-h1 st-mb-0">Bahan SPT Tahunan {tahun}</h1>
              {tombolUnduh}
            </div>
            <p className="st-lead">Angka di bawah ini dipakai saat melapor SPT Tahunan orang pribadi di Coretax DJP, paling lambat 31 Maret {tahun + 1}.</p>

            <div className="st-dua-kolom st-dua-kolom--spt">
              <div className="st-kolom">
                <section className="st-blok">
                  <h2 className="st-h2">Ringkasan</h2>
                  <dl className="st-tabel-dl">
                    <div><dt>Peredaran bruto (omzet)</dt><dd>{formatRp(T.omzet)}</dd></div>
                    <div><dt>Bagian tidak kena pajak</dt><dd>{formatRp(Math.min(T.omzet, batas))}</dd></div>
                    <div><dt>Peredaran bruto kena pajak</dt><dd>{formatRp(T.kena)}</dd></div>
                    <div><dt>PPh final 0,5% terutang</dt><dd className="is-buah">{formatRp(T.pajak)}</dd></div>
                    {adaPotong && <div><dt>Dipotong pembeli</dt><dd>{formatRp(T.potong)}</dd></div>}
                    {adaPotong && <div><dt>Disetor sendiri</dt><dd>{formatRp(T.setor)}</dd></div>}
                  </dl>
                </section>

                <section className="st-blok">
                  <h2 className="st-h2">Langkah di Coretax</h2>
                  <ol className="st-langkah">
                    <li>
                      <b>Induk SPT.</b> Pada pertanyaan peredaran bruto tertentu, pilih "Ya, termasuk WP OP yang memiliki peredaran bruto tertentu yang dikenakan PPh final".
                    </li>
                    <li>
                      <b>Lampiran 3B Bagian A.</b> Isi peredaran bruto tiap bulan sesuai tabel. Coretax menghitung sendiri bagian di atas Rp500 juta dan PPh finalnya.
                    </li>
                    <li>
                      <b>Lampiran 2 Bagian A.</b> Setoran dengan kode {ATURAN.kodeBilling} terisi otomatis dari Buku Besar. Periksa jumlahnya sama dengan yang sudah disetor.
                    </li>
                    <li>
                      <b>Lampiran 1 Bagian A.</b> Laporkan kebun sawit sebagai harta berupa tanah atau lahan untuk usaha, lengkap dengan lokasi, tahun perolehan, dan nilainya.
                    </li>
                  </ol>
                </section>

                <section className="st-panduan">
                  <h2 className="st-h3">Perlu diingat</h2>
                  <ul>
                    <li>PPh final tidak dihitung ulang di SPT. Cukup dilaporkan.</li>
                    <li>Bila ada bulan yang kurang setor, setor dulu sebelum mengirim SPT.</li>
                    <li>Pajak yang dipotong pembeli dicatat dari bukti potong di Coretax (menu Dokumen Saya).</li>
                  </ul>
                </section>
              </div>

              <div className="st-kolom">
                <section className="st-blok st-blok--flush">
                  <div className="st-tabel-judul">Isian Lampiran 3B Bagian A</div>
                  <table className="st-tabel">
                    <thead>
                      <tr><th scope="col">Bulan</th><th scope="col">Peredaran bruto</th><th scope="col">PPh 0,5%</th></tr>
                    </thead>
                    <tbody>
                      {hasil.bulan.map((b) => (
                        <tr key={b.bulan} className={b.omzet ? "" : "is-redup"}>
                          <th scope="row">{BULAN[b.bulan]}</th>
                          <td>{b.omzet ? formatRp(b.omzet) : "—"}</td>
                          <td className={b.pajak ? "is-buah" : ""}>{b.pajak ? formatRp(b.pajak) : b.omzet ? "0" : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr><th scope="row">Total</th><td>{formatRp(T.omzet)}</td><td className="is-buah">{formatRp(T.pajak)}</td></tr>
                    </tfoot>
                  </table>
                </section>
              </div>
            </div>
          </>
        )}

        <Bantuan />
      </main>

      {/* ---------- Pengaturan ---------- */}
      {bukaAtur && (
        <div className="st-overlay" onClick={(e) => e.target === e.currentTarget && setBukaAtur(false)}>
          <div className="st-sheet" role="dialog" aria-modal="true" aria-labelledby="judul-atur">
            <div className="st-baris-judul">
              <h2 id="judul-atur" className="st-h1 st-mb-0">Pengaturan</h2>
              <button type="button" className="st-ikonbtn st-ikonbtn--gelap" onClick={() => setBukaAtur(false)} aria-label="Tutup"><IconX /></button>
            </div>

            <h3 className="st-h3">Cadangan data</h3>
            <p className="st-kecil st-mt-0">Data hanya tersimpan di browser perangkat ini. Bila HP diganti atau riwayat browser dihapus, data hilang. Unduh cadangan secara berkala.</p>
            <div className="st-sepasang st-mt-s">
              <button type="button" className="st-btn-sekunder" onClick={unduhCadangan} disabled={!records.length}>Unduh cadangan</button>
              <button type="button" className="st-btn-sekunder" onClick={() => fileRef.current?.click()}>Pulihkan dari file</button>
            </div>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={pulihkan} />
            <button type="button" className="st-btn-bahaya" onClick={hapusSemua} disabled={!records.length}>Hapus semua data</button>

            <h3 className="st-h3">Butuh bantuan?</h3>
            <KontakBantuan />

            <p className="st-kecil st-tentang">
              Dasar hitung: {ATURAN.dasarHukum}. SITANDAN adalah alat bantu pencatatan, bukan penetapan pajak.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Konfirmasi ---------- */}
      {konfirmasi && (
        <div className="st-overlay st-overlay--tengah" onClick={(e) => e.target === e.currentTarget && setKonfirmasi(null)}>
          <div className="st-dialog" role="alertdialog" aria-modal="true" aria-labelledby="judul-konf" aria-describedby="isi-konf">
            <h2 id="judul-konf" className="st-h2">{konfirmasi.judul}</h2>
            <p id="isi-konf" className="st-kecil">{konfirmasi.isi}</p>
            <div className="st-sepasang st-mt-l">
              <button type="button" className="st-btn-sekunder" onClick={() => setKonfirmasi(null)} autoFocus>Batal</button>
              <button type="button" className={konfirmasi.bahaya ? "st-btn-bahaya st-mt-0" : "st-btn-utama"}
                onClick={() => { const a = konfirmasi.aksi; setKonfirmasi(null); a(); }}>
                {konfirmasi.tombol}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
//  Komponen kecil
// =====================================================================

function Isian({ id, label, galat, satuan, awalan, children }) {
  return (
    <div className={`st-isian ${galat ? "is-galat" : ""}`}>
      <label htmlFor={id} className="st-label">{label}</label>
      <div className="st-isian__kotak">
        {awalan && <span className="st-isian__awalan" aria-hidden="true">{awalan}</span>}
        {children}
        {satuan && <span className="st-isian__satuan" aria-hidden="true">{satuan}</span>}
      </div>
      {galat && <p className="st-galat" role="alert">{galat}</p>}
    </div>
  );
}

function StatusFasilitas({ status, tahun }) {
  if (status.aktif) return null;
  return (
    <p className="st-alert st-alert--merah">
      Omzet {status.tahunLewat} melewati Rp4,8 miliar, sehingga tahun {tahun} tidak lagi memakai PPh final 0,5%. Penghitungan memakai tarif umum dan pembukuan. Hubungi KPP untuk pendampingan.
    </p>
  );
}

function KontakBantuan() {
  return (
    <div className="st-kontak">
      <a className="st-kontak__wa" href={WA_URL} target="_blank" rel="noopener noreferrer">
        <IconChat />
        <span>
          <b>WhatsApp Helpdesk Kanwil DJP Riau</b>
          <small>{BANTUAN.waKanwilTampil}</small>
        </span>
      </a>
      <a className="st-kontak__telp" href={`tel:${BANTUAN.kringPajak}`}>
        <IconTelepon />
        <span>
          <b>Kring Pajak</b>
          <small>{BANTUAN.kringPajak}</small>
        </span>
      </a>
    </div>
  );
}

function Bantuan() {
  return (
    <footer className="st-bantuan">
      <div>
        <h2 className="st-h3 st-mt-0">Butuh bantuan?</h2>
        <p className="st-kecil st-mt-0">Datang ke KPP terdekat, atau hubungi lewat telepon dan WhatsApp.</p>
      </div>
      <KontakBantuan />
    </footer>
  );
}

function BarisTransaksi({ r, info, aktif, onEdit, onHapus }) {
  const pajak = info?.pajak || 0;
  return (
    <li className="st-trx">
      <div className="st-trx__atas">
        <div className="st-trx__kiri">
          <div className="st-trx__nama">{r.pembeli}</div>
          <div className="st-kecil st-mt-0">
            {formatTanggal(r.tanggal)}, {keAngka(r.beratKg).toLocaleString("id-ID")} kg × Rp {keAngka(r.hargaPerKg).toLocaleString("id-ID")}
          </div>
          {r.keterangan && <div className="st-kecil st-mt-0 st-trx__ket">{r.keterangan}</div>}
        </div>
        <div className="st-kanan">
          <div className="st-trx__rp">{formatRp(info?.omzet ?? omzetOf(r))}</div>
          <div className={`st-kecil st-mt-0 ${pajak > 0 ? "is-buah" : "is-daun"}`}>
            {!aktif ? "Tarif umum" : pajak > 0 ? `PPh ${formatRp(pajak)}` : "Bebas pajak"}
          </div>
          {potongOf(r) > 0 && <div className="st-kecil st-mt-0">Dipotong {formatRp(potongOf(r))}</div>}
        </div>
      </div>
      <div className="st-trx__aksi">
        <button type="button" className="st-chip st-chip--polos" onClick={onEdit}>Ubah</button>
        <button type="button" className="st-chip st-chip--polos st-chip--merah" onClick={onHapus} aria-label={`Hapus penjualan ke ${r.pembeli}`}>Hapus</button>
      </div>
    </li>
  );
}

// ---------- Ikon (SVG ringan, tanpa pustaka) ----------
const sv = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
function IconRumah() { return <svg {...sv}><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></svg>; }
function IconPena() { return <svg {...sv}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>; }
function IconGrafik() { return <svg {...sv}><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></svg>; }
function IconBerkas() { return <svg {...sv}><path d="M6 2h9l5 5v15H6z" /><path d="M14 2v6h6" /><path d="M9 13h8M9 17h6" /></svg>; }
function IconGir() { return <svg {...sv}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>; }
function IconPlus() { return <svg {...sv}><path d="M12 5v14M5 12h14" /></svg>; }
function IconX() { return <svg {...sv}><path d="M6 6l12 12M18 6L6 18" /></svg>; }
function IconPanah({ buka }) { return <svg {...sv} width={18} height={18} style={{ transform: buka ? "rotate(90deg)" : "none", transition: "transform .15s" }}><path d="M9 6l6 6-6 6" /></svg>; }
function IconTelepon() { return <svg {...sv}><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.4 1.8.7 2.7a2 2 0 01-.5 2.1L8 9.8a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.7.7a2 2 0 011.7 2z" /></svg>; }
function IconChat() { return <svg {...sv}><path d="M3 20l1.4-4.2A8 8 0 1112 20a8 8 0 01-3.9-1z" /><path d="M8.5 9.5c.3 2 2 3.8 4 4.4l1.2-1.1 1.8.8-.3 1.3c-3.3.2-6.7-3.1-6.6-6.4l1.3-.3.8 1.8z" fill="currentColor" stroke="none" /></svg>; }
function IconTimbangan() { return <svg {...sv} width={40} height={40} strokeWidth={1.6}><path d="M12 3v18M7 21h10" /><path d="M5 7h14" /><path d="M5 7l-3 7a3 3 0 006 0z" /><path d="M19 7l-3 7a3 3 0 006 0z" /></svg>; }

/** Ikon file unduhan: lembar bertekuk dengan label format */
function IconFile({ warna, teks }) {
  return (
    <svg width="34" height="40" viewBox="0 0 34 40" aria-hidden="true">
      <path d="M4 1h18l10 10v26a2 2 0 01-2 2H4a2 2 0 01-2-2V3a2 2 0 012-2z" fill="#fff" stroke={warna} strokeWidth="2" />
      <path d="M22 1v8a2 2 0 002 2h8" fill="none" stroke={warna} strokeWidth="2" />
      <rect x="0" y="20" width="30" height="13" rx="2" fill={warna} />
      <text x="15" y="30" textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#fff" fontFamily="system-ui,sans-serif">{teks}</text>
    </svg>
  );
}

/** Ikon SITANDAN: tandan buah sawit dari logo resmi SITANDAN (sr./assets/ikon-sitandan.webp). */
function LogoSitandan({ besar }) {
  const s = besar ? 72 : 48;
  return <img src={ikonSitandan} width={s} height={s} alt="" aria-hidden="true" className="st-logo" />;
}

// =====================================================================
//  Gaya
//  Palet: daun pelepah (hijau), buah matang (oranye-merah), kertas nota.
//  Satu huruf: Plus Jakarta Sans, angka tabular agar rupiah sejajar.
//  Mobile-first; ≥900px tata letak dua kolom dan menu pindah ke atas.
// =====================================================================
const CSS = `
.st{
  --daun:#1d4a2c; --daun-2:#2f6b3f; --daun-muda:#e3efdc; --pelepah:#9fc28a;
  --buah:#c4410f; --buah-muda:#fdeee4; --emas:#9a6a00; --emas-muda:#fff6dc;
  --merah:#b42318; --merah-muda:#fdecea;
  --kertas:#ffffff; --latar:#eef3ea; --tinta:#14231a; --tinta-2:#4b5f50; --tinta-3:#6f8173; --garis:#d6e0d2;
  --lebar:1120px;
  color-scheme: light;
  min-height:100vh; background:var(--latar); color:var(--tinta);
  font-family:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  font-size:16px; line-height:1.5; -webkit-font-smoothing:antialiased; text-align:left;
  padding-bottom:calc(84px + env(safe-area-inset-bottom));
  font-variant-numeric: tabular-nums;
}
.st *{box-sizing:border-box}
.st :where(button){font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.st button:disabled{opacity:.45;cursor:not-allowed}
.st :focus-visible{outline:3px solid #f5a623;outline-offset:2px;border-radius:8px}
.st :where(a){color:inherit}
.st-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* Strip instansi */
.st-instansi{background:#fff;border-bottom:1px solid var(--garis);padding-top:env(safe-area-inset-top)}
.st-instansi__in{max-width:var(--lebar);margin:0 auto;padding:6px 16px;display:flex;align-items:center;gap:12px;min-height:52px}
.st-instansi__logo{height:42px;width:auto;display:block;object-fit:contain}
.st-instansi__garis{width:1.5px;height:30px;background:#b9c4bb;flex:none}
.st-instansi__nama{font-weight:800;font-size:15px;letter-spacing:.06em;color:#12305a;line-height:1;white-space:nowrap}

/* Kepala aplikasi */
.st-lekat{position:sticky;top:0;z-index:20}
.st-head{background:var(--daun);color:#fff}
.st-head__in{max-width:var(--lebar);margin:0 auto;padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.st-brand{display:flex;align-items:center;gap:10px;min-width:0}
.st-logo{flex:none;display:block;border-radius:50%;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25))}
.st-hero{margin:-6px -8px 10px;text-align:center}
.st-hero img{display:block;width:100%;max-width:520px;height:auto;margin:0 auto}
.st-brand__teks{min-width:0}
.st-brand__nama{font-weight:800;font-size:22px;letter-spacing:.06em;line-height:1.05}
.st-brand__sub{font-size:11.5px;color:#d3e7c9;line-height:1.3;margin-top:3px}
.st-brand__sub span{display:block;white-space:nowrap}
.st-head__aksi{display:flex;gap:6px;align-items:center;flex:none}
.st-tahun{appearance:none;background:rgba(255,255,255,.14) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center;
  color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:10px;padding:8px 30px 8px 12px;font:inherit;font-weight:700;font-size:15px;min-height:44px}
.st-tahun option{color:var(--tinta);background:#fff}
.st-ikonbtn{width:44px;height:44px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);display:grid;place-items:center;color:#fff}
.st-ikonbtn--gelap{color:var(--tinta);border-color:var(--garis);background:#fff}

/* Menu: bawah di HP */
.st-nav{position:fixed;left:0;right:0;bottom:0;z-index:30;background:#fff;border-top:1px solid var(--garis);padding-bottom:env(safe-area-inset-bottom)}
.st-nav__in{display:flex;max-width:var(--lebar);margin:0 auto}
.st-nav__btn{position:relative;flex:1;min-height:62px;border:0;background:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:12px;font-weight:600;color:var(--tinta-3)}
.st-nav__btn.is-aktif{color:var(--daun)}
.st-nav__btn.is-aktif::before{content:"";position:absolute;top:0;left:28%;right:28%;height:3px;border-radius:0 0 3px 3px;background:var(--buah)}
.st-nav__titik{position:absolute;top:10px;left:calc(50% + 8px);width:9px;height:9px;border-radius:50%;background:var(--merah);border:2px solid #fff}

.st-main{max-width:var(--lebar);margin:0 auto;padding:16px 16px 8px}
.st-h1{font-size:22px;font-weight:800;letter-spacing:-.015em;margin:0 0 16px;line-height:1.25;color:var(--tinta)}
.st-h2{font-size:17px;font-weight:700;margin:0 0 10px;line-height:1.3;color:var(--tinta)}
.st-h3{font-size:15px;font-weight:700;margin:18px 0 6px}
.st-lead{color:var(--tinta-2);margin:0 0 16px;font-size:15px;max-width:68ch}
.st-kecil{font-size:13px;color:var(--tinta-2);margin:8px 0 0;line-height:1.5}
.st-mt-0{margin-top:0}.st-mb-0{margin-bottom:0}.st-mt-s{margin-top:10px}.st-mt-l{margin-top:18px}.st-mb-m{margin-bottom:16px}
.st-kanan{text-align:right}
.is-buah{color:var(--buah)!important}.is-daun{color:var(--daun-2)!important}.is-merah{color:var(--merah)!important}

.st-kolom{min-width:0}

/* Nota — struk timbangan toke dengan tepi bergerigi */
.st-nota{position:relative;background:var(--kertas);border-radius:6px;padding:18px 18px 16px;margin:4px 0 22px;
  box-shadow:0 1px 0 var(--garis),0 10px 24px -14px rgba(20,35,26,.35)}
.st-nota::after{content:"";position:absolute;left:0;right:0;bottom:-8px;height:8px;
  background:radial-gradient(circle at 8px 0,var(--kertas) 6px,transparent 6.5px) 0 0/16px 8px repeat-x}
.st-nota__judul{display:flex;justify-content:space-between;font-size:14px;color:var(--tinta-2);font-weight:600}
.st-nota__angka{font-size:clamp(30px,9vw,40px);font-weight:800;letter-spacing:-.025em;line-height:1.1;margin-top:6px;color:var(--daun);word-break:break-word}
.st-nota__angka--sedang{font-size:clamp(26px,7.5vw,34px)}
.st-nota__rumus{font-size:14px;color:var(--tinta-2);margin-top:8px}
.st-nota__garis{border-top:2px dashed var(--garis);margin:14px -4px 12px}
.st-nota__baris{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:0}
.st-nota__baris dt{font-size:12.5px;color:var(--tinta-3);line-height:1.3}
.st-nota__baris dd{margin:2px 0 0;font-size:17px;font-weight:700;white-space:nowrap}
.st-nota__catatan{margin:12px 0 0;font-size:13px;color:var(--tinta-2);background:var(--latar);border-radius:6px;padding:8px 10px}
.st-nota--form{border:1px solid var(--garis);margin-top:6px}
.st-nota-kosong{display:flex;gap:14px;align-items:center;border:2px dashed var(--pelepah);border-radius:10px;padding:16px;color:var(--tinta-2);margin:6px 0 20px;font-size:14px}
.st-nota-kosong p{margin:0}
.st-nota-kosong svg{flex:none;color:var(--daun-2)}

/* Blok umum */
.st-blok{background:var(--kertas);border-radius:12px;padding:16px;margin-bottom:14px;border:1px solid var(--garis)}
.st-blok--flush{padding:0;overflow:hidden}
.st-baris-judul{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.st-baris-judul--besar{margin:4px 0 14px}
.st-link{background:none;border:0;color:var(--daun-2);font-weight:700;font-size:14px;padding:10px 0;min-height:44px;text-decoration:underline;text-underline-offset:3px}

.st-meter{height:14px;background:var(--daun-muda);border-radius:99px;overflow:hidden}
.st-meter__isi{height:100%;background:var(--daun-2);border-radius:99px;transition:width .4s ease}
.st-meter__isi.is-penuh{background:var(--buah)}
.st-meter__ket{margin:10px 0 0;font-size:15px}

.st-alert{border-radius:10px;padding:12px 14px;font-size:14px;line-height:1.5;margin:0 0 14px}
.st-alert--emas{background:var(--emas-muda);color:#5e4100;border:1px solid #f1d78c}
.st-alert--buah{background:var(--buah-muda);color:#7a2a08;border:1px solid #f6c7a8;margin-top:12px;margin-bottom:0}
.st-alert--merah{background:var(--merah-muda);color:#7a1810;border:1px solid #f4b8b1}

.st-chip{border:0;background:var(--daun);color:#fff;font-size:13px;font-weight:700;border-radius:99px;padding:8px 14px;min-height:36px;white-space:nowrap}
.st-chip:active{transform:scale(.97)}
.st-chip--polos{background:#fff;color:var(--tinta-2);border:1px solid var(--garis)}
.st-chip--merah{color:var(--merah)}

/* Tagihan */
.st-tagihan{list-style:none;margin:0;padding:0}
.st-tagihan li{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--garis)}
.st-tagihan li:first-child{border-top:0;padding-top:2px}
.st-tagihan__bulan{font-weight:700}
.st-tagihan__jt{font-size:13px;color:var(--tinta-2)}
.st-tagihan li.is-lewat .st-tagihan__jt{color:var(--merah);font-weight:600}
.st-tagihan__kanan{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.st-tagihan__rp{font-weight:800;color:var(--buah);font-size:17px;white-space:nowrap}

/* Tombol */
.st-cta{width:100%;min-height:54px;border:0;border-radius:12px;background:var(--buah);color:#fff;font-weight:800;font-size:17px;
  display:flex;align-items:center;justify-content:center;gap:8px;margin:4px 0 22px;box-shadow:0 6px 16px -8px rgba(196,65,15,.7)}
.st-cta:active{transform:translateY(1px)}
.st-btn-utama{width:100%;min-height:48px;border-radius:12px;border:0;background:var(--daun);color:#fff;font-weight:700}
.st-btn-sekunder{width:100%;min-height:48px;border-radius:12px;border:1.5px solid var(--garis);background:#fff;font-weight:700;color:var(--tinta)}
.st-btn-bahaya{width:100%;min-height:48px;border-radius:12px;border:0;background:var(--merah);color:#fff;font-weight:700;margin-top:12px}

/* Unduh Excel/PDF */
.st-unduh{display:flex;align-items:center;gap:6px}
.st-unduh__label{font-size:14px;font-weight:700;color:var(--tinta-2);margin-right:2px}
.st-unduh__btn{width:48px;height:52px;border-radius:10px;border:1px solid var(--garis);background:#fff;display:grid;place-items:center;padding:0}
.st-unduh__btn:hover{border-color:var(--pelepah);background:#fbfdf9}
.st-unduh__btn:active{transform:scale(.96)}
.st-unduh__btn svg{width:28px;height:33px}

/* Daftar transaksi */
.st-daftar{list-style:none;margin:0;padding:0;background:#fff;border:1px solid var(--garis);border-radius:12px;overflow:hidden}
.st-trx{padding:14px 16px;border-top:1px solid var(--garis)}
.st-trx:first-child{border-top:0}
.st-trx__atas{display:flex;justify-content:space-between;gap:12px}
.st-trx__kiri{min-width:0}
.st-trx__nama{font-weight:700;overflow-wrap:anywhere}
.st-trx__ket{font-style:italic}
.st-trx__rp{font-weight:800;color:var(--daun);white-space:nowrap}
.st-trx__aksi{display:flex;gap:8px;margin-top:10px}
.st-kosong{text-align:center;padding:28px 20px;background:#fff;border:1px dashed var(--pelepah);border-radius:12px}
.st-kosong .st-logo{margin:0 auto;filter:none}
.st-kosong p{margin:10px 0 0}

/* Form */
.st-isian{margin-bottom:14px}
.st-label{display:block;font-size:14px;font-weight:700;margin-bottom:6px}
.st-isian__kotak{position:relative;display:flex;align-items:center}
.st-input{width:100%;min-height:52px;border:1.5px solid var(--garis);border-radius:10px;background:#fff;padding:12px 14px;font:inherit;font-size:17px;color:var(--tinta);appearance:none}
.st-input:focus{border-color:var(--daun-2);outline:none;box-shadow:0 0 0 3px rgba(47,107,63,.18)}
.st-input--angka{font-weight:700;font-variant-numeric:tabular-nums}
.st-isian__awalan{position:absolute;left:14px;color:var(--tinta-3);font-weight:600;pointer-events:none}
.st-isian__awalan + .st-input{padding-left:42px}
.st-isian__satuan{position:absolute;right:14px;color:var(--tinta-3);font-weight:600;pointer-events:none}
.st-isian:has(.st-isian__satuan) .st-input{padding-right:42px}
.st-isian.is-galat .st-input{border-color:var(--merah);background:#fffafa}
.st-galat{color:var(--merah);font-size:13px;font-weight:600;margin:6px 0 0}
.st-sepasang{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.st-sepasang > .st-isian{margin-bottom:6px}
.st-lipat{display:flex;align-items:center;gap:6px;background:none;border:0;padding:10px 0;min-height:44px;font-weight:700;color:var(--daun-2);font-size:15px;margin-top:4px}
.st-lipat__isi{border-left:3px solid var(--daun-muda);padding-left:12px;margin-bottom:6px}

.st-panduan{background:var(--daun-muda);border-radius:12px;padding:4px 16px 14px;margin:6px 0 14px;font-size:14px;color:var(--daun)}
.st-panduan ul{margin:0;padding-left:18px}
.st-panduan li{margin-top:6px}

/* Rekap */
.st-ringkas{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 14px}
.st-ringkas > div{background:#fff;border:1px solid var(--garis);border-radius:10px;padding:10px 12px;min-width:0}
.st-ringkas dt{font-size:12px;color:var(--tinta-3)}
.st-ringkas dd{margin:2px 0 0;font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-bulan{list-style:none;margin:0;padding:0}
.st-bulan__kosong{display:flex;justify-content:space-between;padding:10px 4px;font-size:14px;color:var(--tinta-3);border-bottom:1px dashed var(--garis)}
.st-bulan__isi{background:#fff;border:1px solid var(--garis);border-radius:12px;padding:14px 16px;margin:10px 0}
.st-bulan__atas{display:flex;justify-content:space-between;gap:10px}
.st-bulan__nama{font-weight:700}
.st-bulan__omzet{font-weight:800;color:var(--daun);white-space:nowrap}
.st-bar{height:6px;background:var(--daun-muda);border-radius:99px;margin-top:10px;overflow:hidden}
.st-bar > div{height:100%;background:var(--pelepah);border-radius:99px}
.st-bulan__setor{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;font-size:13px;font-weight:600;flex-wrap:wrap}

/* SPT */
.st-tabel-dl{margin:0}
.st-tabel-dl > div{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--garis);font-size:15px}
.st-tabel-dl > div:first-child{border-top:0;padding-top:0}
.st-tabel-dl dt{color:var(--tinta-2)}
.st-tabel-dl dd{margin:0;font-weight:700;text-align:right;white-space:nowrap}
.st-langkah{margin:0;padding-left:20px;font-size:15px}
.st-langkah li{margin-top:10px;padding-left:4px}
.st-langkah li::marker{font-weight:800;color:var(--daun-2)}
.st-tabel-judul{padding:12px 16px;font-weight:700;background:var(--daun-muda);color:var(--daun)}
.st-tabel{width:100%;border-collapse:collapse;font-size:14px}
.st-tabel th,.st-tabel td{padding:9px 12px;white-space:nowrap;text-align:right;border-top:1px solid var(--garis)}
.st-tabel th[scope=row],.st-tabel thead th:first-child{text-align:left;font-weight:600}
.st-tabel thead th{font-size:12.5px;color:var(--tinta-3);font-weight:600;border-top:0}
.st-tabel tr.is-redup{color:var(--tinta-3)}
.st-tabel tfoot th,.st-tabel tfoot td{font-weight:800;border-top:2px solid var(--daun);color:var(--daun)}

/* Bantuan */
.st-bantuan{margin-top:20px;padding:18px 0 8px;border-top:1px solid var(--garis)}
.st-kontak{display:grid;gap:10px;margin-top:10px}
.st-kontak a{display:flex;align-items:center;gap:12px;text-decoration:none;border-radius:12px;padding:12px 14px;min-height:56px}
.st-kontak a span{display:flex;flex-direction:column;line-height:1.3}
.st-kontak small{font-size:14px;font-weight:600}
.st-kontak__wa{background:#1f8a4c;color:#fff}
.st-kontak__wa:hover{background:#18763f}
.st-kontak__telp{background:#fff;border:1.5px solid var(--garis);color:var(--tinta)}
.st-kontak__telp svg{color:var(--daun-2)}

/* Toast, overlay, dialog */
.st-toast{position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top));transform:translateX(-50%);z-index:60;max-width:calc(100% - 32px);
  padding:12px 18px;border-radius:12px;color:#fff;font-size:14px;font-weight:600;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);animation:st-masuk .22s ease-out;text-align:center}
.st-toast--ok{background:var(--daun)}.st-toast--error{background:var(--merah)}.st-toast--info{background:#3f4a43}
@keyframes st-masuk{from{opacity:0;transform:translate(-50%,-8px)}to{opacity:1;transform:translate(-50%,0)}}
.st-overlay{position:fixed;inset:0;z-index:50;background:rgba(10,20,14,.5);display:flex;align-items:flex-end;justify-content:center}
.st-overlay--tengah{align-items:center;padding:20px}
.st-sheet{background:var(--latar);width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom));animation:st-naik .22s ease-out}
.st-tentang{margin-top:18px}
@keyframes st-naik{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}
.st-dialog{background:#fff;border-radius:16px;padding:20px;width:100%;max-width:380px}

/* HP kecil */
@media (max-width:440px){
  .st-head__in{gap:8px;padding:10px 12px 10px 14px}
  .st-logo{width:44px;height:44px}
  .st-brand{gap:8px}
  .st-brand__sub{font-size:10.5px}
  .st-tahun{padding:8px 26px 8px 10px;background-position:right 8px center}
  .st-ikonbtn{width:42px}
}
@media (max-width:380px){
  .st-brand__nama{font-size:19px}
  .st-brand__sub{font-size:9.5px}
  .st-instansi__nama{font-size:13.5px}
  .st-instansi__logo{height:38px}
}

/* Tablet */
@media (min-width:600px){
  .st-kontak{grid-template-columns:1fr 1fr}
  .st-instansi__logo{height:50px}
  .st-instansi__garis{height:34px}
  .st-instansi__nama{font-size:18px}
  .st-brand__sub span{display:inline}
}

/* Desktop */
@media (min-width:900px){
  .st{padding-bottom:24px}
  .st-instansi__in{min-height:68px}
  .st-instansi__logo{height:58px}
  .st-instansi__garis{height:40px}
  .st-instansi__nama{font-size:21px}
  .st-head__in{padding:12px 24px}
  .st-brand__nama{font-size:26px}
  .st-brand__sub{font-size:13px}
  .st-logo{width:54px;height:54px}

  .st-nav{position:static;background:var(--daun);border-top:1px solid rgba(255,255,255,.12);padding:0;box-shadow:0 6px 16px -10px rgba(20,35,26,.5)}
  .st-nav__in{padding:0 16px;gap:4px}
  .st-nav__btn{flex:none;flex-direction:row;gap:8px;min-height:48px;padding:0 18px;font-size:15px;color:#cfe3c6}
  .st-nav__btn:hover{color:#fff;background:rgba(255,255,255,.06)}
  .st-nav__btn.is-aktif{color:#fff}
  .st-nav__btn.is-aktif::before{top:auto;bottom:0;left:12px;right:12px;height:3px;border-radius:3px 3px 0 0;background:#ee7a1e}
  .st-nav__titik{top:12px;left:auto;right:8px;border-color:var(--daun)}

  .st-main{padding:28px 24px 16px}
  .st-hero{margin:-10px 0 18px}
  .st-hero img{max-width:500px}
  .st-h1{font-size:26px}
  .st-dua-kolom{display:grid;gap:28px;align-items:start}
  .st-dua-kolom--home{grid-template-columns:minmax(0,5fr) minmax(0,7fr)}
  .st-dua-kolom--catat{grid-template-columns:minmax(0,7fr) minmax(0,5fr)}
  .st-dua-kolom--spt{grid-template-columns:minmax(0,6fr) minmax(0,5fr)}
  .st-kolom--lekat{position:sticky;top:150px}
  .st-dua-kolom--catat .st-kolom:first-child{background:#fff;border:1px solid var(--garis);border-radius:14px;padding:22px 24px 12px}
  .st-nota--form{margin-top:0}
  .st-nota-kosong{margin-top:0}

  .st-ringkas{gap:12px}
  .st-ringkas > div{padding:14px 16px}
  .st-ringkas dd{font-size:20px}
  .st-bulan{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;align-items:start}
  .st-bulan__isi{margin:0}
  .st-bulan__kosong{border:1px dashed var(--garis);border-radius:12px;padding:14px 16px;flex-direction:column;gap:2px;min-height:76px}
  .st-bulan__kosong span:first-child{font-weight:700;color:var(--tinta-2)}

  .st-bantuan{display:grid;grid-template-columns:1fr minmax(0,600px);gap:24px;align-items:center}
  .st-bantuan .st-kontak{margin-top:0}

  .st-overlay{align-items:center;padding:24px}
  .st-sheet{border-radius:18px;max-width:520px;padding:22px}
}
@media (min-width:1200px){
  .st-bulan{grid-template-columns:repeat(4,minmax(0,1fr))}
}

@media (prefers-reduced-motion:reduce){.st *{animation:none!important;transition:none!important}}
`;
