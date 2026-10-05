import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Droplets,
  Gauge,
  Layers,
  Sparkles,
  Download,
  RotateCcw,
  ShieldAlert,
  ArrowRight
} from 'lucide-react';
import { analyzeFlowStatus } from '../utils/calculations';

export default function DashboardView({
  networkData,
  measurements,
  onLoadDemo,
  onClearData,
  onExportCSV,
  onSelectPipe
}) {
  const totalPipes = networkData?.pipes?.length || 0;

  const nodeMap = useMemo(() => {
    return new Map((networkData?.nodes || []).map(n => [n.id, n]));
  }, [networkData]);

  // Statistics calculation
  const stats = useMemo(() => {
    let measuredCount = 0;
    let matchCount = 0;
    let warningCount = 0;
    let leakCount = 0;
    let overflowCount = 0;

    let totalDesignFlowMeasured = 0;
    let totalActualFlowMeasured = 0;

    let totalDesignPressureMeasured = 0;
    let totalActualPressureMeasured = 0;
    let measuredPressureCount = 0;

    const resNodeIds = new Set(
      (networkData?.nodes || []).filter(n => n.type === 'reservoir').map(n => n.id)
    );
    let mainSupplyQ = 0;

    const criticalLeaks = [];

    (networkData?.pipes || []).forEach(pipe => {
      const fromNode = nodeMap.get(pipe.startNodeId);
      const toNode = nodeMap.get(pipe.endNodeId);
      const pFrom = fromNode?.pressure ?? null;
      const pTo = toNode?.pressure ?? null;
      const designPressure = pFrom !== null && pTo !== null ? (pFrom + pTo) / 2 : (pFrom ?? pTo ?? 2.4);

      if (resNodeIds.has(pipe.startNodeId) || resNodeIds.has(pipe.endNodeId)) {
        mainSupplyQ += Math.abs(pipe.flowRate || 0);
      }

      const meas = measurements[pipe.id];
      if (meas && meas.actualFlow !== undefined) {
        measuredCount++;
        const designFlow = Math.abs(pipe.flowRate || 0);
        const actualFlow = Number(meas.actualFlow);

        totalDesignFlowMeasured += designFlow;
        totalActualFlowMeasured += actualFlow;

        if (meas.actualPressure !== undefined && meas.actualPressure !== null && !isNaN(meas.actualPressure)) {
          totalDesignPressureMeasured += designPressure;
          totalActualPressureMeasured += Number(meas.actualPressure);
          measuredPressureCount++;
        }

        const analysis = analyzeFlowStatus(designFlow, actualFlow);
        if (analysis.status === 'match') matchCount++;
        else if (analysis.status === 'warning') warningCount++;
        else if (analysis.status === 'leak_alert') {
          leakCount++;
          criticalLeaks.push({
            pipe: {
              ...pipe,
              _fromLabel: fromNode?.label,
              _toLabel: toNode?.label,
              _designPressure: designPressure
            },
            analysis,
            meas
          });
        } else if (analysis.status === 'overflow_alert') overflowCount++;
      }
    });

    criticalLeaks.sort((a, b) => a.analysis.percentDeviation - b.analysis.percentDeviation);

    const progressPercent = totalPipes > 0 ? (measuredCount / totalPipes) * 100 : 0;
    const matchPercent = measuredCount > 0 ? (matchCount / measuredCount) * 100 : 0;
    const netDifference = totalActualFlowMeasured - totalDesignFlowMeasured;
    const avgDesignPressure = measuredPressureCount > 0 ? totalDesignPressureMeasured / measuredPressureCount : 2.4;
    const avgActualPressure = measuredPressureCount > 0 ? totalActualPressureMeasured / measuredPressureCount : 0;

    return {
      mainSupplyQ,
      measuredCount,
      unmeasuredCount: totalPipes - measuredCount,
      matchCount,
      warningCount,
      leakCount,
      overflowCount,
      progressPercent,
      matchPercent,
      totalDesignFlowMeasured,
      totalActualFlowMeasured,
      netDifference,
      measuredPressureCount,
      avgDesignPressure,
      avgActualPressure,
      criticalLeaks
    };
  }, [networkData, measurements, nodeMap, totalPipes]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto p-4 space-y-4 pb-28">
      {/* Top Header Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-4 rounded-3xl border border-slate-700/80 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-sky-400" />
              Monitoring Jaringan Subang ADB
            </h2>
            <p className="text-xs text-slate-400">
              Evaluasi Kesesuaian Debit Model vs Debit Aktual Lapangan
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs bg-sky-500/20 text-sky-400 font-mono px-2.5 py-1 rounded-full border border-sky-500/30">
              Pasokan Utama: {stats.mainSupplyQ.toFixed(1)} L/s
            </span>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2.5 py-1 rounded-full border border-slate-700">
              235 Pipa
            </span>
          </div>
        </div>

        {/* Inspection Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-semibold">
            <span className="text-slate-300">Progres Verifikasi Lapangan</span>
            <span className="text-sky-400 font-mono">
              {stats.measuredCount} / {totalPipes} ({stats.progressPercent.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className="bg-gradient-to-r from-sky-500 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, stats.progressPercent)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick Status Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* Sesuai */}
        <div className="bg-slate-900/90 border border-emerald-500/30 p-3 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">
              Sesuai (Normal)
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">{stats.matchCount}</span>
            <span className="text-[10px] text-slate-400 block">
              {stats.matchPercent.toFixed(0)}% dari terinspeksi
            </span>
          </div>
        </div>

        {/* Anomali Bocor / Drop */}
        <div className="bg-slate-900/90 border border-rose-500/30 p-3 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">
              Drop / Bocor
            </span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">{stats.leakCount}</span>
            <span className="text-[10px] text-rose-400 block">Perlu tindak lanjut</span>
          </div>
        </div>

        {/* Peringatan */}
        <div className="bg-slate-900/90 border border-amber-500/30 p-3 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">
              Peringatan (±25%)
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">{stats.warningCount}</span>
            <span className="text-[10px] text-slate-400 block">Observasi lanjutan</span>
          </div>
        </div>

        {/* Belum Diukur */}
        <div className="bg-slate-900/90 border border-slate-700 p-3 rounded-2xl flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              Belum Diukur
            </span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2">
            <span className="text-2xl font-bold font-mono text-white">{stats.unmeasuredCount}</span>
            <span className="text-[10px] text-slate-400 block">Pipa tersisa</span>
          </div>
        </div>
      </div>

      {/* Water Balance Comparison (Debit Rencana vs Debit Aktual) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Droplets className="w-4 h-4 text-sky-400" />
          Neraca Debit Air Terverifikasi (L/detik)
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Total Desain Rencana</div>
            <div className="text-xl font-bold font-mono text-sky-400 mt-1">
              {stats.totalDesignFlowMeasured.toFixed(2)}{' '}
              <span className="text-xs text-slate-500 font-sans">L/s</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              ≈ {(stats.totalDesignFlowMeasured * 3.6).toFixed(1)} m³/jam
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Total Aktual Lapangan</div>
            <div
              className={`text-xl font-bold font-mono mt-1 ${
                stats.netDifference < 0 ? 'text-rose-400' : 'text-emerald-400'
              }`}
            >
              {stats.totalActualFlowMeasured.toFixed(2)}{' '}
              <span className="text-xs text-slate-500 font-sans">L/s</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Selisih: {stats.netDifference >= 0 ? '+' : ''}
              {stats.netDifference.toFixed(2)} L/s
            </div>
          </div>
        </div>

        {stats.measuredCount === 0 && (
          <div className="p-3 bg-sky-950/30 border border-sky-800/40 rounded-xl text-xs text-sky-300 flex items-center justify-between gap-2">
            <span>Belum ada data lapangan. Klik tombol di bawah untuk mengisi contoh data simulasi.</span>
          </div>
        )}
      </div>

      {/* Pressure Balance Comparison (Tekanan Rencana vs Tekanan Aktual) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Gauge className="w-4 h-4 text-amber-400" />
          Neraca Tekanan Air Terverifikasi (bar)
        </h3>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Rata-rata Model Desain</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">
              {stats.avgDesignPressure.toFixed(2)}{' '}
              <span className="text-xs text-slate-500 font-sans">bar</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Baseline hidraulik pipa
            </div>
          </div>

          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[10px] uppercase font-semibold text-slate-400">Rata-rata Aktual Lapangan</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              {stats.measuredPressureCount > 0 ? stats.avgActualPressure.toFixed(2) : '-'}{' '}
              <span className="text-xs text-slate-500 font-sans">bar</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {stats.measuredPressureCount > 0
                ? `${stats.measuredPressureCount} titik terukur`
                : 'Belum ada data tekanan'}
            </div>
          </div>
        </div>
      </div>

      {/* Critical Leak Alert Priority List */}
      {stats.criticalLeaks.length > 0 && (
        <div className="bg-slate-900/90 border border-rose-500/40 rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Prioritas Investigasi Kebocoran / Hambatan
            </h3>
            <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
              {stats.criticalLeaks.length} Titik
            </span>
          </div>

          <div className="space-y-2">
            {stats.criticalLeaks.slice(0, 4).map(({ pipe, analysis, meas }) => (
              <div
                key={pipe.id}
                onClick={() => onSelectPipe(pipe)}
                className="bg-slate-950/80 hover:bg-slate-950 border border-rose-900/40 hover:border-rose-500 rounded-2xl p-3 flex items-center justify-between cursor-pointer transition"
              >
                <div>
                  <div className="font-bold text-xs text-white">
                    {pipe._fromLabel} → {pipe._toLabel} ({pipe.diameter}mm)
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Model: {Math.abs(pipe.flowRate || 0)} L/s ➔ Aktual:{' '}
                    <strong className="text-rose-400">{meas.actualFlow} L/s</strong> (
                    {analysis.percentDeviation.toFixed(1)}%)
                  </div>
                  {meas.physicalCondition && (
                    <div className="text-[10px] text-amber-300 mt-1">
                      Kondisi: {meas.physicalCondition}
                    </div>
                  )}
                </div>
                <button className="text-xs text-sky-400 font-semibold p-1 hover:text-sky-300">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fast Action Tools */}
      <div className="space-y-2 pt-2">
        <h4 className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
          Aksi & Pengelolaan Data
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Load Demo Data */}
          <button
            onClick={onLoadDemo}
            className="w-full bg-slate-800 hover:bg-slate-750 active:scale-98 border border-slate-700 text-sky-400 font-semibold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-md"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            Muat Contoh Data Lapangan (Demo)
          </button>

          {/* Export CSV */}
          <button
            onClick={onExportCSV}
            className="w-full bg-slate-800 hover:bg-slate-750 active:scale-98 border border-slate-700 text-emerald-400 font-semibold py-3 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 transition shadow-md"
          >
            <Download className="w-4 h-4" />
            Unduh Laporan Excel / CSV
          </button>
        </div>

        {/* Clear Data */}
        {stats.measuredCount > 0 && (
          <button
            onClick={onClearData}
            className="w-full text-slate-500 hover:text-rose-400 py-2 text-xs flex items-center justify-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Hapus Semua Pengukuran Lapangan
          </button>
        )}
      </div>
    </div>
  );
}
