import React, { useMemo } from 'react';
import {
  Droplets, AlertTriangle, TrendingDown, TrendingUp,
  BarChart3, MapPin, Shield, ShieldAlert, ShieldCheck,
  DollarSign, Activity, ArrowRight, Layers, Target,
  Gauge, Info, Zap, CircleDot
} from 'lucide-react';
import {
  generateNRWReport,
  formatRupiah,
  formatVolume
} from '../utils/waterLossAnalysis';

export default function WaterLossView({ networkData, measurements, onSelectPipe }) {
  const report = useMemo(() => {
    if (!networkData || !networkData.pipes || networkData.pipes.length === 0) return null;
    return generateNRWReport(networkData, measurements || {});
  }, [networkData, measurements]);

  if (!report || report.networkStats.totalMeasured === 0) {
    return (
      <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto p-4 pb-28">
        <div className="flex flex-col items-center justify-center flex-1 space-y-4 p-8 text-center bg-slate-900/90 border border-slate-800 rounded-3xl">
          <div className="p-4 bg-slate-800/50 rounded-full">
            <Info className="w-8 h-8 text-sky-400" />
          </div>
          <h3 className="text-xl font-bold">Data Pengukuran Belum Tersedia</h3>
          <p className="text-sm text-slate-400 max-w-sm">
            Silakan masukkan data pengukuran lapangan (debit/tekanan) pada pipa atau muat data demo dari tab Dashboard untuk melihat analisis Kehilangan Air (NRW).
          </p>
        </div>
      </div>
    );
  }

  const { iwaBalance, financialImpact, dmaBalances, topRiskPipes, networkStats, corridorAlerts = [] } = report;

  const gradeColors = {
    'A': 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
    'B': 'text-sky-400 bg-sky-400/10 border-sky-400/20',
    'C': 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    'D': 'text-orange-400 bg-orange-400/10 border-orange-400/20',
    'F': 'text-rose-400 bg-rose-400/10 border-rose-400/20'
  };

  const gradeBarColors = {
    'A': 'bg-emerald-400',
    'B': 'bg-sky-400',
    'C': 'bg-amber-400',
    'D': 'bg-orange-400',
    'F': 'bg-rose-400'
  };

  const severityBorders = {
    'normal': 'border-emerald-500/20',
    'warning': 'border-amber-500/20',
    'critical': 'border-rose-500/20'
  };

  const nrwPct = iwaBalance.nrwPercent;
  const nrwColor = nrwPct < 25 ? 'emerald' : nrwPct <= 40 ? 'amber' : 'rose';
  const nrwBadgeClass = nrwPct < 25
    ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
    : nrwPct <= 40
    ? 'bg-amber-400/10 text-amber-400 border-amber-400/20'
    : 'bg-rose-400/10 text-rose-400 border-rose-400/20';

  const nrwGaugeMarkerClass = nrwPct < 25
    ? 'bg-emerald-500'
    : nrwPct <= 40
    ? 'bg-amber-500'
    : 'bg-rose-500';

  // Compute overall grade from average risk score
  const avgScore = networkStats.avgRiskScore;
  const overallGrade = avgScore > 80 ? 'F' : avgScore > 60 ? 'D' : avgScore > 40 ? 'C' : avgScore > 20 ? 'B' : 'A';

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto p-4 space-y-4 pb-28">
      
      {/* Section 1: Header Card */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700/80 rounded-3xl p-4 flex justify-between items-center shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <Droplets className="w-5 h-5 fill-sky-400/20" />
          </div>
          <div>
            <h1 className="text-sm font-bold uppercase tracking-wider text-white">Analisis Kehilangan Air (NRW)</h1>
            <p className="text-[10px] text-slate-400">Standar IWA Water Balance — Jaringan Subang ADB</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-full text-sm font-bold border font-mono ${nrwBadgeClass}`}>
          NRW: {nrwPct.toFixed(1)}%
        </div>
      </div>

      {/* Section 2: IWA Water Balance Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4 space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-sky-400" />
          IWA Water Balance
        </h2>
        
        {/* Row 1: SIV */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-sky-500/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-sky-500"></div>
          <div className="flex justify-between items-center">
            <div>
              <div className="text-[10px] font-bold uppercase text-sky-400/80 mb-1">Volume Input Sistem (SIV)</div>
              <div className="text-2xl font-bold font-mono text-sky-400">{iwaBalance.sivLps.toFixed(2)} <span className="text-sm text-slate-500 font-sans">L/s</span></div>
            </div>
            <div className="text-right">
              <div className="text-sm font-mono text-slate-300">{formatVolume(iwaBalance.sivM3Day)} <span className="text-[10px] text-slate-500 font-sans">/hari</span></div>
              <div className="text-sm font-mono text-slate-400">{formatVolume(iwaBalance.sivM3Month)} <span className="text-[10px] text-slate-500 font-sans">/bulan</span></div>
            </div>
          </div>
        </div>

        {/* Row 2: Konsumsi & Kehilangan */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 p-3 rounded-2xl border border-emerald-500/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
            <div className="text-[10px] font-bold uppercase text-emerald-400/80 mb-1">Konsumsi Berizin</div>
            <div className="text-lg font-bold font-mono text-emerald-400">{iwaBalance.authorizedLps.toFixed(2)} <span className="text-xs text-slate-500 font-sans">L/s</span></div>
            <div className="text-xs font-mono text-slate-400 mt-1">{formatVolume(iwaBalance.authorizedM3Day)} <span className="text-[10px] text-slate-500 font-sans">/hari</span></div>
          </div>
          
          <div className="bg-slate-950 p-3 rounded-2xl border border-rose-500/20 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
            <div className="text-[10px] font-bold uppercase text-rose-400/80 mb-1">Kehilangan Air (NRW)</div>
            <div className="text-lg font-bold font-mono text-rose-400">{iwaBalance.waterLossLps.toFixed(2)} <span className="text-xs text-slate-500 font-sans">L/s</span></div>
            <div className="text-xs font-mono text-slate-400 mt-1">{formatVolume(iwaBalance.waterLossM3Day)} <span className="text-[10px] text-slate-500 font-sans">/hari</span></div>
          </div>
        </div>

        {/* Row 3: Nyata vs Semu */}
        <div className="grid grid-cols-2 gap-3 ml-2 border-l-2 border-slate-800 pl-3">
          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-rose-500/10">
            <div className="text-[10px] uppercase text-rose-300/70 mb-1">Kehilangan Nyata (70%)</div>
            <div className="text-sm font-bold font-mono text-rose-300">{iwaBalance.realLossLps.toFixed(2)} L/s</div>
          </div>
          <div className="bg-slate-950/50 p-2.5 rounded-xl border border-amber-500/10">
            <div className="text-[10px] uppercase text-amber-300/70 mb-1">Kehilangan Semu (30%)</div>
            <div className="text-sm font-bold font-mono text-amber-300">{iwaBalance.apparentLossLps.toFixed(2)} L/s</div>
          </div>
        </div>
        
        <p className="text-[10px] text-slate-500 italic mt-2 flex items-center gap-1">
          <Info className="w-3 h-3 shrink-0" />
          Berdasarkan data pasokan reservoir ({iwaBalance.sivSource === 'measured' ? 'terukur lapangan' : 'model desain'})
        </p>
      </div>

      {/* Section 3: NRW Gauge Visual */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-4">
          <Gauge className="w-4 h-4 text-amber-400" />
          Indikator NRW
        </h2>
        
        <div className="relative pt-6 pb-2">
          {/* Bar background */}
          <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500" style={{ width: '25%' }}></div>
            <div className="h-full bg-amber-500" style={{ width: '15%' }}></div>
            <div className="h-full bg-rose-500" style={{ width: '60%' }}></div>
          </div>
          
          {/* Marker */}
          <div 
            className="absolute top-1 flex flex-col items-center"
            style={{ left: `${Math.min(nrwPct, 100)}%`, transform: 'translateX(-50%)' }}
          >
            <div className={`px-2 py-0.5 rounded text-[10px] font-bold text-white shadow-lg ${nrwGaugeMarkerClass}`}>
              {nrwPct.toFixed(1)}%
            </div>
            <div className={`w-0.5 h-4 mt-0.5 ${nrwGaugeMarkerClass}`}></div>
          </div>

          {/* Labels */}
          <div className="flex justify-between text-[10px] text-slate-500 mt-3 font-mono relative">
            <span>0%</span>
            <span className="absolute" style={{ left: '25%', transform: 'translateX(-50%)' }}>25% Target</span>
            <span className="absolute" style={{ left: '40%', transform: 'translateX(-50%)' }}>40%</span>
            <span>100%</span>
          </div>
        </div>
        
        <p className="text-[10px] text-slate-400 text-center mt-3">
          Target IWA: &lt; 25% | Rata-rata PDAM Indonesia: ~33%
        </p>
      </div>

      {/* Section 4: Kerugian Finansial */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
          <DollarSign className="w-4 h-4 text-rose-400" />
          Estimasi Kerugian Finansial
        </h2>
        
        <div className="grid grid-cols-3 gap-2">
          {/* Harian */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="text-[10px] uppercase text-slate-500 mb-2">Harian</div>
            <div className="text-[11px] font-mono text-slate-400 mb-1">{formatVolume(financialImpact.lossM3Day)}</div>
            <div className="text-sm font-bold font-mono text-rose-400 break-words">{formatRupiah(Math.round(financialImpact.lossRpDay))}</div>
          </div>
          
          {/* Bulanan */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="text-[10px] uppercase text-slate-500 mb-2">Bulanan</div>
            <div className="text-[11px] font-mono text-slate-400 mb-1">{formatVolume(financialImpact.lossM3Month)}</div>
            <div className="text-sm font-bold font-mono text-rose-400 break-words">{formatRupiah(Math.round(financialImpact.lossRpMonth))}</div>
          </div>
          
          {/* Tahunan */}
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex flex-col justify-between">
            <div className="text-[10px] uppercase text-slate-500 mb-2">Tahunan</div>
            <div className="text-[11px] font-mono text-slate-400 mb-1">{formatVolume(financialImpact.lossM3Year)}</div>
            <div className="text-sm font-bold font-mono text-rose-400 break-words">{formatRupiah(Math.round(financialImpact.lossRpYear))}</div>
          </div>
        </div>
        
        <p className="text-[10px] text-slate-500 italic mt-3 text-right">
          *Berdasarkan tarif PDAM {formatRupiah(financialImpact.tariffPerM3)}/m³
        </p>
      </div>

      {/* Section 5: Zona DMA Cards */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
          <Layers className="w-4 h-4 text-sky-400" />
          Neraca Air per Zona DMA
        </h2>
        
        <div className="space-y-3">
          {dmaBalances.map(zone => {
            const maxVal = Math.max(zone.totalDesignFlowLps, zone.totalActualFlowLps || 0, 1);
            const actualPct = zone.totalActualFlowLps ? (zone.totalActualFlowLps / maxVal) * 100 : 0;
            const designPct = (zone.totalDesignFlowLps / maxVal) * 100;
            
            return (
              <div key={zone.zoneId} className={`bg-slate-950 p-3 rounded-2xl border ${severityBorders[zone.severity] || 'border-slate-800'}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="font-bold text-sm text-slate-200">{zone.zoneLabel}</div>
                  <div className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 font-mono">
                    {zone.measuredCount}/{zone.totalPipes} terukur ({zone.coveragePercent.toFixed(0)}%)
                  </div>
                </div>
                
                <div className="space-y-1.5 mb-2">
                  <div className="flex items-center text-xs">
                    <span className="w-12 text-slate-500 text-[10px]">Desain</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden mx-2">
                      <div className="h-full bg-slate-500" style={{ width: `${designPct}%` }}></div>
                    </div>
                    <span className="font-mono text-slate-300 w-14 text-right text-[11px]">{zone.totalDesignFlowLps.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center text-xs">
                    <span className="w-12 text-slate-500 text-[10px]">Aktual</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden mx-2">
                      <div className="h-full bg-sky-500" style={{ width: `${actualPct}%` }}></div>
                    </div>
                    <span className="font-mono text-sky-400 w-14 text-right text-[11px]">{zone.measuredCount > 0 ? zone.totalActualFlowLps.toFixed(1) : '-'}</span>
                  </div>
                </div>
                
                {zone.lossLps > 0 && (
                  <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-800/50">
                    <div className="text-[10px] text-slate-400">Kehilangan:</div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-rose-400 font-bold">{zone.lossLps.toFixed(1)} L/s ({zone.lossPercent.toFixed(1)}%)</span>
                      <span className="text-[10px] font-mono text-slate-500">~{formatVolume(zone.lossLps * 86.4)}/hari</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section: Deteksi Kebocoran Antar Titik Ukur (Koridor Jalur) */}
      {corridorAlerts && corridorAlerts.length > 0 && (
        <div className="bg-slate-900/90 border border-amber-500/30 rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Deteksi Kebocoran Antar Titik Ukur (Koridor Jalur)
            </h2>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
              {corridorAlerts.length} Segmen
            </span>
          </div>

          <div className="space-y-2">
            {corridorAlerts.map((alert, idx) => {
              const upPipe = (networkData.pipes || []).find(p => p.id === alert.upstreamPipeId);
              return (
                <div
                  key={idx}
                  onClick={() => upPipe && onSelectPipe && onSelectPipe(upPipe)}
                  className={`bg-slate-950/80 hover:bg-slate-950 p-3 rounded-2xl border transition cursor-pointer shadow-md ${
                    alert.severity === 'critical' ? 'border-rose-900/50 hover:border-rose-500' : 'border-amber-900/50 hover:border-amber-500'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-xs text-white flex items-center gap-1.5">
                      <span>{alert.routeLabel}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                      alert.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      Hilang {alert.pctLoss}%
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-300 font-mono mt-0.5">
                    Hulu: <span className="text-sky-400 font-bold">{alert.qUp.toFixed(2)} L/s</span> ➔ Hilir: <span className="text-amber-400 font-bold">{alert.qDown.toFixed(2)} L/s</span> (Δ {alert.deltaQ.toFixed(2)} L/s)
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {alert.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 6: Prioritas Risiko Kebocoran */}
      <div className="bg-slate-900/90 border border-rose-500/30 rounded-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            Top 10 Pipa Risiko Kebocoran
          </h2>
          <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full font-bold">
            {networkStats.pipesAtRisk} pipa berisiko
          </span>
        </div>
        
        <div className="space-y-2.5">
          {topRiskPipes.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-4">Belum ada data risiko.</div>
          ) : (
            topRiskPipes.map((item, index) => {
              const p = item.pipe;
              const gradeStyle = gradeColors[item.grade] || gradeColors['C'];
              const barColor = gradeBarColors[item.grade] || 'bg-amber-400';
              
              return (
                <div 
                  key={p.id || index} 
                  onClick={() => onSelectPipe && onSelectPipe(p)}
                  className="bg-slate-950/80 hover:bg-slate-950 p-3 rounded-2xl border border-slate-800 hover:border-slate-600 cursor-pointer transition shadow-md"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">
                          {index + 1}. {p._fromLabel || '?'} → {p._toLabel || '?'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md text-[9px] font-mono bg-slate-800 text-slate-400">
                          Ø {p.diameter}mm
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {p.material} • {(p.length || 0).toFixed(0)} m
                      </div>
                    </div>
                    
                    <div className={`px-2.5 py-1.5 rounded-xl border flex flex-col items-center justify-center min-w-[44px] ${gradeStyle}`}>
                      <span className="text-sm font-bold leading-none">{item.grade}</span>
                      <span className="text-[9px] font-mono leading-none mt-0.5">{Math.round(item.totalScore)}</span>
                    </div>
                  </div>
                  
                  {/* Score bar */}
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(item.totalScore, 100)}%` }}></div>
                  </div>
                  
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[10px] text-slate-400 flex flex-wrap gap-1">
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded">Debit: {item.factors.flowDeviation.toFixed(0)}</span>
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded">Material: {item.factors.materialRisk.toFixed(0)}</span>
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded">Tekanan: {item.factors.pressureStress.toFixed(0)}</span>
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded">Kecepatan: {item.factors.velocityStress.toFixed(0)}</span>
                      <span className="bg-slate-800 px-1.5 py-0.5 rounded">Panjang: {item.factors.lengthRisk.toFixed(0)}</span>
                    </div>
                    <div className="text-[10px] font-medium text-amber-400/80 bg-black/30 p-2 rounded-lg border border-white/5">
                      💡 {item.recommendation}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Section 7: Ringkasan Statistik Jaringan */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
          <Activity className="w-4 h-4 text-sky-400" />
          Statistik Jaringan
        </h2>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Pipa</div>
            <div className="text-xl font-bold font-mono text-white">{networkStats.totalPipes}</div>
          </div>
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Panjang</div>
            <div className="text-xl font-bold font-mono text-white">{(networkStats.totalLength / 1000).toFixed(1)} <span className="text-xs text-slate-500 font-sans">km</span></div>
          </div>
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Terukur</div>
            <div className="text-xl font-bold font-mono text-white">{networkStats.totalMeasured} <span className="text-xs text-slate-500 font-sans">({networkStats.totalPipes > 0 ? ((networkStats.totalMeasured / networkStats.totalPipes) * 100).toFixed(0) : 0}%)</span></div>
          </div>
          <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
            <div className="text-[9px] uppercase font-bold text-slate-400 tracking-wider mb-1">Risiko Rata-rata</div>
            <div className={`text-xl font-bold font-mono ${gradeColors[overallGrade]?.split(' ')[0] || 'text-slate-300'}`}>
              {Math.round(networkStats.avgRiskScore)} <span className="text-xs font-sans">({overallGrade})</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
