// Utility calculations for hydraulic monitoring and GIS

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
 * Status and deviation analysis
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
  const percentDeviation = design > 0 ? (delta / design) * 100 : 0;
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
