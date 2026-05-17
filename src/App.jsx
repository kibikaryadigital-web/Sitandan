import { useState, useMemo, useEffect } from "react";
import logoKemenkeu from "./assets/logo-kemenkeu.png";
import bannerSitandan from "./assets/banner-sitandan.png";

const STORAGE_KEY = "sitandan_records";
const BATAS_UMKM = 500000000;
const TARIF_PPH = 0.005;

const COLORS = {
  bg: "#f4f7f2",
  white: "#ffffff",
  primary: "#14532d",
  primary2: "#1b5e20",
  primarySoft: "#edf7ee",
  border: "#dce5dc",
  text: "#1f2937",
  textSoft: "#6b7280",
  gold: "#d4a017",
};

function formatRupiah(num) {
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function App() {
  const [records, setRecords] = useState([]);
const [editId, setEditId] = useState(null);
const [
  showAllTransactions,
  setShowAllTransactions,
] = useState(false);
  const [form, setForm] = useState({
    tanggal: "",
    pembeli: "",
    beratKg: "",
    hargaPerKg: "",
  });

  // LOAD STORAGE
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved) {
      setRecords(JSON.parse(saved));
    }
  }, []);

  // SAVE STORAGE
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(records)
    );
  }, [records]);

  // TOTAL OMZET
  const totalOmzet = useMemo(() => {
    return records.reduce((sum, item) => {
      return (
        sum +
        Number(item.beratKg || 0) *
          Number(item.hargaPerKg || 0)
      );
    }, 0);
  }, [records]);

  // TOTAL TRANSAKSI
  const totalTransaksi = records.length;

  // TOTAL PREVIEW
// TOTAL PREVIEW
const totalPreview =
  Number(form.beratKg || 0) *
  Number(form.hargaPerKg || 0);

// ESTIMASI PPH FINAL
const omzetKenaPajak =
  Math.max(
    totalOmzet - BATAS_UMKM,
    0
  );

const estimasiPph =
  omzetKenaPajak * TARIF_PPH;

// SISA BATAS UMKM
const sisaBatas =
  BATAS_UMKM - totalOmzet;

// PERSENTASE PROGRESS
const progressPersen = Math.min(
  (totalOmzet / BATAS_UMKM) * 100,
  100
);
// BULAN INDONESIA
const namaBulan = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

// CURRENT DATE
const now = new Date();

const currentMonth =
  now.getMonth();

const currentYear =
  now.getFullYear();

// PREVIOUS MONTH
const previousMonth =
  currentMonth === 0
    ? 11
    : currentMonth - 1;

const previousYear =
  currentMonth === 0
    ? currentYear - 1
    : currentYear;

// FILTER CURRENT MONTH
const transaksiCurrentMonth =
  records.filter((item) => {
    const tgl =
      new Date(item.tanggal);

    return (
      tgl.getMonth() ===
        currentMonth &&
      tgl.getFullYear() ===
        currentYear
    );
  });

// FILTER PREVIOUS MONTH
const transaksiPreviousMonth =
  records.filter((item) => {
    const tgl =
      new Date(item.tanggal);

    return (
      tgl.getMonth() ===
        previousMonth &&
      tgl.getFullYear() ===
        previousYear
    );
  });

// TOTAL CURRENT MONTH
const omzetCurrentMonth =
  transaksiCurrentMonth.reduce(
    (sum, item) => {
      return (
        sum +
        Number(item.beratKg || 0) *
          Number(
            item.hargaPerKg || 0
          )
      );
    },
    0
  );

// TOTAL PREVIOUS MONTH
const omzetPreviousMonth =
  transaksiPreviousMonth.reduce(
    (sum, item) => {
      return (
        sum +
        Number(item.beratKg || 0) *
          Number(
            item.hargaPerKg || 0
          )
      );
    },
    0
  );

// PPH CURRENT MONTH
const pphCurrentMonth =
  estimasiPph;

// PPH PREVIOUS MONTH
const omzetSebelumBulanLalu =
  totalOmzet -
  omzetCurrentMonth -
  omzetPreviousMonth;

const omzetKenaPajakPrevious =
  Math.max(
    omzetSebelumBulanLalu +
      omzetPreviousMonth -
      BATAS_UMKM,
    0
  );

const pphPreviousMonth =
  omzetKenaPajakPrevious *
  TARIF_PPH;

// DEADLINE SETOR
// DEADLINE SETOR
const deadlineDate =
  `20 ${
    namaBulan[
      (currentMonth + 1) % 12
    ]
  } ${
    currentMonth === 11
      ? currentYear + 1
      : currentYear
  }`;

// GROUP TRANSAKSI
const groupedTransactions =
  records.reduce((groups, item) => {
    const date =
      new Date(item.tanggal);

    const key =
      `${namaBulan[
        date.getMonth()
      ]} ${date.getFullYear()}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(item);

    return groups;
  }, {});
// DELETE TRANSACTION
function handleDelete(id) {
  const confirmDelete = window.confirm(
    "Hapus transaksi ini?"
  );

  if (!confirmDelete) return;

  const updated =
    records.filter(
      (item) => item.id !== id
    );

  setRecords(updated);
}

// EDIT TRANSACTION
function handleEdit(item) {
  setForm({
    tanggal: item.tanggal,
    pembeli: item.pembeli,
    beratKg: item.beratKg,
    hargaPerKg: item.hargaPerKg,
  });

  setEditId(item.id);

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
  // SUBMIT
  
function handleSubmit() {
  if (
    !form.tanggal ||
    !form.pembeli ||
    !form.beratKg ||
    !form.hargaPerKg
  ) {
    alert("Lengkapi seluruh data.");
    return;
  }

  // MODE EDIT
  if (editId) {
    const updatedRecords =
      records.map((item) => {
        if (item.id === editId) {
          return {
            ...item,
            ...form,
          };
        }

        return item;
      });

    setRecords(updatedRecords);

    setEditId(null);

    alert("Data berhasil diupdate.");
  }

  // MODE TAMBAH
  else {
    const newRecord = {
      id: Date.now(),
      ...form,
    };

    setRecords([
      newRecord,
      ...records,
    ]);

    alert("Data berhasil disimpan.");
  }

  // RESET FORM
  setForm({
    tanggal: "",
    pembeli: "",
    beratKg: "",
    hargaPerKg: "",
  });
}

  return (
    <div
      style={{
        background: COLORS.bg,
        minHeight: "100vh",
        padding: "24px 16px 80px",
        fontFamily:
          "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      {/* CONTAINER */}
      <div
        style={{
          maxWidth: "520px",
          margin: "0 auto",
        }}
      >
        {/* TOP BAR */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          <img
            src={logoKemenkeu}
            style={{
              width: "64px",
              height: "64px",
              objectFit: "contain",
            }}
          />

          <div
            style={{
              width: "1px",
              height: "64px",
              background: "#d1d5db",
            }}

          />

          <div>
            <div
              style={{
                marginTop: "8px",
      fontSize: "15px",
      fontWeight: "700",
      color: COLORS.text,
      marginLeft: "4px",
              }}
            >
              Kanwil DJP Riau
            </div>
          </div>
        </div>

{/* HERO BANNER */}
<div
  style={{
    marginBottom: "18px",
  }}
>
  <img
    src={bannerSitandan}
    alt="Banner SITANDAN"
    style={{
      width: "100%",
      borderRadius: "28px",
      display: "block",
      boxShadow:
        "0 10px 30px rgba(0,0,0,0.15)",
    }}
  />
</div>
        {/* DASHBOARD */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          {/* OMZET */}
          <div style={cardStyle}>
            <div style={iconCircle}>
              💰
            </div>

            <div>
              <div style={labelStyle}>
                Total Omzet
              </div>

              <div style={valueStyle}>
                {formatRupiah(totalOmzet)}
              </div>
            </div>
          </div>

          {/* TRANSAKSI */}
          <div style={cardStyle}>
            <div style={iconCircle}>
              📋
            </div>

            <div>
              <div style={labelStyle}>
                Total Transaksi
              </div>

              <div style={valueStyle}>
                {totalTransaksi}
              </div>
            </div>
          </div>
        </div>

        {/* FORM */}
        <div style={formCard}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "20px",
            }}
          >
            <div
              style={{
                fontSize: "30px",
              }}
            >
              📝
            </div>

            <h2
              style={{
                margin: 0,
                color: COLORS.primary,
                fontSize: "34px",
              }}
            >
              Catat Penjualan TBS
            </h2>
          </div>

          {/* TANGGAL */}
          <div style={fieldStyle}>
            <label style={labelInput}>
              Tanggal Penjualan
            </label>

            <input
              type="date"
              value={form.tanggal}
              onChange={(e) =>
                setForm({
                  ...form,
                  tanggal: e.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          {/* PEMBELI */}
          <div style={fieldStyle}>
            <label style={labelInput}>
              Nama PKS / Pembeli
            </label>

            <input
              type="text"
              placeholder="Contoh: PKS Sawit Makmur"
              value={form.pembeli}
              onChange={(e) =>
                setForm({
                  ...form,
                  pembeli: e.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          {/* BERAT */}
          <div style={fieldStyle}>
            <label style={labelInput}>
              Berat TBS (kg)
            </label>

            <input
              type="number"
              placeholder="Contoh: 2500"
              value={form.beratKg}
              onChange={(e) =>
                setForm({
                  ...form,
                  beratKg: e.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          {/* HARGA */}
          <div style={fieldStyle}>
            <label style={labelInput}>
              Harga per kg
            </label>

            <input
              type="number"
              placeholder="Contoh: 2400"
              value={form.hargaPerKg}
              onChange={(e) =>
                setForm({
                  ...form,
                  hargaPerKg: e.target.value,
                })
              }
              style={inputStyle}
            />
          </div>

          {/* ESTIMASI */}
          <div
            style={{
              background: COLORS.primarySoft,
              borderRadius: "18px",
              padding: "20px",
              marginBottom: "20px",
              textAlign: "center",
            }}
          >
            <div style={labelStyle}>
              Estimasi Total Penjualan
            </div>

            <div
              style={{
                marginTop: "8px",
                fontSize: "42px",
                fontWeight: "800",
                color: COLORS.primary,
              }}
            >
              {formatRupiah(totalPreview)}
            </div>
          </div>
{/* STATUS UMKM */}
<div
  style={{
    background: "#f8faf8",
    border: "1px solid #dce5dc",
    borderRadius: "20px",
    padding: "20px",
    marginBottom: "20px",
  }}
>
  <div
    style={{
      fontSize: "18px",
      fontWeight: "700",
      color: COLORS.primary,
      marginBottom: "16px",
    }}
  >
    📈 Status Omzet UMKM
  </div>

  {/* OMZET */}
  <div style={{ marginBottom: "10px" }}>
    <div style={labelStyle}>
      Omzet Tahun Ini
    </div>

    <div
      style={{
        marginTop: "4px",
        fontSize: "24px",
        fontWeight: "800",
        color: COLORS.primary,
      }}
    >
      {formatRupiah(totalOmzet)}
    </div>
  </div>

  {/* PROGRESS */}
  <div
    style={{
      width: "100%",
      height: "12px",
      background: "#e5e7eb",
      borderRadius: "999px",
      overflow: "hidden",
      marginBottom: "14px",
    }}
  >
    <div
      style={{
        width: `${progressPersen}%`,
        height: "100%",
        background:
          "linear-gradient(90deg,#16a34a,#22c55e)",
        borderRadius: "999px",
      }}
    />
  </div>

  {/* SISA */}
  <div
    style={{
      marginBottom: "10px",
    }}
  >
    <div style={labelStyle}>
      Sisa Batas Bebas UMKM
    </div>

    <div
      style={{
        marginTop: "4px",
        fontWeight: "700",
color: COLORS.primary,
      }}
    >
      {formatRupiah(
        Math.max(sisaBatas, 0)
      )}
    </div>
  </div>
{/* OMZET KENA PAJAK */}
<div
  style={{
    marginBottom: "10px",
  }}
>
  <div style={labelStyle}>
    Omzet Kena Pajak
  </div>

  <div
    style={{
      marginTop: "4px",
      fontWeight: "700",
color: COLORS.primary,
    }}
  >
    {formatRupiah(
      omzetKenaPajak
    )}
  </div>
</div>
{/* ESTIMASI PPH TAHUNAN */}
<div
  style={{
    marginBottom: "18px",
  }}
>
  <div style={labelStyle}>
    💰 Estimasi PPh Final UMKM Dalam Setahun
  </div>

  <div
    style={{
      marginTop: "6px",
      fontWeight: "800",
      fontSize: "22px",
      color: COLORS.primary,
    }}
  >
    {formatRupiah(
      estimasiPph
    )}
  </div>
</div>

{/* PPH MASA BERJALAN */}
<div
  style={{
    marginBottom: "18px",
    padding: "14px",
    background: "#f8faf8",
    borderRadius: "16px",
    border:
      "1px solid #dce5dc",
  }}
>
  <div style={labelStyle}>
    🗓 Estimasi PPh Final UMKM Masa{" "}
    {namaBulan[currentMonth]}{" "}
    {currentYear}
  </div>

  <div
    style={{
      marginTop: "6px",
      fontWeight: "800",
      color: COLORS.primary,
      fontSize: "20px",
    }}
  >
    {formatRupiah(
      pphCurrentMonth
    )}
  </div>

  <div
    style={{
      marginTop: "8px",
      fontSize: "13px",
      color: COLORS.textSoft,
      lineHeight: "1.5",
    }}
  >
    Disetorkan paling lambat
    setiap tanggal 20 bulan
    berikutnya.
  </div>

  <div
    style={{
      marginTop: "4px",
      fontWeight: "700",
      color: COLORS.primary,
    }}
  >
    Deadline:
    {" "}
    {deadlineDate}
  </div>
</div>

{/* PPH MASA SEBELUMNYA */}
<div>
  <div style={labelStyle}>
    🧾 Estimasi PPh Final UMKM Masa{" "}
    {namaBulan[
      previousMonth
    ]}{" "}
    {previousYear}
  </div>

  <div
    style={{
      marginTop: "6px",
      fontWeight: "800",
      color: COLORS.primary,
      fontSize: "18px",
    }}
  >
    {formatRupiah(
      pphPreviousMonth
    )}
  </div>
</div>

</div>
          {/* BUTTON */}
          <button
            onClick={handleSubmit}
            style={{
              width: "100%",
              padding: "18px",
              border: "none",
              borderRadius: "18px",
              background:
                "linear-gradient(135deg,#14532d,#2e7d32)",
              color: "white",
              fontSize: "24px",
              fontWeight: "700",
              cursor: "pointer",
              boxShadow:
                "0 10px 20px rgba(20,83,45,0.3)",
            }}
          >
{editId
  ? "✏ Update Penjualan"
  : "💾 Simpan Penjualan"}
          </button>
        </div>

        {/* HELPDESK */}
        <div
          style={{
            marginTop: "18px",
            background: COLORS.white,
            borderRadius: "24px",
            padding: "20px",
            border: `1px solid ${COLORS.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}
          >
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                background: "#22c55e",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "38px",
                boxShadow:
                  "0 8px 20px rgba(34,197,94,0.3)",
              }}
            >
              ☎
            </div>

            <div>
              <div
                style={{
                  fontWeight: "600",
                  fontSize: "15px",
                  color: COLORS.primary,
                }}
              >
                Butuh Bantuan?
              </div>

              <div
                style={{
                  marginTop: "5px",
                  color: COLORS.textSoft,
                  lineHeight: 1.5,
                }}
              >
                Hubungi Helpdesk
                Kanwil DJP Riau
                <br />
                Kami siap membantu Anda.
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: "right",
            }}
          >
            <div
              style={{
                fontSize: "15px",
                fontWeight: "600",
                color: COLORS.primary,
              }}
            >
              0811 777 4040
            </div>

            <div
              style={{
                marginTop: "6px",
                color: "#16a34a",
                fontSize: "14px",
                fontWeight: "600",
              }}
            >
              Chat via WhatsApp
            </div>
          </div>
        </div>

        {/* TRANSAKSI */}
        <div style={{ marginTop: "24px" }}>
          <h2
            style={{
              color: COLORS.primary,
              marginBottom: "14px",
            }}
          >
            📊 Transaksi Terakhir
          </h2>

          {records.length === 0 && (
            <div style={emptyCard}>
              Belum ada transaksi.
            </div>
          )}

{/* HEADER */}
<div
  style={{
    display: "flex",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: "16px",
  }}
>
  <div
    style={{
      fontSize: "20px",
      fontWeight: "800",
      color: COLORS.primary,
    }}
  >
    📊{" "}
    {showAllTransactions
      ? "Semua Transaksi"
      : "Transaksi Terakhir"}
  </div>

  <button
    onClick={() =>
      setShowAllTransactions(
        !showAllTransactions
      )
    }
    style={{
      border: "none",
      background: "none",
      color: COLORS.primary,
      fontWeight: "700",
      cursor: "pointer",
      fontSize: "14px",
    }}
  >
    {showAllTransactions
      ? "Tutup"
      : "📒 Lihat Semua"}
  </button>
</div>

{/* MODE 3 TRANSAKSI */}
{!showAllTransactions &&
  records
    .slice(0, 3)
    .map((item) => (
      <div
        key={item.id}
        style={transactionCard}
      >
        <div>
          <div
            style={{
              fontWeight: "700",
              fontSize: "18px",
            }}
          >
            {item.pembeli}
          </div>

          <div
            style={{
              marginTop: "4px",
              fontSize: "14px",
              color:
                COLORS.textSoft,
            }}
          >
            {item.tanggal}
          </div>
        </div>

        <div
          style={{
            textAlign: "right",
          }}
        >
          <div
            style={{
              fontWeight: "800",
              color:
                COLORS.primary,
            }}
          >
            {formatRupiah(
              Number(
                item.beratKg
              ) *
                Number(
                  item.hargaPerKg
                )
            )}
          </div>

          <div
            style={{
              marginTop: "4px",
              fontSize: "14px",
              color:
                COLORS.textSoft,
            }}
          >
            {item.beratKg} kg
          </div>
        </div>

        {/* BUTTON */}
        <div
          style={{
            display: "flex",
            gap: "10px",
            marginTop: "14px",
          }}
        >
          <button
            onClick={() =>
              handleEdit(item)
            }
            style={{
              border: "none",
              background:
                "#facc15",
              color:
                "#1f2937",
              padding:
                "8px 14px",
              borderRadius:
                "10px",
              cursor:
                "pointer",
              fontWeight:
                "600",
            }}
          >
            ✏ Edit
          </button>

          <button
            onClick={() =>
              handleDelete(
                item.id
              )
            }
            style={{
              border: "none",
              background:
                "#ef4444",
              color: "white",
              padding:
                "8px 14px",
              borderRadius:
                "10px",
              cursor:
                "pointer",
              fontWeight:
                "600",
            }}
          >
            🗑 Hapus
          </button>
        </div>
      </div>
    ))}

{/* MODE SEMUA TRANSAKSI */}
{showAllTransactions &&
  Object.entries(
    groupedTransactions
  ).map(([group, items]) => (
    <div
      key={group}
      style={{
        marginBottom: "26px",
      }}
    >
      {/* HEADER BULAN */}
      <div
        style={{
          fontSize: "18px",
          fontWeight: "800",
          color:
            COLORS.primary,
          marginBottom: "12px",
        }}
      >
        📅 {group}
      </div>

      {items.map((item) => (
        <div
          key={item.id}
          style={transactionCard}
        >
          <div>
            <div
              style={{
                fontWeight:
                  "700",
                fontSize:
                  "18px",
              }}
            >
              {item.pembeli}
            </div>

            <div
              style={{
                marginTop:
                  "4px",
                fontSize:
                  "14px",
                color:
                  COLORS.textSoft,
              }}
            >
              {item.tanggal}
            </div>
          </div>

          <div
            style={{
              textAlign:
                "right",
            }}
          >
            <div
              style={{
                fontWeight:
                  "800",
                color:
                  COLORS.primary,
              }}
            >
              {formatRupiah(
                Number(
                  item.beratKg
                ) *
                  Number(
                    item.hargaPerKg
                  )
              )}
            </div>

            <div
              style={{
                marginTop:
                  "4px",
                fontSize:
                  "14px",
                color:
                  COLORS.textSoft,
              }}
            >
              {item.beratKg} kg
            </div>
          </div>

          {/* BUTTON */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              marginTop: "14px",
            }}
          >
            <button
              onClick={() =>
                handleEdit(
                  item
                )
              }
              style={{
                border:
                  "none",
                background:
                  "#facc15",
                color:
                  "#1f2937",
                padding:
                  "8px 14px",
                borderRadius:
                  "10px",
                cursor:
                  "pointer",
                fontWeight:
                  "600",
              }}
            >
              ✏ Edit
            </button>

            <button
              onClick={() =>
                handleDelete(
                  item.id
                )
              }
              style={{
                border:
                  "none",
                background:
                  "#ef4444",
                color:
                  "white",
                padding:
                  "8px 14px",
                borderRadius:
                  "10px",
                cursor:
                  "pointer",
                fontWeight:
                  "600",
              }}
            >
              🗑 Hapus
            </button>
          </div>
        </div>
      ))}
    </div>
      ))}
    </div>

      </div>
    </div>
  );
}

// STYLE
const cardStyle = {
  background: "#fff",
  borderRadius: "22px",
  padding: "20px",
  display: "flex",
  alignItems: "center",
  gap: "14px",
  border: "1px solid #dce5dc",
  boxShadow:
    "0 4px 12px rgba(0,0,0,0.04)",
};

const iconCircle = {
  width: "56px",
  height: "56px",
  borderRadius: "50%",
  background: "#edf7ee",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "26px",
};

const labelStyle = {
  fontSize: "14px",
  color: "#6b7280",
};

const valueStyle = {
  marginTop: "8px",
  fontSize: "28px",
  fontWeight: "800",
  color: "#14532d",
};

const formCard = {
  background: "#fff",
  borderRadius: "28px",
  padding: "24px",
  border: "1px solid #dce5dc",
  boxShadow:
    "0 8px 20px rgba(0,0,0,0.05)",
};

const fieldStyle = {
  marginBottom: "18px",
};

const labelInput = {
  display: "block",
  marginBottom: "8px",
  fontWeight: "600",
  color: "#374151",
};

const inputStyle = {
  width: "100%",
  padding: "16px",
  borderRadius: "16px",
  border: "1px solid #d1d5db",
  fontSize: "16px",
  outline: "none",
  boxSizing: "border-box",
};

const emptyCard = {
  background: "#fff",
  borderRadius: "18px",
  padding: "20px",
  textAlign: "center",
  color: "#6b7280",
  border: "1px solid #dce5dc",
};

const transactionCard = {
  background: "#fff",
  borderRadius: "18px",
  padding: "18px",
  marginBottom: "12px",
  border: "1px solid #dce5dc",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

export default App;