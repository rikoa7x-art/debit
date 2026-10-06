// Local storage management for field measurements

const STORAGE_KEY = 'subang_water_pipe_measurements_v1';

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

    const sourceType = meas.source === 'cascade' ? 'Estimasi Jalur (Hilir)' : 'Pengukuran Lapangan Langsung';
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
