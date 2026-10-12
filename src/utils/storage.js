// Local storage management for field measurements & node demand overrides
import { calculatePipelineCascade } from './calculations';

const STORAGE_KEY = 'subang_water_pipe_measurements_v1';
const NODE_STORAGE_KEY = 'subang_water_node_overrides_v1';

export function getStoredNodeOverrides() {
  try {
    const raw = localStorage.getItem(NODE_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load node overrides', e);
    return {};
  }
}

export function saveNodeOverride(nodeId, data) {
  const all = getStoredNodeOverrides();
  all[nodeId] = {
    ...data,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(NODE_STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function deleteNodeOverride(nodeId) {
  const all = getStoredNodeOverrides();
  delete all[nodeId];
  localStorage.setItem(NODE_STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function clearAllNodeOverrides() {
  localStorage.removeItem(NODE_STORAGE_KEY);
  return {};
}

/**
 * Merge base networkData with custom node overrides (demand, elevation, notes)
 * and dynamically solve network pipe flows, velocities, headlosses, and node pressures.
 */
export function applyNodeOverrides(baseData, nodeOverrides = {}) {
  if (!baseData || !baseData.nodes) return baseData;

  let hasActiveChange = false;

  const nodes = baseData.nodes.map(node => {
    const ov = nodeOverrides[node.id];
    const origDemand = node._originalDemand !== undefined ? node._originalDemand : (node.demand || 0);
    const origElevation = node._originalElevation !== undefined ? node._originalElevation : (node.elevation || 0);
    const origPressure = node._originalPressure !== undefined ? node._originalPressure : (node.pressure ?? 2.4);
    const origHeadloss = node._originalHeadloss !== undefined ? node._originalHeadloss : (node.headloss || 0);

    if (!ov) {
      return {
        ...node,
        demand: origDemand,
        elevation: origElevation,
        pressure: origPressure,
        headloss: origHeadloss,
        _originalDemand: origDemand,
        _originalElevation: origElevation,
        _originalPressure: origPressure,
        _originalHeadloss: origHeadloss,
        _isOverridden: false,
        _notes: ''
      };
    }

    const newDemand = ov.demand !== undefined && ov.demand !== null ? Number(ov.demand) : origDemand;
    const newElevation = ov.elevation !== undefined && ov.elevation !== null ? Number(ov.elevation) : origElevation;

    if (Math.abs(newDemand - origDemand) > 1e-5 || Math.abs(newElevation - origElevation) > 1e-5) {
      hasActiveChange = true;
    }

    return {
      ...node,
      demand: newDemand,
      elevation: newElevation,
      pressure: origPressure,
      headloss: origHeadloss,
      _originalDemand: origDemand,
      _originalElevation: origElevation,
      _originalPressure: origPressure,
      _originalHeadloss: origHeadloss,
      _isOverridden: true,
      _notes: ov.notes || '',
      _updatedAt: ov.updatedAt
    };
  });

  const basePipes = (baseData.pipes || []).map(p => {
    const origQ = p._originalFlowRate !== undefined ? p._originalFlowRate : (p.flowRate || 0);
    const origV = p._originalVelocity !== undefined ? p._originalVelocity : (p.velocity || 0);
    const origHf = p._originalHeadloss !== undefined ? p._originalHeadloss : (p.headloss || 0);
    return {
      ...p,
      flowRate: origQ,
      velocity: origV,
      headloss: origHf,
      _originalFlowRate: origQ,
      _originalVelocity: origV,
      _originalHeadloss: origHf
    };
  });

  if (!hasActiveChange) {
    return {
      ...baseData,
      nodes,
      pipes: basePipes
    };
  }

  // 1. Bangun pohon suplai hidrolis (Dijkstra resistansi minimum) dari Reservoir R1 & R2
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, []));
  basePipes.forEach(p => {
    if (adj.has(p.startNodeId)) {
      adj.get(p.startNodeId).push({ pipe: p, nextId: p.endNodeId, dir: 1 });
    }
    if (adj.has(p.endNodeId)) {
      adj.get(p.endNodeId).push({ pipe: p, nextId: p.startNodeId, dir: -1 });
    }
  });

  const dist = new Map();
  const parentEdge = new Map();
  const topoOrder = [];
  const pq = [];

  nodes.filter(n => n.type === 'reservoir').forEach(r => {
    dist.set(r.id, 0);
    pq.push({ id: r.id, d: 0 });
  });

  while (pq.length > 0) {
    pq.sort((a, b) => a.d - b.d);
    const { id, d } = pq.shift();
    if (d > dist.get(id)) continue;
    topoOrder.push(id);

    const edges = adj.get(id) || [];
    for (const e of edges) {
      const D_m = Math.max(0.05, (e.pipe.diameter || 100) / 1000);
      const res = (e.pipe.length || 1) / Math.pow(D_m, 4.87);
      const nd = d + res;
      if (!dist.has(e.nextId) || nd < dist.get(e.nextId)) {
        dist.set(e.nextId, nd);
        parentEdge.set(e.nextId, { pipeId: e.pipe.id, prevId: id, dir: e.dir });
        pq.push({ id: e.nextId, d: nd });
      }
    }
  }

  // 2. Akumulasi perubahan debit (deltaDemand) sepanjang jalur dari Reservoir ke Node
  const pipeFlowDelta = new Map();
  nodes.forEach(n => {
    const deltaQ = (n.demand || 0) - (n._originalDemand || 0);
    if (Math.abs(deltaQ) > 1e-5) {
      let curr = n.id;
      while (parentEdge.has(curr)) {
        const pe = parentEdge.get(curr);
        const prevDelta = pipeFlowDelta.get(pe.pipeId) || 0;
        pipeFlowDelta.set(pe.pipeId, prevDelta + pe.dir * deltaQ);
        curr = pe.prevId;
      }
    }
  });

  // 3. Hitung ulang Q, v, dan Hazen-Williams headloss (hf) pada setiap pipa
  const pipeDeltaHf = new Map();
  const updatedPipes = basePipes.map(p => {
    const dQ = pipeFlowDelta.get(p.id) || 0;
    const newSignedQ = Number(((p._originalFlowRate || 0) + dQ).toFixed(3));
    const absQ = Math.abs(newSignedQ);
    const D_mm = p.diameter || 100;
    const D_m = D_mm / 1000;
    const L_m = p.length || 0;
    const C = p.roughness || 120;

    const newV = absQ > 0 ? Number(((4000 * absQ) / (Math.PI * D_mm * D_mm)).toFixed(3)) : 0;
    const newHf = absQ > 0 && L_m > 0
      ? Number((10.67 * L_m * Math.pow(absQ / 1000, 1.852) * Math.pow(C, -1.852) * Math.pow(D_m, -4.87)).toFixed(3))
      : 0;

    pipeDeltaHf.set(p.id, newHf - (p._originalHeadloss || 0));

    return {
      ...p,
      flowRate: newSignedQ,
      velocity: newV,
      headloss: newHf
    };
  });

  // 4. Propagasi perubahan Headloss (HGL) dari Reservoir ke seluruh Node untuk hitung Tekanan baru
  const nodeCumDeltaHf = new Map();
  topoOrder.forEach(nodeId => {
    if (!parentEdge.has(nodeId)) {
      nodeCumDeltaHf.set(nodeId, 0);
    } else {
      const pe = parentEdge.get(nodeId);
      const parentDeltaH = nodeCumDeltaHf.get(pe.prevId) || 0;
      const edgeDeltaH = pipeDeltaHf.get(pe.pipeId) || 0;
      nodeCumDeltaHf.set(nodeId, parentDeltaH + edgeDeltaH);
    }
  });

  const updatedNodes = nodes.map(n => {
    if (n.type === 'reservoir') return n;
    const dHf = nodeCumDeltaHf.get(n.id) || 0;
    const dElev = (n.elevation || 0) - (n._originalElevation || 0);
    const newHeadloss = Math.max(0, Number(((n._originalHeadloss || 0) + dHf).toFixed(3)));
    const newPressure = Number(((n._originalPressure ?? 2.4) - (dHf + dElev) / 10.197).toFixed(3));
    return {
      ...n,
      headloss: newHeadloss,
      pressure: newPressure
    };
  });

  return {
    ...baseData,
    nodes: updatedNodes,
    pipes: updatedPipes
  };
}

/**
 * Recalculate all cascade measurements when node demands or elevations change
 */
export function recalculateAllCascades(networkData) {
  const all = getStoredMeasurements();
  const pipeMap = new Map((networkData?.pipes || []).map(p => [p.id, p]));

  // Hapus semua cascade lama terlebih dahulu
  Object.keys(all).forEach(key => {
    if (all[key]?.source === 'cascade') {
      delete all[key];
    }
  });

  // Hitung ulang cascade dari setiap pipa yang diukur langsung
  Object.keys(all).forEach(pipeId => {
    const meas = all[pipeId];
    if (!meas || meas.source !== 'measured') return;
    const pipe = pipeMap.get(pipeId);
    if (!pipe) return;

    const cascadeRes = calculatePipelineCascade(
      networkData,
      pipe,
      meas.actualFlow,
      meas.actualPressure
    );
    const cascadeList = cascadeRes?.downstreamPipes || [];
    cascadeList.forEach(c => {
      if (all[c.pipeId]?.source === 'measured') return;
      all[c.pipeId] = {
        actualFlow: c.actualFlow,
        actualPressure: c.actualPressure,
        actualVelocity: c.actualVelocity,
        actualHeadloss: c.actualHeadloss,
        source: 'cascade',
        parentPipeId: pipeId,
        parentPipeName: c.parentPipeName || `${pipeId.slice(0, 6)}`,
        sequence: c.sequence,
        method: 'Estimasi Hidrolis Jalur (EPANET HGL)',
        measuredAt: meas.measuredAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function getStoredMeasurements() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load measurements', e);
    return {};
  }
}

export function saveMeasurement(pipeId, data, cascadeList = []) {
  const all = getStoredMeasurements();

  // Bersihkan cascade lama yang bersumber dari pipa ini sebelumnya
  Object.keys(all).forEach(key => {
    if (all[key]?.source === 'cascade' && all[key]?.parentPipeId === pipeId) {
      delete all[key];
    }
  });

  // Simpan pengukuran utama
  all[pipeId] = {
    ...data,
    source: 'measured',
    updatedAt: new Date().toISOString()
  };

  // Simpan perambatan hidrolis ke pipa hilir di jalur yang sama
  if (Array.isArray(cascadeList) && cascadeList.length > 0) {
    cascadeList.forEach(c => {
      // Jangan timpa jika pipa tersebut sudah memiliki pengukuran lapangan langsung
      if (all[c.pipeId]?.source === 'measured') return;

      all[c.pipeId] = {
        actualFlow: c.actualFlow,
        actualPressure: c.actualPressure,
        actualVelocity: c.actualVelocity,
        actualHeadloss: c.actualHeadloss,
        source: 'cascade',
        parentPipeId: pipeId,
        parentPipeName: c.parentPipeName || `${pipeId.slice(0, 6)}`,
        sequence: c.sequence,
        method: 'Estimasi Hidrolis Jalur (EPANET HGL)',
        measuredAt: data.measuredAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function deleteMeasurement(pipeId) {
  const all = getStoredMeasurements();
  delete all[pipeId];

  // Bersihkan juga seluruh estimasi cascade turunan dari pipa ini
  Object.keys(all).forEach(key => {
    if (all[key]?.source === 'cascade' && all[key]?.parentPipeId === pipeId) {
      delete all[key];
    }
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function clearAllMeasurements() {
  localStorage.removeItem(STORAGE_KEY);
  return {};
}

/**
 * Generate demo/sample measurements for user demonstration
 */
export function generateDemoData(pipes, nodeMap) {
  const demo = {};
  if (!pipes || pipes.length === 0) return demo;

  // Pick first 15 pipes with various scenarios
  const selected = pipes.slice(0, 16);
  const now = new Date();

  selected.forEach((p, idx) => {
    const designFlow = Math.abs(p.flowRate || 8.5);
    let actualFlow = designFlow;
    let physicalCondition = 'Normal / Baik';
    let notes = 'Pengukuran debit rutin normal.';
    let surveyor = 'Budi Santoso (PDAM Tim 1)';

    if (idx === 0) {
      // Very close to design
      actualFlow = +(designFlow * 0.98).toFixed(2);
      notes = 'Aliran stabil, headloss sesuai model.';
    } else if (idx === 1) {
      // Leak alert
      actualFlow = +(designFlow * 0.52).toFixed(2);
      physicalCondition = 'Rembesan di Sambungan Tee';
      notes = 'Debit drop drastis! Terdeteksi rembesan basah di sekitar patok STA 0+320.';
      surveyor = 'Ahmad Fauzi (PDAM Tim 2)';
    } else if (idx === 2) {
      // Normal
      actualFlow = +(designFlow * 1.02).toFixed(2);
      notes = 'Kondisi pipa transmisi dalam keadaan prima.';
    } else if (idx === 3) {
      // High overflow
      actualFlow = +(designFlow * 1.35).toFixed(2);
      physicalCondition = 'Katup Gate Valve Terbuka Penuh';
      notes = 'Debit aktual melebihi estimasi desain, tekanan stabil.';
    } else if (idx === 4) {
      // Severe drop / leak
      actualFlow = +(designFlow * 0.40).toFixed(2);
      physicalCondition = 'Pipa Ambles / Tertekan';
      notes = 'Potensi sumbatan atau kebocoran bawah tanah pada sambungan crossing jalan.';
    } else if (idx === 5) {
      actualFlow = +(designFlow * 0.95).toFixed(2);
      notes = 'Hasil clamp-on ultrasonic meter akurat.';
    } else if (idx === 6) {
      actualFlow = +(designFlow * 0.88).toFixed(2);
      physicalCondition = 'Sedikit Korosi Eksternal';
      notes = 'Deviasi -12%, perlu inspeksi katup pengatur.';
    } else {
      // Normal variations
      const factor = 0.92 + (idx % 5) * 0.03;
      actualFlow = +(designFlow * factor).toFixed(2);
      notes = 'Pemeriksaan lapangan berkala jalur distribusi.';
    }

    const timeOffset = idx * 45 * 60 * 1000;
    const inspectDate = new Date(now.getTime() - timeOffset).toISOString();

    demo[p.id] = {
      actualFlow,
      actualPressure: p.pressure ? +(p.pressure * 0.95).toFixed(2) : 2.4,
      method: 'Ultrasonic Flow Meter (Clamp-on)',
      surveyor,
      physicalCondition,
      notes,
      source: 'measured',
      measuredAt: inspectDate,
      updatedAt: inspectDate
    };
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
  return demo;
}

/**
 * Export measurements to CSV format
 */
export function exportToCSV(pipes, measurements, nodeMap) {
  const headers = [
    'Pipe ID',
    'Jalur (Dari -> Ke)',
    'Diameter (mm)',
    'Material',
    'Panjang (m)',
    'Debit Desain (L/s)',
    'Debit Aktual (L/s)',
    'Selisih Debit (L/s)',
    'Deviasi Debit (%)',
    'Tekanan Desain (bar)',
    'Tekanan Aktual (bar)',
    'Status',
    'Sumber Data',
    'Pipa Induk Jalur',
    'Waktu Pengukuran',
    'Metode'
  ];

  const rows = pipes.map(p => {
    const meas = measurements[p.id];
    const fromNode = nodeMap[p.startNodeId];
    const toNode = nodeMap[p.endNodeId];
    const fromLabel = fromNode?.label || p.startNodeId.slice(0, 6);
    const toLabel = toNode?.label || p.endNodeId.slice(0, 6);
    const design = Math.abs(p.flowRate || 0);

    const pFrom = fromNode?.pressure ?? null;
    const pTo = toNode?.pressure ?? null;
    const designPressure = pFrom !== null && pTo !== null ? (pFrom + pTo) / 2 : (pFrom ?? pTo ?? 2.4);

    if (!meas) {
      return [
        p.id,
        `"${fromLabel} -> ${toLabel}"`,
        p.diameter,
        p.material,
        p.length,
        design.toFixed(2),
        '',
        '',
        '',
        designPressure.toFixed(2),
        '',
        'Belum Diukur',
        'Belum Ada Data',
        '',
        '',
        ''
      ];
    }

    const actual = meas.actualFlow;
    const delta = actual - design;
    const pct = design > 0 ? (delta / design) * 100 : 0;
    let statusText = 'Sesuai';
    if (Math.abs(pct) > 25) {
      statusText = pct < 0 ? 'Anomali: Drop/Bocor' : 'Anomali: Debit Tinggi';
    } else if (Math.abs(pct) > 10) {
      statusText = 'Peringatan';
    }

    const sourceType = meas.source === 'cascade'
      ? 'Estimasi Jalur (Hilir)'
      : (meas.isEstimatedFlow ? 'Pengukuran Tekanan Lapangan (Estimasi Hidrolis)' : 'Pengukuran Lapangan Langsung');
    const parentInfo = meas.parentPipeName ? `"${meas.parentPipeName}"` : '';

    return [
      p.id,
      `"${fromLabel} -> ${toLabel}"`,
      p.diameter,
      p.material,
      p.length,
      design.toFixed(2),
      actual,
      delta.toFixed(2),
      pct.toFixed(2) + '%',
      designPressure.toFixed(2),
      meas.actualPressure !== undefined && meas.actualPressure !== null ? meas.actualPressure : '',
      statusText,
      `"${sourceType}"`,
      parentInfo,
      `"${meas.measuredAt || ''}"`,
      `"${meas.method || ''}"`
    ];
  });

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `monitoring_debit_subang_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
