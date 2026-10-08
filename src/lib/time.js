// Helper waktu: jam bubble user, relatif Indonesia, label "waktu | token/s".
export function timeStr(t) {
  return new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace('.', ':');
}

export function calcTps(text, t0) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const secs = Math.max(0.5, (performance.now() - t0) / 1000);
  return Math.max(1, Math.round((words * 1.3) / secs));
}

// waktu relatif bahasa Indonesia, detik integer: "1 detik yang lalu"
export function timeAgo(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 5) return 'baru saja';
  if (s < 60) return `${s} detik yang lalu`;
  const mnt = Math.floor(s / 60);
  if (mnt < 60) return `${mnt} menit yang lalu`;
  return `${Math.floor(mnt / 60)} jam yang lalu`;
}

// label waktu + kecepatan: "49 detik yang lalu | 45 token/s"
export function fmtResp(m) {
  return timeAgo(m.time) + (m.tps ? ` | ${m.tps} token/s` : '');
}
