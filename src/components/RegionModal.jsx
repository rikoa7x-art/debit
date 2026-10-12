import React, { useState, useRef } from 'react';
import {
  X,
  FolderPlus,
  Upload,
  MapPin,
  Check,
  Trash2,
  Download,
  FileJson,
  AlertCircle,
  Layers
} from 'lucide-react';
import { normalizeAndValidateRegionJson } from '../utils/storage';

export default function RegionModal({
  regions,
  activeRegionId,
  onSelectRegion,
  onAddRegion,
  onDeleteRegion,
  onExportActiveRegion,
  onClose
}) {
  const [customName, setCustomName] = useState('');
  const [parsedPreview, setParsedPreview] = useState(null);
  const [rawJsonData, setRawJsonData] = useState(null);
  const [fileName, setFileName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrorMsg('');
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target.result);
        const defaultTitle = customName.trim() || json.projectName || file.name.replace(/\.(geo)?json$/i, '');
        const normalized = normalizeAndValidateRegionJson(json, defaultTitle);

        setRawJsonData(json);
        if (!customName.trim()) {
          setCustomName(normalized.projectName);
        }
        setParsedPreview({
          projectName: normalized.projectName,
          nodeCount: normalized.nodes.length,
          pipeCount: normalized.pipes.length,
          reservoirCount: normalized.nodes.filter(n => n.type === 'reservoir').length
        });
      } catch (err) {
        setRawJsonData(null);
        setParsedPreview(null);
        setErrorMsg(err.message || 'Gagal membaca format file JSON.');
      }
    };
    reader.onerror = () => {
      setErrorMsg('Gagal membaca file dari perangkat.');
    };
    reader.readAsText(file);
  };

  const handleCreateRegion = (e) => {
    e.preventDefault();
    if (!rawJsonData) {
      setErrorMsg('Silakan pilih file .json atau .geojson wilayah terlebih dahulu.');
      return;
    }
    try {
      onAddRegion(rawJsonData, customName.trim());
      onClose();
    } catch (err) {
      setErrorMsg(err.message || 'Gagal menyimpan wilayah baru.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4">
      <div className="bg-slate-900 border border-slate-700/80 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Manajemen Wilayah Jaringan</h3>
              <p className="text-xs text-slate-400">
                Pilih wilayah aktif atau tambah wilayah baru (.json / .geojson)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-5 flex-1">
          {/* 1. Daftar Wilayah Tersimpan */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Daftar Wilayah Tersedia ({regions.length})
              </label>
              <button
                type="button"
                onClick={onExportActiveRegion}
                className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition"
                title="Download JSON Wilayah Aktif"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON Aktif</span>
              </button>
            </div>

            <div className="space-y-2">
              {regions.map((reg) => {
                const isActive = reg.id === activeRegionId;
                return (
                  <div
                    key={reg.id}
                    onClick={() => {
                      if (!isActive) {
                        onSelectRegion(reg.id);
                        onClose();
                      }
                    }}
                    className={`p-3 rounded-2xl border transition flex items-center justify-between gap-3 cursor-pointer ${
                      isActive
                        ? 'bg-sky-500/15 border-sky-500/60 shadow-md'
                        : 'bg-slate-950/70 hover:bg-slate-800/80 border-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          isActive
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <MapPin className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-white truncate">
                            {reg.name}
                          </span>
                          {reg.isDefault && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                              Bawaan
                            </span>
                          )}
                          {isActive && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">
                              Aktif
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {reg.pipeCount} jalur pipa • {reg.nodeCount} titik node
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {!reg.isDefault && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Hapus wilayah "${reg.name}" beserta data pengukurannya?`)) {
                              onDeleteRegion(reg.id);
                            }
                          }}
                          className="p-2 text-rose-400 hover:bg-rose-500/20 rounded-xl transition"
                          title="Hapus Wilayah"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      {isActive && (
                        <div className="p-1.5 text-emerald-400">
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Form Tambah Wilayah Baru */}
          <form onSubmit={handleCreateRegion} className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <FolderPlus className="w-4 h-4" />
              <span>Tambah Wilayah Baru (Upload JSON)</span>
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                Nama Wilayah / Proyek Baru
              </label>
              <input
                type="text"
                placeholder="Contoh: Jalur Distribusi Cabang Pagaden..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">
                File Data Jaringan (`.json` atau `.geojson`)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.geojson,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 px-4 border-2 border-dashed border-slate-700 hover:border-sky-500/60 bg-slate-900/70 hover:bg-slate-900 rounded-2xl flex flex-col items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Upload className="w-5 h-5 text-sky-400" />
                <span className="text-xs font-semibold text-slate-200">
                  {fileName ? fileName : 'Klik untuk Pilih File .JSON / .GeoJSON'}
                </span>
                <span className="text-[10px] text-slate-500">
                  Mendukung format JSON {`{ nodes, pipes }`} maupun GeoJSON FeatureCollection
                </span>
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {parsedPreview && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <FileJson className="w-4 h-4" />
                  <span>File Valid: {parsedPreview.projectName}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono">
                  • {parsedPreview.pipeCount} Jalur Pipa • {parsedPreview.nodeCount} Titik Node ({parsedPreview.reservoirCount} Reservoir)
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!parsedPreview}
              className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg ${
                parsedPreview
                  ? 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20 cursor-pointer active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <FolderPlus className="w-4 h-4" />
              <span>Simpan & Buka Wilayah Baru</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
