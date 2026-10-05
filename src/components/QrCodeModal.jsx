import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Smartphone, Copy, Check, Wifi, Edit2, RotateCw } from 'lucide-react';

export default function QrCodeModal({ onClose, defaultIp = '10.38.180.170', port = 5173 }) {
  const currentHost = window.location.hostname;
  const isLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

  const [ipAddress, setIpAddress] = useState(() => {
    return isLocalhost ? defaultIp : currentHost;
  });
  const [isEditingIp, setIsEditingIp] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const effectivePort = window.location.port || port;
  const targetUrl = `http://${ipAddress}:${effectivePort}`;

  useEffect(() => {
    if (!targetUrl) return;
    QRCode.toDataURL(targetUrl, {
      width: 260,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then(url => setQrUrl(url))
      .catch(err => console.error(err));
  }, [targetUrl]);

  const handleCopy = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Smartphone className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-white text-sm">Buka di Mobile Phone</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code Container */}
        <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-inner">
          {qrUrl ? (
            <img src={qrUrl} alt="QR Code Akses Mobile" className="w-52 h-52 rounded-lg" />
          ) : (
            <div className="w-52 h-52 flex items-center justify-center text-slate-400 text-xs">
              Menghasilkan QR Code...
            </div>
          )}
          <span className="text-[11px] font-bold text-slate-800 mt-2">
            Scan langsung dengan kamera HP
          </span>
        </div>

        {/* URL Link and Copy */}
        <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between gap-2">
          {isEditingIp ? (
            <div className="flex items-center gap-1 flex-1">
              <span className="text-xs text-slate-500 font-mono">http://</span>
              <input
                type="text"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                className="bg-slate-900 text-sky-400 text-xs font-mono px-2 py-1 rounded border border-sky-500/40 w-full focus:outline-none"
              />
              <button
                onClick={() => setIsEditingIp(false)}
                className="bg-sky-500 text-slate-950 text-[10px] font-bold px-2 py-1 rounded"
              >
                OK
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-xs font-mono text-sky-400 truncate select-all">
                {targetUrl}
              </span>
              <button
                onClick={() => setIsEditingIp(true)}
                className="text-slate-500 hover:text-slate-300 p-1"
                title="Ubah IP jika berbeda"
              >
                <Edit2 className="w-3 h-3" />
              </button>
            </div>
          )}

          <button
            onClick={handleCopy}
            className="bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 border border-slate-700 transition"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Tersalin</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Salin</span>
              </>
            )}
          </button>
        </div>

        {/* Instructions */}
        <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 space-y-1.5 text-[11px] text-slate-300">
          <div className="flex items-center gap-1.5 font-semibold text-amber-400">
            <Wifi className="w-3.5 h-3.5" />
            <span>Petunjuk Koneksi HP:</span>
          </div>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li>Pastikan HP dan komputer terhubung ke <strong>Wi-Fi yang sama</strong> (atau Hotspot HP).</li>
            <li>Buka Kamera HP / QR scanner lalu arahkan ke QR Code.</li>
            <li>Buka link yang muncul di browser HP (Chrome/Safari).</li>
            <li>Pilih <strong>"Tambahkan ke Layar Utama" (Add to Home Screen)</strong> untuk install PWA.</li>
          </ol>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition"
        >
          Tutup
        </button>
      </div>
    </div>
  );
}
