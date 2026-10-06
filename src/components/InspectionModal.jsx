import React, { useState, useEffect } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  Droplets,
  Gauge,
  Trash2,
  Save,
  Info,
  Calendar,
  Check,
  Zap
} from 'lucide-react';
import {
  analyzeFlowStatus,
  calculateVelocity,
  analyzeVelocityStatus,
  analyzePressureStatus,
  analyzeHydraulicDiagnostics,
  estimateFlowFromPressure,
  formatDateTime
} from '../utils/calculations';

export default function InspectionModal({
  pipe,
  existingMeasurement,
  onSave,
  onDelete,
  onClose
}) {
  if (!pipe) return null;

  const designFlow = Math.abs(pipe.flowRate || 0);
  const designPressure = pipe._designPressure || 2.4;
  const designVelocity = pipe.velocity || 0;

  // Unit toggle: 'lps' (L/s) or 'm3h' (m³/h)
  const [unit, setUnit] = useState('lps');
  const [flowInput, setFlowInput] = useState('');
  const [pressureInput, setPressureInput] = useState('');
  const [method, setMethod] = useState('Clamp-on Ultrasonic Flowmeter');
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Populate form if existing measurement
  useEffect(() => {
    if (existingMeasurement) {
      setFlowInput(existingMeasurement.actualFlow !== undefined ? existingMeasurement.actualFlow.toString() : '');
      setPressureInput(existingMeasurement.actualPressure !== undefined && existingMeasurement.actualPressure !== null ? existingMeasurement.actualPressure.toString() : '');
      if (existingMeasurement.method) setMethod(existingMeasurement.method);
    } else {
      setFlowInput('');
      setPressureInput('');
    }
  }, [pipe, existingMeasurement]);

  // Convert current input to L/s for comparison
  const numericInput = parseFloat(flowInput);
  const actualFlowLps = isNaN(numericInput)
    ? null
    : unit === 'm3h'
    ? numericInput / 3.6 // 1 L/s = 3.6 m3/h
    : numericInput;

  const actualPressureVal = pressureInput !== '' && !isNaN(parseFloat(pressureInput))
    ? parseFloat(pressureInput)
    : null;

  // Jika debit tidak diukur langsung tapi ada tekanan, estimasikan debitnya via hukum hidrolika
  const estimatedFlowFromP = (actualFlowLps === null && actualPressureVal !== null)
    ? estimateFlowFromPressure(designFlow, actualPressureVal, designPressure)
    : null;

  const effectiveFlowLps = actualFlowLps !== null ? actualFlowLps : estimatedFlowFromP;

  const actualVelocity = effectiveFlowLps !== null
    ? calculateVelocity(effectiveFlowLps, pipe.diameter)
    : null;

  // Hazen-Williams Headloss approximation: hf_act ≈ hf_des * (Q_act / Q_des)^1.852
  const actualHeadloss = (pipe.headloss && designFlow > 0 && effectiveFlowLps !== null)
    ? pipe.headloss * Math.pow(effectiveFlowLps / designFlow, 1.852)
    : null;

  let diagnostics = null;
  try {
    diagnostics = analyzeHydraulicDiagnostics({
      designFlow,
      actualFlow: effectiveFlowLps,
      designPressure,
      actualPressure: actualPressureVal,
      diameter: pipe.diameter
    });
  } catch (err) {
    console.error('Error analyzing hydraulic diagnostics:', err);
  }

  const handleSubmit = (e) => {
    e.preventDefault();
    if (actualFlowLps === null && actualPressureVal === null) {
      alert('Silakan masukkan minimal nilai Tekanan Air (bar) atau Debit Lapangan.');
      return;
    }

    const payload = {
      actualFlow: effectiveFlowLps !== null ? Number(effectiveFlowLps.toFixed(2)) : null,
      actualPressure: actualPressureVal !== null ? Number(actualPressureVal.toFixed(2)) : null,
      actualVelocity: actualVelocity !== null ? Number(actualVelocity.toFixed(2)) : null,
      actualHeadloss: actualHeadloss !== null ? Number(actualHeadloss.toFixed(2)) : null,
      unitUsed: unit,
      method: actualFlowLps !== null ? method : (method.includes('Manometer') || method.includes('Pressure') ? method : 'Manometer Tekanan Air (Bourdon/Digital)'),
      isEstimatedFlow: actualFlowLps === null && estimatedFlowFromP !== null,
      measuredAt: existingMeasurement?.measuredAt || new Date().toISOString()
    };

    onSave(pipe.id, payload);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 700);
  };

  const handleDelete = () => {
    if (window.confirm('Hapus data pengukuran lapangan untuk pipa ini?')) {
      onDelete(pipe.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 transition-opacity">
      <div className="bg-slate-900 border border-slate-700/80 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        {/* Modal Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
              <Droplets className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  {pipe._fromLabel || 'J'} → {pipe._toLabel || 'J'}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-slate-700 text-slate-300">
                  Ø {pipe.diameter} mm
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                ID: {pipe.id.slice(0, 8)}... | {pipe.material} | P: {pipe.length} m
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

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto p-4 space-y-4 flex-1">
          {/* Baseline Desain vs Real-time Diagnosis Card */}
          <div className="bg-slate-950/80 rounded-2xl p-3.5 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-400" />
                Matriks Parameter Hidrolis (Model vs Aktual)
              </span>
              <span className="text-slate-400 font-mono text-[11px]">Subang ADB</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              {/* Debit Q */}
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Debit (Q)</div>
                <div className="text-base font-bold text-sky-400 font-mono mt-0.5">
                  {designFlow.toFixed(2)}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {actualFlowLps !== null ? (
                    <span className="text-emerald-400 font-bold">Akt: {actualFlowLps.toFixed(2)}</span>
                  ) : (
                    'Desain (L/s)'
                  )}
                </div>
              </div>

              {/* Tekanan P */}
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Tekanan (P)</div>
                <div className="text-base font-bold text-amber-400 font-mono mt-0.5">
                  {designPressure.toFixed(2)}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {actualPressureVal !== null ? (
                    <span className="text-emerald-400 font-bold">Akt: {actualPressureVal.toFixed(2)} bar</span>
                  ) : (
                    'Desain (bar)'
                  )}
                </div>
              </div>

              {/* Kecepatan v */}
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Kecepatan (v)</div>
                <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                  {designVelocity ? designVelocity.toFixed(2) : '-'}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {actualVelocity !== null ? (
                    <span className={`font-bold ${actualVelocity > 2.0 ? 'text-rose-400' : actualVelocity < 0.3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                      Akt: {actualVelocity.toFixed(2)} m/s
                    </span>
                  ) : (
                    'Desain (m/s)'
                  )}
                </div>
              </div>

              {/* Headloss */}
              <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">Headloss</div>
                <div className="text-base font-bold text-slate-200 font-mono mt-0.5">
                  {pipe.headloss ? pipe.headloss.toFixed(2) : '-'}
                </div>
                <div className="text-[9px] text-slate-400 font-mono">
                  {actualHeadloss !== null ? (
                    <span className="text-sky-300 font-bold">Akt: ~{actualHeadloss.toFixed(2)} m</span>
                  ) : (
                    'Desain (m)'
                  )}
                </div>
              </div>
            </div>

            {/* Diagnosa Terpadu Hidrolika Rekayasa saat ada input debit atau tekanan */}
            {(effectiveFlowLps !== null || actualPressureVal !== null) && diagnostics && diagnostics.code !== 'UNMEASURED' && (
              <div
                className={`p-3.5 rounded-xl border flex flex-col gap-2 transition-all ${
                  diagnostics.severity === 'critical'
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    : diagnostics.severity === 'warning'
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    {diagnostics.severity === 'critical' && <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse shrink-0" />}
                    {diagnostics.severity === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
                    {diagnostics.severity === 'normal' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                    <span>{diagnostics.title}</span>
                  </div>
                  {diagnostics.flowAnalysis && typeof diagnostics.flowAnalysis.percentDeviation === 'number' && diagnostics.flowAnalysis.status !== 'unmeasured' ? (
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-black/40 shrink-0">
                      ΔQ {diagnostics.flowAnalysis.percentDeviation >= 0 ? '+' : ''}
                      {diagnostics.flowAnalysis.percentDeviation.toFixed(1)}%
                    </span>
                  ) : (
                    actualPressureVal !== null && (
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-md bg-black/40 shrink-0 text-amber-300">
                        {actualPressureVal.toFixed(2)} bar
                      </span>
                    )
                  )}
                </div>

                <p className="text-[11px] opacity-90 leading-relaxed">
                  {diagnostics.summary}
                </p>

                {/* Status Badges Row (SNI Kecepatan & PDAM Tekanan) */}
                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/10 text-[10px]">
                  {diagnostics.velocityAnalysis && (
                    <span className={`px-2 py-0.5 rounded-md border font-medium ${diagnostics.velocityAnalysis.badgeClass}`}>
                      v: {diagnostics.velocityAnalysis.label}
                    </span>
                  )}
                  {diagnostics.pressureAnalysis && diagnostics.pressureAnalysis.status !== 'unmeasured' && (
                    <span className={`px-2 py-0.5 rounded-md border font-medium ${diagnostics.pressureAnalysis.badgeClass}`}>
                      P: {diagnostics.pressureAnalysis.label}
                    </span>
                  )}
                </div>

                {/* Rekomendasi Tindakan Lapangan */}
                {diagnostics.action && (
                  <div className="bg-black/30 p-2 rounded-lg border border-white/10 text-[11px] flex items-start gap-1.5 mt-0.5">
                    <span className="shrink-0 font-bold">💡 Tindakan:</span>
                    <span className="text-slate-200">{diagnostics.action}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Form Input Lapangan - Simpel & Praktis */}
          <form id="inspectionForm" onSubmit={handleSubmit} className="space-y-3.5">
            {/* Mode Notifikasi Fleksibel */}
            <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 text-[11px] text-slate-300 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Cukup isi <strong>Tekanan (P)</strong> manometer, atau <strong>Debit (Q)</strong> flowmeter, atau keduanya.</span>
            </div>

            {/* Input Tekanan Air Lapangan (Manometer) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tekanan Air Lapangan (Manometer)</span>
                </label>
                <span className="text-[10px] text-slate-400 font-mono">
                  Desain: {designPressure.toFixed(1)} bar
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  placeholder={`Contoh: ${designPressure.toFixed(1)}`}
                  value={pressureInput}
                  onChange={(e) => setPressureInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-xl px-4 py-2.5 text-base font-bold font-mono text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                />
                <span className="absolute right-4 top-3 text-xs text-amber-400 font-mono font-semibold">bar</span>
              </div>
              {actualPressureVal !== null && actualPressureVal < 0.7 && (
                <div className="text-[10px] text-rose-400 mt-1 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  Sisa tekan di bawah 0.7 bar (air tidak mampu naik ke kran warga!)
                </div>
              )}
            </div>

            {/* Estimasi Debit Otomatis jika hanya isi Tekanan */}
            {estimatedFlowFromP !== null && (
              <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-2.5 text-xs text-sky-200 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-sky-400" />
                  <span>Estimasi Debit dari Tekanan:</span>
                </span>
                <span className="font-mono font-bold text-sky-400">~{estimatedFlowFromP.toFixed(2)} L/s</span>
              </div>
            )}

            {/* Input Debit Lapangan (Opsional) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  <span>Debit Aktual (Bila Ada Flowmeter)</span>
                  <span className="text-[10px] text-slate-500 font-normal">(Opsional)</span>
                </label>
                {/* Unit Switcher */}
                <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setUnit('lps')}
                    className={`px-2 py-0.5 rounded-md font-medium transition ${
                      unit === 'lps' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400'
                    }`}
                  >
                    L/s
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnit('m3h')}
                    className={`px-2 py-0.5 rounded-md font-medium transition ${
                      unit === 'm3h' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400'
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
                  placeholder={`Desain: ${designFlow.toFixed(2)}`}
                  value={flowInput}
                  onChange={(e) => setFlowInput(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-4 py-2.5 text-base font-bold font-mono text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                />
                <span className="absolute right-4 top-3 text-xs text-slate-400 font-mono">
                  {unit === 'lps' ? 'L/detik' : 'm³/jam'}
                </span>
              </div>
              {unit === 'm3h' && numericInput && !isNaN(numericInput) && (
                <div className="text-[10px] text-sky-400 mt-1 font-mono">
                  ≈ {(numericInput / 3.6).toFixed(2)} L/detik (dikonversi otomatis)
                </div>
              )}
            </div>

            {/* Metode Pengukuran */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Metode / Alat Ukur
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
              >
                <option value="Manometer Analog (Bourdon Tube)">Manometer Analog (Bourdon Tube)</option>
                <option value="Digital Pressure Gauge">Digital Pressure Gauge</option>
                <option value="Manometer di Hidran / Kran Warga">Manometer di Hidran / Kran Warga</option>
                <option value="Clamp-on Ultrasonic Flowmeter">Clamp-on Ultrasonic Flowmeter</option>
                <option value="Electromagnetic Flowmeter">Electromagnetic Flowmeter</option>
                <option value="Mechanical Meter (Woltman)">Mechanical Meter (Woltman)</option>
                <option value="Pitot Tube">Pitot Tube</option>
                <option value="Manual / Bak Ukur">Manual / Bak Ukur</option>
              </select>
            </div>

            {/* Previous Inspection Stamp if available */}
            {existingMeasurement?.measuredAt && (
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  Inspeksi terakhir:{' '}
                  <strong className="text-slate-300">
                    {formatDateTime(existingMeasurement.measuredAt)}
                  </strong>
                </span>
              </div>
            )}
          </form>
        </div>

        {/* Modal Action Buttons */}
        <div className="p-4 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between gap-3 shrink-0 pb-safe">
          {existingMeasurement ? (
            <button
              type="button"
              onClick={handleDelete}
              className="p-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30 flex items-center justify-center transition active:scale-95"
              title="Hapus Pengukuran"
            >
              <Trash2 className="w-4 h-4" />
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
            form="inspectionForm"
            disabled={savedSuccess}
            className={`flex-1 py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-lg active:scale-95 ${
              savedSuccess
                ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-sky-500/20'
            }`}
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                Tersimpan!
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Simpan Hasil Lapangan
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
