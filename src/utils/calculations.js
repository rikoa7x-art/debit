// Utility calculations for hydraulic monitoring and GIS according to SNI 7509:2011 & EPANET standards

/**
 * Calculate distance between two coordinates using Haversine formula (meters)
 */
export function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radius of earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg) {
  return deg * (Math.PI / 180);
}

/**
 * Calculate minimum distance from a point [lat, lng] to a polyline [[lat, lng], ...] in meters
 */
export function getDistanceToPolyline(point, polylineCoords) {
  if (!polylineCoords || polylineCoords.length === 0) return Infinity;
  let minDistance = Infinity;

  for (let i = 0; i < polylineCoords.length - 1; i++) {
    const p1 = polylineCoords[i];
    const p2 = polylineCoords[i + 1];
    const dist = getDistanceToSegment(point[0], point[1], p1[0], p1[1], p2[0], p2[1]);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

function getDistanceToSegment(lat, lng, lat1, lng1, lat2, lng2) {
  // Approximate flat projection for short distances (accurate within Subang area)
  const x = lng;
  const y = lat;
  const x1 = lng1;
  const y1 = lat1;
  const x2 = lng2;
  const y2 = lat2;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;
  if (len_sq !== 0) param = dot / len_sq;

  let xx, yy;
  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  return getDistanceFromLatLonInMeters(lat, lng, yy, xx);
}

/**
 * Status and deviation analysis for pipe flow rate (Q)
 * Handles edge cases for zero design flow (dead-ends/washouts/boundaries)
 */
export function analyzeFlowStatus(designFlow, actualFlow) {
  if (actualFlow === null || actualFlow === undefined || actualFlow === '') {
    return {
      status: 'unmeasured',
      label: 'Belum Diukur',
      badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      color: '#38bdf8', // sky blue
      percentDeviation: 0,
      delta: 0,
      description: 'Belum ada data pengukuran debit lapangan.'
    };
  }

  const actual = parseFloat(actualFlow);
  const design = Math.abs(parseFloat(designFlow) || 0);

  if (isNaN(actual)) {
    return {
      status: 'unmeasured',
      label: 'Belum Diukur',
      badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      color: '#38bdf8',
      percentDeviation: 0,
      delta: 0,
      description: 'Format data belum valid.'
    };
  }

  const delta = actual - design;

  // Edge case: Pipa ujung / mati / batas yang dalam desain Q = 0 L/s
  if (design < 0.1) {
    if (actual > 0.5) {
      return {
        status: 'leak_alert',
        label: 'Anomali: Aliran Liar (Pipa Tertutup)',
        badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        color: '#ef4444',
        percentDeviation: 100,
        delta,
        description: `Terdeteksi aliran ${actual.toFixed(2)} L/s pada segmen pipa mati/tertutup (desain ≈ 0 L/s). Periksa kebocoran katup batas!`
      };
    }
    return {
      status: 'match',
      label: 'Sesuai (Pipa Tertutup)',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      color: '#10b981',
      percentDeviation: 0,
      delta,
      description: 'Pipa tertutup sesuai desain rencana (Q ≈ 0 L/s).'
    };
  }

  const percentDeviation = (delta / design) * 100;
  const absDev = Math.abs(percentDeviation);

  if (absDev <= 10) {
    return {
      status: 'match',
      label: 'Sesuai (Normal)',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      color: '#10b981', // green
      percentDeviation,
      delta,
      description: `Debit lapangan sesuai toleransi desain (deviasi ${percentDeviation >= 0 ? '+' : ''}${percentDeviation.toFixed(1)}%).`
    };
  } else if (absDev <= 25) {
    return {
      status: 'warning',
      label: 'Peringatan (Deviasi)',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      color: '#f59e0b', // amber
      percentDeviation,
      delta,
      description: `Deviasi debit ${percentDeviation >= 0 ? '+' : ''}${percentDeviation.toFixed(1)}% memerlukan observasi lanjutan.`
    };
  } else if (percentDeviation < -25) {
    return {
      status: 'leak_alert',
      label: 'Anomali: Drop/Bocor',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      color: '#ef4444', // red
      percentDeviation,
      delta,
      description: `Debit lapangan turun drastis ${percentDeviation.toFixed(1)}% (Δ ${delta.toFixed(2)} L/s). Waspadai kebocoran pipa atau hambatan sedimen!`
    };
  } else {
    return {
      status: 'overflow_alert',
      label: 'Anomali: Debit Tinggi',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      color: '#c084fc', // purple
      percentDeviation,
      delta,
      description: `Debit lapangan melonjak +${percentDeviation.toFixed(1)}% di atas desain. Periksa kalibrasi meter atau lonjakan konsumsi/pompa.`
    };
  }
}

/**
 * Hitung Kecepatan Aliran (v) berdasarkan Persamaan Kontinuitas Fluida:
 * v = Q / A = (4000 * Q_lps) / (π * D_mm²) dalam satuan m/detik
 */
export function calculateVelocity(flowLps, diameterMm) {
  if (flowLps === null || flowLps === undefined || !diameterMm) return 0;
  const q = Math.abs(parseFloat(flowLps));
  const d = parseFloat(diameterMm);
  if (isNaN(q) || isNaN(d) || d <= 0) return 0;
  return (4000 * q) / (Math.PI * d * d);
}

/**
 * Analisa Status Kecepatan Aliran (v) berdasarkan Standar SNI 7509:2011:
 * - v < 0.3 m/s: Kritis Rendah (Risiko sedimentasi dan penurunan mutu air)
 * - 0.3 <= v <= 2.0 m/s: Optimal Operasional Jaringan Pipa Distribusi
 * - v > 2.0 m/s: Kritis Tinggi (Headloss gesekan tinggi & risiko Water Hammer)
 */
export function analyzeVelocityStatus(velocity) {
  if (velocity === null || velocity === undefined || isNaN(velocity)) {
    return {
      status: 'unknown',
      label: 'Belum Dihitung',
      badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      color: '#94a3b8',
      description: 'Kecepatan belum dapat dihitung.'
    };
  }

  const v = Math.abs(parseFloat(velocity));

  if (v < 0.3) {
    return {
      status: 'sediment_risk',
      label: 'Risiko Endapan (< 0.3 m/s)',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      color: '#f59e0b',
      velocity: v,
      description: `Kecepatan ${v.toFixed(2)} m/s di bawah 0.3 m/s. Berisiko terjadi pengendapan lumpur/sedimen dan penurunan sisa klor.`
    };
  } else if (v <= 2.0) {
    return {
      status: 'optimal',
      label: 'Kecepatan Optimal (SNI)',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      color: '#10b981',
      velocity: v,
      description: `Kecepatan ${v.toFixed(2)} m/s berada dalam rentang ideal standar SNI 7509:2011 (0.3 - 2.0 m/s).`
    };
  } else {
    return {
      status: 'hammer_risk',
      label: 'Kritis: Risiko Water Hammer (> 2.0 m/s)',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      color: '#ef4444',
      velocity: v,
      description: `Kecepatan ${v.toFixed(2)} m/s melebihi 2.0 m/s. Kehilangan tekanan akibat gesekan tinggi dan rentan pukulan air (water hammer).`
    };
  }
}

/**
 * Analisa Status Tekanan Air Lapangan (P) berdasarkan Standar Pelayanan Teknis PDAM / PU:
 * - P < 0.7 bar (7 mka): Sisa tekan minimum tidak terpenuhi (air tidak naik ke pelanggan)
 * - 0.7 <= P <= 6.0 bar: Tekanan kerja normal dan aman
 * - P > 6.0 bar: Overpressure (risiko pipa pecah / sambungan bocor)
 */
export function analyzePressureStatus(actualPressure, designPressure = 2.4) {
  if (actualPressure === null || actualPressure === undefined || actualPressure === '') {
    return {
      status: 'unmeasured',
      label: 'Belum Diukur',
      badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      color: '#38bdf8',
      description: 'Belum ada data pengukuran tekanan lapangan.'
    };
  }

  const p = parseFloat(actualPressure);
  if (isNaN(p)) {
    return {
      status: 'unmeasured',
      label: 'Format Tidak Valid',
      badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      color: '#38bdf8',
      description: 'Format data tekanan tidak valid.'
    };
  }

  const pDes = parseFloat(designPressure) || 2.4;
  const deltaP = p - pDes;
  const percentDeltaP = pDes > 0 ? (deltaP / pDes) * 100 : 0;

  if (p < 0.7) {
    return {
      status: 'low_pressure',
      label: 'Tekanan Rendah (< 0.7 bar)',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      color: '#f59e0b',
      pressure: p,
      deltaP,
      percentDeltaP,
      description: `Sisa tekan ${p.toFixed(2)} bar di bawah syarat batas minimum SNI (0.7 bar / 7 mka). Aliran ke pelanggan elevasi tinggi terancam berhenti.`
    };
  } else if (p <= 6.0) {
    return {
      status: 'optimal_pressure',
      label: 'Tekanan Normal (0.7 - 6.0 bar)',
      badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      color: '#10b981',
      pressure: p,
      deltaP,
      percentDeltaP,
      description: `Tekanan ${p.toFixed(2)} bar memenuhi rentang kerja aman dan stabil standar distribusi.`
    };
  } else {
    return {
      status: 'high_pressure',
      label: 'Overpressure (> 6.0 bar)',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      color: '#ef4444',
      pressure: p,
      deltaP,
      percentDeltaP,
      description: `Tekanan ${p.toFixed(2)} bar melebihi batas aman (6.0 bar / 60 mka). Risiko tinggi menyebabkan pecah pipa (pipe burst) atau rembesan sambungan.`
    };
  }
}

/**
 * Diagnosa Terpadu Hidrolika Rekayasa (Cross-Correlation Debit Q & Tekanan P):
 * Menggabungkan perilaku debit dan tekanan untuk menentukan diagnosa akar masalah di lapangan.
 */
export function analyzeHydraulicDiagnostics({
  designFlow,
  actualFlow,
  designPressure = 2.4,
  actualPressure,
  diameter = 150
}) {
  const flowAnalysis = analyzeFlowStatus(designFlow, actualFlow);
  const vActual = calculateVelocity(actualFlow, diameter);
  const velocityAnalysis = analyzeVelocityStatus(vActual);
  const pressureAnalysis = analyzePressureStatus(actualPressure, designPressure);

  if (flowAnalysis.status === 'unmeasured') {
    return {
      code: 'UNMEASURED',
      title: 'Menunggu Pengukuran Lapangan',
      severity: 'info',
      badgeClass: 'bg-slate-700/60 text-slate-300 border-slate-600',
      summary: 'Masukkan nilai debit aktual flowmeter untuk memulai diagnosa hidrolis.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  const hasP = actualPressure !== null && actualPressure !== undefined && actualPressure !== '' && !isNaN(parseFloat(actualPressure));
  const pAct = hasP ? parseFloat(actualPressure) : null;
  const pDes = parseFloat(designPressure) || 2.4;

  const qPct = flowAnalysis.percentDeviation;
  const pPct = hasP && pDes > 0 ? ((pAct - pDes) / pDes) * 100 : 0;

  // Skenario 1: Pipa Pecah / Kebocoran Masif di Hilir (Debit Melonjak + Tekanan Drop)
  if (qPct > 15 && hasP && (pPct < -15 || pAct < 0.7)) {
    return {
      code: 'PIPE_BURST',
      title: 'Kritis: Indikasi Pipa Pecah (Pipe Burst) Hilir',
      severity: 'critical',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      summary: `Debit melonjak +${qPct.toFixed(1)}% disertai penurunan tekanan ${pAct.toFixed(2)} bar (${pPct.toFixed(1)}%). Ini karakteristik utama kebocoran masif di sisi hilir pipa!`,
      action: 'Lakukan patroli visual segera di sepanjang jalur hilir pipa ini untuk menemukan semburan air atau tanah basah.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 2: Hambatan / Gate Valve Tercekik / Tersumbat (Debit Drop + Tekanan Naik / Normal Tinggi)
  if (qPct < -20 && hasP && pPct > 10) {
    return {
      code: 'CLOGGING_OR_THROTTLE',
      title: 'Peringatan: Hambatan Aliran / Katup Tercekik',
      severity: 'warning',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      summary: `Debit drop ${qPct.toFixed(1)}% namun tekanan justru naik menjadi ${pAct.toFixed(2)} bar (+${pPct.toFixed(1)}%). Menandakan efek backpressure akibat katup hilir tertutup sebagian atau sumbatan fisik.`,
      action: 'Periksa gate valve / check valve terdekat dan periksa potensi penyumbatan kerak/sedimen pipa.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 3: Penurunan Pasokan Hulu / Pompa Drop (Debit Drop + Tekanan Drop)
  if (qPct < -20 && hasP && pPct < -15) {
    return {
      code: 'SUPPLY_DEFICIT',
      title: 'Peringatan: Gangguan Pasokan Hulu',
      severity: 'warning',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      summary: `Debit (${qPct.toFixed(1)}%) dan tekanan (${pPct.toFixed(1)}%) keduanya mengalami penurunan serempak. Indikasi pasokan dari reservoir/pompa hulu berkurang.`,
      action: 'Verifikasi level air reservoir pasokan utama atau kinerja pompa transmisi.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 4: Overpressure Bahaya
  if (hasP && pAct > 6.0) {
    return {
      code: 'OVERPRESSURE',
      title: 'Bahaya: Tekanan Melebihi Batas Aman (Overpressure)',
      severity: 'critical',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      summary: `Tekanan ${pAct.toFixed(2)} bar melebihi batas 6.0 bar. Rentan memicu pecah sambungan pipa.`,
      action: 'Pertimbangkan penyetelan PRV (Pressure Reducing Valve) pada zona hulu ini.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 5: Kecepatan Aliran Terlalu Cepat (Water Hammer)
  if (velocityAnalysis.status === 'hammer_risk') {
    return {
      code: 'WATER_HAMMER_RISK',
      title: 'Risiko Water Hammer / Turbulensi Tinggi',
      severity: 'critical',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      summary: `Kecepatan aktual mencapai ${vActual.toFixed(2)} m/s (> 2.0 m/s). Headloss gesekan tinggi dan risiko pukulan air saat penutupan katup.`,
      action: 'Hindari manuver penutupan katup secara mendadak pada segmen ini.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 6: Aliran Drop Saja (Tanpa Data Tekanan Lengkap)
  if (flowAnalysis.status === 'leak_alert') {
    return {
      code: 'FLOW_LEAK',
      title: 'Anomali: Penurunan Debit Signifikan',
      severity: 'critical',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      summary: flowAnalysis.description,
      action: 'Lakukan pengukuran tekanan (manometer) di titik ini untuk memastikan apakah kebocoran atau hambatan katup.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 7: Debit Melonjak Saja
  if (flowAnalysis.status === 'overflow_alert') {
    return {
      code: 'OVERFLOW',
      title: 'Anomali: Debit Lapangan Melampaui Desain',
      severity: 'warning',
      badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      summary: flowAnalysis.description,
      action: 'Periksa kalibrasi transducer flowmeter atau kenaikan permintaan air di blok hilir.',
      flowAnalysis,
      velocityAnalysis,
      pressureAnalysis,
      vActual
    };
  }

  // Skenario 8: Normal Sesuai Kaidah Hidrolika
  return {
    code: 'NORMAL_OPERATION',
    title: 'Operasi Hidrolis Normal & Stabil',
    severity: 'normal',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    summary: 'Debit, kecepatan aliran, dan sisa tekan berada dalam toleransi standar teknis PDAM.',
    action: 'Kondisi pipa prima. Pertahankan pemantauan berkala.',
    flowAnalysis,
    velocityAnalysis,
    pressureAnalysis,
    vActual
  };
}

export function formatFlow(val) {
  if (val === null || val === undefined) return '-';
  const num = parseFloat(val);
  return isNaN(num) ? '-' : num.toFixed(2) + ' L/s';
}

export function formatDateTime(isoString) {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return isoString;
  }
}
