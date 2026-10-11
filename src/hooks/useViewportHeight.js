import { useEffect } from 'react';

// Terapkan tinggi viewport nyata ke CSS variable --app-vh.
//
// Kenapa perlu: di browser mobile, address bar berubah tinggi saat halaman
// dibuka/digulir. `100vh` dan bahkan `100dvh` kadang belum ikut menyesuaikan
// pada frame pertama, sehingga bagian bawah (input bar) terlihat terpotong.
//
// Solusi: ukur window.innerHeight / visualViewport.height, tulis ke
// --app-h dalam piksel. CSS memakai var ini untuk tinggi container.
export function useViewportHeight() {
  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const vv = window.visualViewport;
      const h = Math.round((vv && vv.height) || window.innerHeight || 0);
      if (h > 0) root.style.setProperty('--app-h', `${h}px`);
    };

    apply();

    window.addEventListener('resize', apply, { passive: true });
    window.addEventListener('orientationchange', apply, { passive: true });
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', apply, { passive: true });
      vv.addEventListener('scroll', apply, { passive: true });
    }

    // satu kali lagi setelah layout stabil (address bar mobile menyusut)
    const t1 = setTimeout(apply, 120);
    const t2 = setTimeout(apply, 500);

    return () => {
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
      if (vv) {
        vv.removeEventListener('resize', apply);
        vv.removeEventListener('scroll', apply);
      }
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);
}
