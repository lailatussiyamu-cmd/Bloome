# Pembaruan desain Bloome — forest / ivory / rose

Desain mengikuti tiga referensi pengguna: latar forest gelap, judul serif, wordmark Bloome, kartu lembut, champagne glow, dan Living Bloom sebagai pusat identitas.

## Yang berubah
- Welcome khusus dengan wordmark, Seed bercahaya, dan ajakan mulai.
- Today gelap dengan avatar besar, pilihan ritme, kartu Care Moment, check-in, dan istirahat.
- Navigasi lima bagian yang semuanya mengarah ke fitur yang tersedia.
- Formulir ivory–rose, pilihan dengan penanda terpilih, target sentuh lapang.
- Journey, completion, comeback, dan milestone memakai tema forest yang sama.
- Tidak menambahkan grafik berat, data kesehatan fiktif, atau avatar manusia.

## Living Bloom
`assets/living-bloom-atlas.png` adalah PNG RGBA 1536×1024 dengan enam tahap pada grid 3×2. Satu komponen memilih kotak berdasarkan `stage`; mode dan interaksi tetap mengatur cahaya serta animasi. Aset disimpan di aplikasi, tanpa unduhan jaringan saat runtime. Semua layar menggunakan tema signature. Token varian lama tetap tersedia untuk pengembangan selanjutnya.

Aset dibuat dengan imagegen bawaan. Prompt generasi meminta enam tanaman botani premium: golden seed, two-leaf sprout, green leaves with ivory shoot, muted rose bud, open ivory–rose bloom, and abundant flourish; realistic translucent petals, champagne edges, tiny moss bases, no text, no faces, no pots, transparent background, equal 3×2 cells. Prompt penyempurnaan meminta mempertahankan desain tanaman, menghapus latar/glow, dan memberi margin aman pada setiap kotak. Transparansi diuji melalui nilai alpha PNG. Versi hasil terpilih: exec-29bc4e36-bea5-499e-9df5-825c8872b10e.png.

Aturan produk tetap berlaku: pertumbuhan berbasis hari dengan tindakan perawatan, tidak berkurang karena jeda, tidak dikaitkan dengan berat, tanpa skor tersembunyi pada UI. Minimum Day dan resting tidak mengganti tahap. Reduce Motion tetap dihormati.
