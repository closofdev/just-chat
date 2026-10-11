import React from 'react';

// Ikon kecil per tool (inline SVG, tanpa dependensi).
function Icon({ name }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'websearch') return (<svg {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>);
  if (name === 'webfetch') return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" /></svg>);
  if (name === 'question') return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7" /><path d="M12 17h.01" /></svg>);
  if (name === 'error') return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>);
  return (<svg {...common}><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /><circle cx="12" cy="12" r="3" /></svg>);
}

// Badge status tool yang SEDANG dijalankan agent (muncul saat berjalan, hilang setelah selesai).
export function ToolBadge({ tool }) {
  if (!tool) return null;
  const isError = tool.name === 'error';
  return (
    <div className={'tool-badge' + (isError ? ' tool-error' : '')}>
      <span className="tool-spinner" aria-hidden="true"><Icon name={tool.name} /></span>
      <span className="tool-label">{tool.label || tool.name}</span>
    </div>
  );
}
