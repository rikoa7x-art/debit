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
  Zap,
  ChevronDown,
  ChevronUp
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
  networkData,
  existingMeasurement,
  onSave,
  onDelete,
  onClose
}) {
  if (!pipe) return null;

  const designFlow = Math.abs(pipe.flowRate || 0);
  const designPressure = pipe._designPressure || 2.4;
  const designVelocity = pipe.velocity || 0;

  // Node Elevations from networkData
  const startNode = networkData?.nodes?.find(n => n.id === pipe.startNodeId);
  const endNode = networkData?.nodes?.find(n => n.id === pipe.endNodeId);
  const zStart = startNode?.elevation !== undefined ? startNode.elevation : null;
  const zEnd = endNode?.elevation !== undefined ? endNode.elevation : null;
  const deltaZ = (zStart !== null && zEnd !== null) ? Number((zStart - zEnd).toFixed(1)) : null;

  // Unit toggle for pressure and flow
  const [pressureUnit, setPressureUnit] = useState('bar'); // 'bar', 'kgcm2', 'psi', 'mka'
  const [unit, setUnit] = useState('lps'); // 'lps' or 'm3h'
  const [flowInput, setFlowInput] = useState('');
  const [pressureInput, setPressureInput] = useState('');
  const [method, setMethod] = useState('Manometer Analog (Bourdon Tube)');
  const [showOptionalFlow, setShowOptionalFlow] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Populate form if existing measurement
  useEffect(() => {
    if (existingMeasurement) {
      setFlowInput(existingMeasurement.actualFlow !== undefined && !existingMeasurement.isEstimatedFlow && existingMeasurement.actualFlow !== null ? existingMeasurement.actualFlow.toString() : '');
      setPressureInput(existingMeasurement.actualPressure !== undefined && existingMeasurement.actualPressure !== null ? existingMeasurement.actualPressure.toString() : '');
      if (existingMeasurement.method) setMethod(existingMeasurement.method);
      if (existingMeasurement.actualFlow && !existingMeasurement.isEstimatedFlow) {
        setShowOptionalFlow(true);
      }
    } else {
      setFlowInput('');
      setPressureInput('');
      setShowOptionalFlow(false);
    }
  }, [pipe, existingMeasurement]);

  // Convert current flow input to L/s for comparison
  const numericInput = parseFloat(flowInput);
  const actualFlowLps = isNaN(numericInput)
    ? null
    : unit === 'm3h'
    ? numericInput / 3.6 // 1 L/s = 3.6 m3/h
    : numericInput;

  // Convert pressure input to bar based on selected unit
  const rawP = parseFloat(pressureInput);
  let actualPressureVal = null;
  if (pressureInput !== '' && !isNaN(rawP)) {
    if (pressureUnit === 'psi') actualPressureVal = rawP * 0.0689476;
    else if (pressureUnit === 'kgcm2') actualPressureVal = rawP * 0.980665;
    else if (pressureUnit === 'mka') actualPressureVal = rawP * 0.0980665;
    else actualPressureVal = rawP;
  }

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
                {pipe.material} | P: {pipe.length} m
                {zStart !== null && zEnd !== null && (
                  <span className="text-amber-300"> | Elevasi: {zStart}m → {zEnd}m (Δz: {deltaZ > 0 ? '+' : ''}{deltaZ}m)</span>
                )}
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
            {/* Mode Notifikasi Utama Manometer */}
            <div className="bg-sky-950/40 p-2.5 rounded-xl border border-sky-600/30 text-[11px] text-sky-200 flex items-center gap-2">
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Cukup masukkan angka pada <strong>jarum manometer</strong>. Sistem otomatis menghitung debit & analisa kebocoran.</span>
            </div>

            {/* Input Tekanan Air Lapangan (Manometer) - Utama */}
            <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-amber-500/40 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <Gauge className="w-4 h-4 text-amber-400" />
                  <span>Tekanan Manometer Lapangan</span>
                </label>
                {/* Unit Switcher Manometer */}
                <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                  {['bar', 'kgcm2', 'psi', 'mka'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setPressureUnit(u)}
                      className={`px-1.5 py-0.5 rounded font-medium transition ${
                        pressureUnit === u ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {u === 'kgcm2' ? 'kg/cm²' : u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.05"
                  placeholder={`Desain: ${designPressure.toFixed(1)} bar`}
                  value={pressureInput}
                  onChange={(e) => setPressureInput(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-400 rounded-xl px-4 py-2.5 text-lg font-bold font-mono text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                />
                <span className="absolute right-4 top-3 text-xs text-amber-400 font-mono font-semibold">
                  {pressureUnit === 'kgcm2' ? 'kg/cm²' : pressureUnit}
                </span>
              </div>

              {/* Conversion text jika bukan bar */}
              {pressureUnit !== 'bar' && actualPressureVal !== null && (
                <div className="text-[10px] text-amber-300 font-mono">
                  ≈ {actualPressureVal.toFixed(2)} bar (dikonversi otomatis untuk kalkulasi)
                </div>
              )}

              {actualPressureVal !== null && actualPressureVal < 0.7 && (
                <div className="text-[10px] text-rose-400 font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  Sisa tekan di bawah 0.7 bar (air tidak mampu naik ke kran warga!)
                </div>
              )}
            </div>

            {/* Estimasi Debit Otomatis jika hanya isi Tekanan */}
            {estimatedFlowFromP !== null && (
              <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-3 text-xs text-sky-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">Estimasi Debit Otomatis:</div>
                    <div className="text-[10px] text-sky-300">Dihitung dari tekanan pipa & elevasi</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-sky-400 text-sm">~{estimatedFlowFromP.toFixed(2)} L/s</div>
                  <div className="text-[9px] font-mono text-slate-400">~{(estimatedFlowFromP * 3.6).toFixed(1)} m³/j</div>
                </div>
              </div>
            )}

            {/* Tombol Buka Flowmeter (Opsional) */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
              <button
                type="button"
                onClick={() => setShowOptionalFlow(!showOptionalFlow)}
                className="w-full p-2.5 text-xs text-slate-400 hover:text-slate-200 flex items-center justify-between transition"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <Droplets className="w-3.5 h-3.5 text-sky-400" />
                  <span>Input Flowmeter Langsung (Opsional / Bila Membawa Alat)</span>
                </span>
                {showOptionalFlow ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showOptionalFlow && (
                <div className="p-3 border-t border-slate-800 space-y-2 bg-slate-950/80">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Debit Terukur di Flowmeter
                    </label>
                    {/* Unit Switcher */}
                    <div className="flex items-center bg-slate-800 p-0.5 rounded-lg border border-slate-700 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setUnit('lps')}
                        className={`px-2 py-0.5 rounded font-medium transition ${
                          unit === 'lps' ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400'
                        }`}
                      >
                        L/s
                      </button>
                      <button
                        type="button"
                        onClick={() => setUnit('m3h')}
                        className={`px-2 py-0.5 rounded font-medium transition ${
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
                      className="w-full bg-slate-900 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2 text-sm font-bold font-mono text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-mono">
                      {unit === 'lps' ? 'L/s' : 'm³/j'}
                    </span>
                  </div>
                  {unit === 'm3h' && numericInput && !isNaN(numericInput) && (
                    <div className="text-[10px] text-sky-400 font-mono">
                      ≈ {(numericInput / 3.6).toFixed(2)} L/detik (dikonversi otomatis)
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Metode Pengukuran */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Alat Pengukuran Lapangan
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 focus:border-sky-500 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none"
              >
                <option value="Manometer Analog (Bourdon Tube)">Manometer Analog (Bourdon Tube / Jarum)</option>
                <option value="Digital Pressure Gauge">Digital Pressure Gauge (Manometer Digital)</option>
                <option value="Manometer di Hidran / Kran Warga">Manometer di Hidran / Kran Warga</option>
                <option value="Manometer di Air Valve / Washout">Manometer di Air Valve / Washout</option>
                <option value="Clamp-on Ultrasonic Flowmeter">Clamp-on Ultrasonic Flowmeter (Debit)</option>
                <option value="Electromagnetic Flowmeter">Electromagnetic Flowmeter</option>
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
