import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CircleDot,
  Droplets,
  Mountain,
  RotateCcw,
  Save,
  Check,
  Info,
  ArrowRight,
  GitCommit,
  FileText
} from 'lucide-react';
import { formatDateTime } from '../utils/calculations';

export default function NodeModal({
  node,
  networkData,
  measurements,
  onSaveNode,
  onResetNode,
  onSelectPipe,
  onClose
}) {
  if (!node) return null;

  const originalDemand = node._originalDemand !== undefined ? node._originalDemand : (node.demand || 0);
  const originalElevation = node._originalElevation !== undefined ? node._originalElevation : (node.elevation || 0);
  const isOverridden = !!node._isOverridden;

  const [unit, setUnit] = useState('lps'); // 'lps' or 'm3h'
  const [demandInput, setDemandInput] = useState('');
  const [elevationInput, setElevationInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    const currentDemand = node.demand !== undefined && node.demand !== null ? Number(node.demand) : 0;
    const currentElev = node.elevation !== undefined && node.elevation !== null ? Number(node.elevation) : 0;
    setDemandInput(unit === 'm3h' ? (currentDemand * 3.6).toFixed(2) : currentDemand.toString());
    setElevationInput(currentElev.toString());
    setNotesInput(node._notes || '');
  }, [node]);

  // Handle unit switch while preserving value
  const handleUnitChange = (newUnit) => {
    if (newUnit === unit) return;
    const val = parseFloat(demandInput);
    if (!isNaN(val)) {
      if (newUnit === 'm3h') {
        setDemandInput((val * 3.6).toFixed(2));
      } else {
        setDemandInput((val / 3.6).toFixed(2));
      }
    }
    setUnit(newUnit);
  };

  const numericDemand = parseFloat(demandInput);
  const effectiveDemandLps = isNaN(numericDemand)
    ? 0
    : Math.max(0, unit === 'm3h' ? numericDemand / 3.6 : numericDemand);

  const numericElevation = parseFloat(elevationInput);
  const effectiveElevation = isNaN(numericElevation) ? originalElevation : numericElevation;

  const deltaDemand = effectiveDemandLps - originalDemand;
  const dailyVolumeM3 = effectiveDemandLps * 86.4; // 1 L/s = 86.4 m3/day

  // Find connected pipes (incoming & outgoing)
  const connectedPipes = useMemo(() => {
    if (!networkData?.pipes) return { incoming: [], outgoing: [] };
    const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));
    const incoming = [];
    const outgoing = [];

    networkData.pipes.forEach(p => {
      if (p.endNodeId === node.id) {
        const fromNode = nodeMap.get(p.startNodeId);
        incoming.push({
          ...p,
          _fromLabel: fromNode?.label || 'J',
          _toLabel: node.label || 'J',
          _designPressure: ((fromNode?.pressure ?? 2.4) + (node.pressure ?? 2.4)) / 2
        });
      } else if (p.startNodeId === node.id) {
        const toNode = nodeMap.get(p.endNodeId);
        outgoing.push({
          ...p,
          _fromLabel: node.label || 'J',
          _toLabel: toNode?.label || 'J',
          _designPressure: ((node.pressure ?? 2.4) + (toNode?.pressure ?? 2.4)) / 2
        });
      }
    });

    return { incoming, outgoing };
  }, [networkData, node]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSaveNode(node.id, {
      demand: Number(effectiveDemandLps.toFixed(3)),
      elevation: Number(effectiveElevation.toFixed(2)),
      notes: notesInput.trim()
    });
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 600);
  };

  const handleReset = () => {
    if (window.confirm(`Kembalikan Demand & Elevasi Node ${node.label} ke nilai desain awal (${originalDemand} L/s)?`)) {
      onResetNode(node.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 transition-opacity">
      <div className="bg-slate-900 border border-slate-700/80 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Modal Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
              effectiveDemandLps > 0
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-sky-500/20 text-sky-400 border-sky-500/30'
            }`}>
              <CircleDot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  Node {node.label || node.id.slice(0, 6)}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-700 text-slate-300 uppercase">
                  {node.type === 'reservoir' ? 'Reservoir' : 'Junction'}
                </span>
                {isOverridden && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    Diubah Manual
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-mono">
                Elevasi: {effectiveElevation} m • P Desain: {(node.pressure || 0).toFixed(2)} bar
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-700 active:bg-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Ringkasan Matriks Node */}
          <div className="bg-slate-950/80 rounded-2xl p-3.5 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-amber-400" />
                Parameter Simpul Distribusi (Demand & Elevasi)
              </span>
              <span className="text-slate-500 font-mono text-[11px]">
                {connectedPipes.incoming.length} masuk • {connectedPipes.outgoing.length} keluar
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              {/* Demand Desain */}
              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Demand Desain</div>
                <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                  {originalDemand.toFixed(2)}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">L/detik</div>
              </div>

              {/* Demand Aktif */}
              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-amber-500/30">
                <div className="text-[10px] text-amber-400 uppercase font-semibold">Demand Aktif</div>
                <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                  {effectiveDemandLps.toFixed(2)}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {deltaDemand !== 0 ? (
                    <span className={deltaDemand > 0 ? 'text-amber-300' : 'text-emerald-400'}>
                      ({deltaDemand > 0 ? '+' : ''}{deltaDemand.toFixed(2)} L/s)
                    </span>
                  ) : (
                    'Sesuai Desain'
                  )}
                </div>
              </div>

              {/* Volume Harian */}
              <div className="bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Konsumsi/Hari</div>
                <div className="text-base font-bold text-sky-400 font-mono mt-0.5">
                  {dailyVolumeM3.toFixed(0)}
                </div>
                <div className="text-[9px] text-slate-500 font-mono">m³ / hari</div>
              </div>
            </div>
          </div>

          {/* Form Edit Demand & Elevasi */}
          <form id="nodeEditForm" onSubmit={handleSubmit} className="space-y-3.5">
            {/* Input Demand (Kebutuhan Air) */}
            <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-amber-500/40 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Droplets className="w-4 h-4 text-amber-400" />
                  <span>Demand / Pengambilan Air di Node Ini</span>
                </label>

                {/* Unit Switcher */}
                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                  <button
                    type="button"
                    onClick={() => handleUnitChange('lps')}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      unit === 'lps' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    L/s
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUnitChange('m3h')}
                    className={`px-2 py-0.5 rounded font-medium transition ${
                      unit === 'm3h' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    m³/j
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={`Desain: ${originalDemand} L/s`}
                  value={demandInput}
                  onChange={(e) => setDemandInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-lg font-bold font-mono text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                />
                <span className="absolute right-4 top-3 text-xs text-amber-400 font-mono font-semibold">
                  {unit === 'lps' ? 'L/detik' : 'm³/jam'}
                </span>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[10px] text-slate-400 mr-1">Cepat:</span>
                {[0, 1, 2, 5, 10, 15, 25].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      setUnit('lps');
                      setDemandInput(val.toString());
                    }}
                    className="px-2 py-0.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300 transition active:scale-95"
                  >
                    {val} L/s
                  </button>
                ))}
              </div>

              <div className="text-[10px] text-slate-400 leading-relaxed">
                💡 Mengubah demand pada node ini akan langsung memperbarui perhitungan <strong>Konsumsi Berizin (NRW)</strong> serta distribusi debit ke <strong>pipa-pipa hilir (Cascade)</strong>.
              </div>
            </div>

            {/* Input Elevasi Node */}
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Mountain className="w-3.5 h-3.5 text-sky-400" />
                  <span>Elevasi Titik Node (mdpl)</span>
                </label>
                <span className="text-[10px] text-slate-500 font-mono">
                  Desain: {originalElevation} m
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  value={elevationInput}
                  onChange={(e) => setElevationInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-sm font-bold font-mono text-white focus:outline-none transition"
                />
                <span className="absolute right-3 top-2 text-xs text-slate-400 font-mono">
                  meter
                </span>
              </div>
            </div>

            {/* Catatan / Keterangan */}
            <div>
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>Catatan Perubahan (Opsional)</span>
              </label>
              <input
                type="text"
                placeholder="Contoh: Penambahan SR baru / Zona Distribusi Warga..."
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none"
              />
            </div>
          </form>

          {/* Daftar Pipa Terhubung ke Node Ini */}
          <div className="bg-slate-950/60 rounded-2xl p-3 border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <GitCommit className="w-3.5 h-3.5 text-sky-400" />
              <span>Pipa Terhubung pada Node {node.label}</span>
            </div>

            <div className="space-y-1.5">
              {connectedPipes.incoming.map(p => {
                const meas = measurements?.[p.id];
                const qAct = meas?.actualFlow !== undefined && meas?.actualFlow !== null ? Number(meas.actualFlow) : null;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (onSelectPipe) {
                        onClose();
                        onSelectPipe(p);
                      }
                    }}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl p-2 flex items-center justify-between text-xs cursor-pointer transition"
                  >
                    <div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold mr-1.5">
                        Masuk (Hulu)
                      </span>
                      <span className="font-bold text-white">{p._fromLabel} → {p._toLabel}</span>
                      <span className="text-[10px] text-slate-400 font-mono ml-1.5">Ø{p.diameter}mm</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-sky-400">{Math.abs(p.flowRate || 0).toFixed(1)} L/s</span>
                      {qAct !== null && (
                        <span className="text-emerald-400 font-bold">➔ {qAct.toFixed(1)}</span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  </div>
                );
              })}

              {connectedPipes.outgoing.map(p => {
                const meas = measurements?.[p.id];
                const qAct = meas?.actualFlow !== undefined && meas?.actualFlow !== null ? Number(meas.actualFlow) : null;
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      if (onSelectPipe) {
                        onClose();
                        onSelectPipe(p);
                      }
                    }}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl p-2 flex items-center justify-between text-xs cursor-pointer transition"
                  >
                    <div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold mr-1.5">
                        Keluar (Hilir)
                      </span>
                      <span className="font-bold text-white">{p._fromLabel} → {p._toLabel}</span>
                      <span className="text-[10px] text-slate-400 font-mono ml-1.5">Ø{p.diameter}mm</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="text-sky-400">{Math.abs(p.flowRate || 0).toFixed(1)} L/s</span>
                      {qAct !== null && (
                        <span className="text-emerald-400 font-bold">➔ {qAct.toFixed(1)}</span>
                      )}
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {node._updatedAt && (
            <div className="text-[11px] text-slate-400 flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span>Diperbarui: <strong className="text-slate-300">{formatDateTime(node._updatedAt)}</strong></span>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between gap-3 shrink-0 pb-safe">
          {isOverridden ? (
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 flex items-center gap-1.5 text-xs font-semibold transition active:scale-95"
              title="Reset ke Desain Awal"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 bg-slate-700/60 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition active:scale-95"
            >
              Batal
            </button>
          )}

          <button
            type="submit"
            form="nodeEditForm"
            disabled={savedSuccess}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg active:scale-95 ${
              savedSuccess
                ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                Demand Tersimpan!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Simpan Demand Node
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
