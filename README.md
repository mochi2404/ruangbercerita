# Ruang Cerita

Chat anonim sederhana dengan halaman user di `/` dan halaman admin di `/admin/`.

## Setup Neon

1. Buat database Neon dari Vercel Marketplace atau dashboard Neon.
2. Jalankan isi file `database/schema.sql` di SQL Editor Neon.
3. Tambahkan environment variable berikut di Vercel:

```bash
DATABASE_URL=postgresql://...
```

## Deploy Vercel

Project ini berisi frontend statis dan Vercel Functions di folder `api/`.

```bash
npm install
npm run dev
```

Route utama:

- `/` untuk user
- `/admin/` untuk admin
- `/api/chats` untuk daftar dan membuat chat
- `/api/messages` untuk mengirim pesan
