import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle,
  AlertTriangle,
  Clock,
  Compass,
  Droplets,
  Gauge,
  ChevronRight,
  CircleDot
} from 'lucide-react';
import { analyzeFlowStatus, getDistanceToPolyline, formatFlow } from '../utils/calculations';

export default function PipeListView({
  networkData,
  measurements,
  onSelectPipe,
  onSelectNode,
  userLocation
}) {
  const [listMode, setListMode] = useState('pipes'); // 'pipes' | 'nodes'
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'unmeasured', 'match', 'warning', 'leak', 'overflow'
  const [nodeFilter, setNodeFilter] = useState('all'); // 'all', 'has_demand', 'overridden'
  const [sortBy, setSortBy] = useState('deviation'); // 'deviation', 'diameter', 'distance', 'id'

  const nodeMap = useMemo(() => {
    return new Map((networkData?.nodes || []).map(n => [n.id, n]));
  }, [networkData]);

  // Enhanced pipe list with distances & status
  const enrichedPipes = useMemo(() => {
    if (!networkData?.pipes) return [];

    return networkData.pipes.map(pipe => {
      const fromNode = nodeMap.get(pipe.startNodeId);
      const toNode = nodeMap.get(pipe.endNodeId);
      const meas = measurements[pipe.id];
      const analysis = analyzeFlowStatus(pipe.flowRate, meas?.actualFlow);

      const pFrom = fromNode?.pressure ?? null;
      const pTo = toNode?.pressure ?? null;
      const designPressure = pFrom !== null && pTo !== null ? (pFrom + pTo) / 2 : (pFrom ?? pTo ?? 2.4);

      let distance = null;
      if (userLocation && pipe.routeCoordinates) {
        distance = getDistanceToPolyline([userLocation.lat, userLocation.lng], pipe.routeCoordinates);
      }

      return {
        ...pipe,
        _fromLabel: fromNode?.label || 'J',
        _toLabel: toNode?.label || 'J',
        _designPressure: designPressure,
        _measurement: meas,
        _analysis: analysis,
        _distance: distance
      };
    });
  }, [networkData, measurements, userLocation, nodeMap]);

  // Filtered & Sorted
  const filteredPipes = useMemo(() => {
    return enrichedPipes
      .filter(pipe => {
        // Status Filter
        if (statusFilter === 'unmeasured' && pipe._analysis.status !== 'unmeasured') return false;
        if (statusFilter === 'match' && pipe._analysis.status !== 'match') return false;
        if (statusFilter === 'warning' && pipe._analysis.status !== 'warning') return false;
        if (statusFilter === 'leak' && pipe._analysis.status !== 'leak_alert') return false;
        if (statusFilter === 'overflow' && pipe._analysis.status !== 'overflow_alert') return false;

        // Search Term
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        const pipeName = `${pipe._fromLabel} ${pipe._toLabel}`.toLowerCase();
        const id = pipe.id.toLowerCase();
        const mat = (pipe.material || '').toLowerCase();
        const dia = String(pipe.diameter);

        return (
          pipeName.includes(q) ||
          id.includes(q) ||
          mat.includes(q) ||
          dia.includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'deviation') {
          // Absolute deviation descending
          const devA = a._measurement ? Math.abs(a._analysis.percentDeviation) : -1;
          const devB = b._measurement ? Math.abs(b._analysis.percentDeviation) : -1;
          return devB - devA;
        }
        if (sortBy === 'distance') {
          if (a._distance === null) return 1;
          if (b._distance === null) return -1;
          return a._distance - b._distance;
        }
        if (sortBy === 'diameter') {
          return b.diameter - a.diameter;
        }
        return a.id.localeCompare(b.id);
      });
  }, [enrichedPipes, statusFilter, searchTerm, sortBy]);

  // Counts for filter chips
  const counts = useMemo(() => {
    const c = { all: enrichedPipes.length, unmeasured: 0, match: 0, warning: 0, leak: 0, overflow: 0 };
    enrichedPipes.forEach(p => {
      if (p._analysis.status === 'unmeasured') c.unmeasured++;
      if (p._analysis.status === 'match') c.match++;
      if (p._analysis.status === 'warning') c.warning++;
      if (p._analysis.status === 'leak_alert') c.leak++;
      if (p._analysis.status === 'overflow_alert') c.overflow++;
    });
    return c;
  }, [enrichedPipes]);

  // Filtered & Sorted Nodes
  const filteredNodes = useMemo(() => {
    const nodes = networkData?.nodes || [];
    return nodes
      .filter(n => {
        if (nodeFilter === 'has_demand' && !(n.demand > 0)) return false;
        if (nodeFilter === 'overridden' && !n._isOverridden) return false;

        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        const label = (n.label || '').toLowerCase();
        const id = (n.id || '').toLowerCase();
        const notes = (n._notes || '').toLowerCase();
        return label.includes(q) || id.includes(q) || notes.includes(q);
      })
      .sort((a, b) => {
        // Sort by demand descending first, then label
        const demA = a.demand || 0;
        const demB = b.demand || 0;
        if (demB !== demA) return demB - demA;
        return (a.label || '').localeCompare(b.label || '', undefined, { numeric: true });
      });
  }, [networkData, nodeFilter, searchTerm]);

  const nodeCounts = useMemo(() => {
    const nodes = networkData?.nodes || [];
    let hasDemand = 0;
    let overridden = 0;
    let totalDemandLps = 0;
    nodes.forEach(n => {
      if (n.demand > 0) {
        hasDemand++;
        totalDemandLps += Number(n.demand);
      }
      if (n._isOverridden) overridden++;
    });
    return {
      all: nodes.length,
      hasDemand,
      overridden,
      totalDemandLps
    };
  }, [networkData]);

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Search and Sort Topbar */}
      <div className="p-3 bg-slate-900 border-b border-slate-800 space-y-2.5 shrink-0">
        {/* Mode Switcher: Jalur Pipa vs Node / Demand */}
        <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setListMode('pipes')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              listMode === 'pipes'
                ? 'bg-sky-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>Jalur Pipa ({counts.all})</span>
          </button>
          <button
            onClick={() => setListMode('nodes')}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition ${
              listMode === 'nodes'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CircleDot className="w-3.5 h-3.5" />
            <span>Node / Demand ({nodeCounts.all})</span>
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={
              listMode === 'pipes'
                ? 'Cari pipa (contoh: J307, 150, DCI)...'
                : 'Cari node (contoh: J21, J307, R1)...'
            }
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2 text-slate-400 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {listMode === 'pipes' ? (
          <>
            {/* Filter Chips Horizontal Scroll */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition ${
                  statusFilter === 'all'
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Semua ({counts.all})
              </button>
              <button
                onClick={() => setStatusFilter('leak')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1 ${
                  statusFilter === 'leak'
                    ? 'bg-rose-500 text-white font-bold'
                    : 'bg-slate-800 text-rose-400 hover:bg-slate-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Bocor/Drop ({counts.leak})
              </button>
              <button
                onClick={() => setStatusFilter('match')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1 ${
                  statusFilter === 'match'
                    ? 'bg-emerald-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Sesuai ({counts.match})
              </button>
              <button
                onClick={() => setStatusFilter('warning')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1 ${
                  statusFilter === 'warning'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Peringatan ({counts.warning})
              </button>
              <button
                onClick={() => setStatusFilter('unmeasured')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1 ${
                  statusFilter === 'unmeasured'
                    ? 'bg-slate-200 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Belum Diukur ({counts.unmeasured})
              </button>
            </div>

            {/* Sort selector */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>Menampilkan {filteredPipes.length} jalur pipa</span>
              <div className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-slate-300 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="deviation" className="bg-slate-900">Deviasi Terbesar</option>
                  <option value="distance" className="bg-slate-900">Jarak GPS Terdekat</option>
                  <option value="diameter" className="bg-slate-900">Diameter Terbesar</option>
                  <option value="id" className="bg-slate-900">Urutkan ID</option>
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Filter Chips Node */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[11px]">
              <button
                onClick={() => setNodeFilter('all')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition ${
                  nodeFilter === 'all'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Semua Node ({nodeCounts.all})
              </button>
              <button
                onClick={() => setNodeFilter('has_demand')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1 ${
                  nodeFilter === 'has_demand'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-amber-400 hover:bg-slate-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Ada Demand &gt; 0 ({nodeCounts.hasDemand})
              </button>
              <button
                onClick={() => setNodeFilter('overridden')}
                className={`px-2.5 py-1 rounded-lg shrink-0 font-medium transition flex items-center gap-1 ${
                  nodeFilter === 'overridden'
                    ? 'bg-sky-500 text-slate-950 font-bold'
                    : 'bg-slate-800 text-sky-400 hover:bg-slate-700'
                }`}
              >
                Diubah Manual ({nodeCounts.overridden})
              </button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>Menampilkan {filteredNodes.length} titik node</span>
              <span className="font-mono text-amber-400 font-bold">
                Total Demand: {nodeCounts.totalDemandLps.toFixed(1)} L/s
              </span>
            </div>
          </>
        )}
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5 pb-24">
        {listMode === 'nodes' ? (
          filteredNodes.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              Tidak ada titik node yang sesuai dengan pencarian atau filter Anda.
            </div>
          ) : (
            filteredNodes.map((node) => {
              const origDemand = node._originalDemand !== undefined ? node._originalDemand : (node.demand || 0);
              const currDemand = node.demand || 0;
              return (
                <div
                  key={node.id}
                  onClick={() => onSelectNode && onSelectNode(node)}
                  className="bg-slate-900/90 hover:bg-slate-850 active:bg-slate-800 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-3.5 transition cursor-pointer shadow-sm flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                        currDemand > 0
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      <CircleDot className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-white">Node {node.label}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono uppercase">
                          {node.type}
                        </span>
                        {node._isOverridden && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold">
                            Diubah
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">
                        Elevasi: {node.elevation} m • P Desain: {(node.pressure || 0).toFixed(2)} bar
                        {node._notes ? ` • ${node._notes}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono font-bold text-amber-400">
                      {currDemand.toFixed(2)} L/s
                    </div>
                    {node._isOverridden && origDemand !== currDemand ? (
                      <div className="text-[10px] font-mono text-slate-500">
                        Desain: {origDemand.toFixed(2)} L/s
                      </div>
                    ) : (
                      <div className="text-[10px] text-sky-400 font-semibold flex items-center justify-end gap-0.5 mt-0.5">
                        <span>Ubah Demand</span>
                        <ChevronRight className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )
        ) : filteredPipes.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            Tidak ada jalur pipa yang sesuai dengan pencarian atau filter Anda.
          </div>
        ) : (
          filteredPipes.map((pipe) => {
            const hasMeas = !!pipe._measurement;
            const designQ = Math.abs(pipe.flowRate || 0);

            return (
              <div
                key={pipe.id}
                onClick={() => onSelectPipe(pipe)}
                className="bg-slate-900/90 hover:bg-slate-850 active:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-2xl p-3.5 transition cursor-pointer shadow-sm flex flex-col gap-2.5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: pipe._analysis.color }}
                    />
                    <div>
                      <h4 className="font-bold text-sm text-white">
                        {pipe._fromLabel} → {pipe._toLabel}
                      </h4>
                      <p className="text-[11px] text-slate-400 font-mono">
                        Ø {pipe.diameter} mm • {pipe.material} • P: {pipe.length} m
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pipe._analysis.badgeClass}`}
                  >
                    {pipe._analysis.label}
                  </span>
                </div>

                {/* Metrics Comparison - Tampilkan Angka Data Debit & Tekanan */}
                <div className="grid grid-cols-2 gap-2 bg-slate-950/75 p-2.5 rounded-xl border border-slate-800/80">
                  {/* Debit (Q) Panel */}
                  <div className="space-y-1 pr-2 border-r border-slate-800/80">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase">
                      <span className="flex items-center gap-1 text-sky-400">
                        <Droplets className="w-3 h-3 fill-sky-400/20" /> Debit (Q)
                      </span>
                      {hasMeas && pipe._analysis && typeof pipe._analysis.percentDeviation === 'number' && (
                        <span className="text-[9px] font-mono font-bold" style={{ color: pipe._analysis.color }}>
                          {pipe._analysis.percentDeviation >= 0 ? '+' : ''}
                          {pipe._analysis.percentDeviation.toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-slate-500 text-[10px]">Model:</span>
                      <span className="text-sky-300 font-bold">{designQ.toFixed(2)} L/s</span>
                    </div>
                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-slate-500 text-[10px]">Aktual:</span>
                      <span className="font-bold" style={{ color: pipe._analysis.color }}>
                        {pipe._measurement && pipe._measurement.actualFlow !== null && pipe._measurement.actualFlow !== undefined && !isNaN(Number(pipe._measurement.actualFlow))
                          ? `${Number(pipe._measurement.actualFlow).toFixed(2)} L/s`
                          : (pipe._measurement && pipe._measurement.actualPressure !== null && pipe._measurement.actualPressure !== undefined
                              ? 'Hanya Tekanan'
                              : 'Belum diukur')}
                      </span>
                    </div>
                  </div>

                  {/* Tekanan (P) Panel */}
                  <div className="space-y-1 pl-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold uppercase">
                      <span className="flex items-center gap-1 text-amber-400">
                        <Gauge className="w-3 h-3" /> Tekanan (P)
                      </span>
                      <span className="text-[9px] text-slate-500 font-mono">bar</span>
                    </div>
                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-slate-500 text-[10px]">Model:</span>
                      <span className="text-amber-300 font-bold">{pipe._designPressure ? pipe._designPressure.toFixed(2) : '-'} bar</span>
                    </div>
                    <div className="flex items-baseline justify-between text-xs font-mono">
                      <span className="text-slate-500 text-[10px]">Aktual:</span>
                      <span className={`font-bold ${hasMeas && pipe._measurement.actualPressure !== null && pipe._measurement.actualPressure !== undefined ? 'text-emerald-400' : 'text-slate-500'}`}>
                        {hasMeas && pipe._measurement.actualPressure !== null && pipe._measurement.actualPressure !== undefined
                          ? `${Number(pipe._measurement.actualPressure).toFixed(2)} bar`
                          : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer details: GPS distance or notes */}
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                  <div className="flex items-center gap-1 truncate max-w-[70%]">
                    {pipe._distance !== null ? (
                      <span className="text-sky-400 font-medium flex items-center gap-1">
                        <Compass className="w-3 h-3" />
                        Jarak: {Math.round(pipe._distance)} m
                      </span>
                    ) : pipe._measurement?.surveyor ? (
                      <span className="truncate">
                        Oleh: <strong>{pipe._measurement.surveyor}</strong>
                      </span>
                    ) : (
                      <span className="text-slate-500">Klik untuk input debit</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 text-sky-400 font-semibold text-xs">
                    <span>Ukur</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
