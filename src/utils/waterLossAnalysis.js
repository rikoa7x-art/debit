import {
  analyzeFlowStatus,
  calculateVelocity,
  analyzeVelocityStatus,
  analyzePressureStatus,
  calculateWaterBalance
} from './calculations.js';

/**
 * Format angka ke Rupiah
 * @param {number} amount
 * @returns {string}
 */
export function formatRupiah(amount) {
  return 'Rp ' + amount.toLocaleString('id-ID');
}

/**
 * Format volume m3
 * @param {number} m3
 * @returns {string}
 */
export function formatVolume(m3) {
  return m3.toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' m³';
}

/**
 * Menghitung IWA Water Balance
 * @param {Object} networkData
 * @param {Object} measurements
 * @returns {Object}
 */
export function calculateIWAWaterBalance(networkData, measurements) {
  let sivLps = 0;
  let sivSource = 'design';
  let hasMeasuredReservoirOutlet = false;

  const reservoirs = (networkData.nodes || []).filter(n => n.type === 'reservoir');
  const reservoirIds = new Set(reservoirs.map(r => r.id));

  // Find pipes connected to reservoir (outlet)
  const reservoirPipes = (networkData.pipes || []).filter(p => reservoirIds.has(p.startNodeId));

  let totalMeasuredSiv = 0;
  let totalDesignSiv = 0;
  
  reservoirPipes.forEach(p => {
    const meas = measurements[p.id];
    if (meas && meas.actualFlow !== undefined && meas.actualFlow !== null && !isNaN(Number(meas.actualFlow))) {
      totalMeasuredSiv += Number(meas.actualFlow);
      hasMeasuredReservoirOutlet = true;
    }
    totalDesignSiv += (p.flowRate || 0);
  });

  if (hasMeasuredReservoirOutlet) {
    sivLps = totalMeasuredSiv;
    sivSource = 'measured';
  } else {
    sivLps = totalDesignSiv;
  }

  // Fallback to 140.6 if 0
  if (sivLps === 0) sivLps = 140.6;

  // Authorized Consumption
  let authorizedLps = 0;
  let hasDemands = false;
  (networkData.nodes || []).forEach(n => {
    if (n.demand && n.demand > 0) {
      authorizedLps += n.demand;
      hasDemands = true;
    }
  });

  if (!hasDemands) {
    authorizedLps = sivLps * 0.75;
  }

  const waterLossLps = Math.max(0, sivLps - authorizedLps);
  const nrwPercent = sivLps > 0 ? (waterLossLps / sivLps) * 100 : 0;

  const realLossLps = waterLossLps * 0.70;
  const apparentLossLps = waterLossLps * 0.30;

  const toM3Day = (lps) => lps * 86.4;
  const toM3Month = (lps) => lps * 86.4 * 30;

  return {
    sivLps,
    sivM3Day: toM3Day(sivLps),
    sivM3Month: toM3Month(sivLps),
    authorizedLps,
    authorizedM3Day: toM3Day(authorizedLps),
    authorizedM3Month: toM3Month(authorizedLps),
    waterLossLps,
    waterLossM3Day: toM3Day(waterLossLps),
    waterLossM3Month: toM3Month(waterLossLps),
    realLossLps,
    realLossM3Day: toM3Day(realLossLps),
    realLossM3Month: toM3Month(realLossLps),
    apparentLossLps,
    apparentLossM3Day: toM3Day(apparentLossLps),
    apparentLossM3Month: toM3Month(apparentLossLps),
    nrwPercent,
    sivSource
  };
}

/**
 * Auto-partition jaringan pipa ke zona DMA
 * @param {Object} networkData 
 * @returns {Object}
 */
export function assignDMAZones(networkData) {
  const pipes = networkData.pipes || [];
  const nodes = networkData.nodes || [];
  const reservoirs = nodes.filter(n => n.type === 'reservoir');
  
  // Create adjacency list for BFS
  const adj = {};
  pipes.forEach(p => {
    if (!adj[p.startNodeId]) adj[p.startNodeId] = [];
    adj[p.startNodeId].push(p);
  });

  const pipeToZone = {};
  const zoneMap = {};

  reservoirs.forEach((res, index) => {
    const resLabel = res.label || `R${index + 1}`;
    const queue = [res.id];
    const visitedNodes = new Set([res.id]);

    while (queue.length > 0) {
      const curr = queue.shift();
      const connectedPipes = adj[curr] || [];

      connectedPipes.forEach(pipe => {
        if (!pipeToZone[pipe.id]) {
          const type = pipe.diameter >= 200 ? 'transmisi' : 'distribusi';
          const typeLabel = type === 'transmisi' ? 'Transmisi' : 'Distribusi';
          const zoneId = `DMA-${resLabel}-${type === 'transmisi' ? 'T' : 'D'}`;
          
          pipeToZone[pipe.id] = zoneId;
          
          if (!zoneMap[zoneId]) {
            zoneMap[zoneId] = {
              id: zoneId,
              label: `DMA ${resLabel} — ${typeLabel}`,
              reservoirLabel: resLabel,
              type,
              pipeIds: [],
              totalLength: 0,
              totalPipes: 0
            };
          }
          
          zoneMap[zoneId].pipeIds.push(pipe.id);
          zoneMap[zoneId].totalLength += (pipe.length || 0);
          zoneMap[zoneId].totalPipes += 1;

          if (!visitedNodes.has(pipe.endNodeId)) {
            visitedNodes.add(pipe.endNodeId);
            queue.push(pipe.endNodeId);
          }
        }
      });
    }
  });

  // Assign any unreachable/unassigned pipes to a default zone
  pipes.forEach(pipe => {
    if (!pipeToZone[pipe.id]) {
      const type = pipe.diameter >= 200 ? 'transmisi' : 'distribusi';
      const typeLabel = type === 'transmisi' ? 'Transmisi' : 'Distribusi';
      const zoneId = `DMA-Unknown-${type === 'transmisi' ? 'T' : 'D'}`;
      
      pipeToZone[pipe.id] = zoneId;
      if (!zoneMap[zoneId]) {
        zoneMap[zoneId] = {
          id: zoneId,
          label: `DMA Unknown — ${typeLabel}`,
          reservoirLabel: 'Unknown',
          type,
          pipeIds: [],
          totalLength: 0,
          totalPipes: 0
        };
      }
      zoneMap[zoneId].pipeIds.push(pipe.id);
      zoneMap[zoneId].totalLength += (pipe.length || 0);
      zoneMap[zoneId].totalPipes += 1;
    }
  });

  return {
    zones: Object.values(zoneMap),
    pipeToZone
  };
}

/**
 * Menghitung neraca per zona DMA (Total Inflow - Total Konsumsi)
 * @param {Object} networkData 
 * @param {Object} measurements 
 * @param {Object} dmaResult 
 * @returns {Array}
 */
export function calculateDMABalance(networkData, measurements, dmaResult) {
  const pipesMap = new Map((networkData.pipes || []).map(p => [p.id, p]));
  const nodesMap = new Map((networkData.nodes || []).map(n => [n.id, n]));
  
  // Bangun adjacency list (incoming) untuk mendeteksi pipa inlet zona
  const inAdj = new Map();
  (networkData.pipes || []).forEach(p => {
    if (!inAdj.has(p.endNodeId)) inAdj.set(p.endNodeId, []);
    inAdj.get(p.endNodeId).push(p);
  });

  return dmaResult.zones.map(zone => {
    const zonePipeIds = new Set(zone.pipeIds);
    const zoneNodes = new Set();
    let measuredCount = 0;
    
    const inletPipes = [];

    // 1. Identifikasi Node di dalam Zona dan Pipa Inlet
    zone.pipeIds.forEach(pid => {
      const pipe = pipesMap.get(pid);
      if (pipe) {
        zoneNodes.add(pipe.startNodeId);
        zoneNodes.add(pipe.endNodeId);
        
        // Pipa Inlet = Pipa yang startNode-nya tidak menerima air dari pipa lain di zona yang sama
        const incoming = inAdj.get(pipe.startNodeId) || [];
        const hasIncomingFromSameZone = incoming.some(incPipe => zonePipeIds.has(incPipe.id));
        if (!hasIncomingFromSameZone) {
          inletPipes.push(pipe);
        }
      }
      
      const meas = measurements[pid];
      if (meas && meas.actualFlow !== undefined && meas.actualFlow !== null && !isNaN(Number(meas.actualFlow))) {
        measuredCount++;
      }
    });

    // 2. Hitung Total Konsumsi Warga (Demand) di dalam Zona
    let totalZoneDemand = 0;
    zoneNodes.forEach(nodeId => {
      const node = nodesMap.get(nodeId);
      if (node && node.demand > 0) {
        totalZoneDemand += node.demand;
      }
    });

    // 3. Hitung Total Inflow ke Zona
    let totalDesignInflow = 0;
    let totalActualInflow = 0;
    
    inletPipes.forEach(pipe => {
      totalDesignInflow += (pipe.flowRate || 0);
      const meas = measurements[pipe.id];
      if (meas && meas.actualFlow !== undefined && meas.actualFlow !== null && !isNaN(Number(meas.actualFlow))) {
        totalActualInflow += Number(meas.actualFlow);
      } else {
        // Fallback jika inlet tidak diukur: asumsikan sesuai desain agar balance tidak rusak
        totalActualInflow += (pipe.flowRate || 0); 
      }
    });

    // 4. Hitung Kehilangan Air (Water Loss)
    // Jika tidak ada data demand sama sekali, asumsikan demand = 75% dari Inflow (standar awal/fallback)
    if (totalZoneDemand === 0) {
      totalZoneDemand = totalActualInflow * 0.75;
    }

    const lossLps = Math.max(0, totalActualInflow - totalZoneDemand);
    const lossPercent = totalActualInflow > 0 ? (lossLps / totalActualInflow) * 100 : 0;
    
    const unmeasuredCount = zone.totalPipes - measuredCount;
    const coveragePercent = zone.totalPipes > 0 ? (measuredCount / zone.totalPipes) * 100 : 0;

    let severity = 'normal';
    if (lossPercent > 25) severity = 'critical';
    else if (lossPercent > 15) severity = 'warning';

    return {
      zoneId: zone.id,
      zoneLabel: zone.label,
      totalDesignFlowLps: totalDesignInflow, 
      totalActualFlowLps: totalActualInflow,
      totalDemandLps: totalZoneDemand,
      lossLps,
      lossPercent,
      measuredCount,
      unmeasuredCount,
      totalPipes: zone.totalPipes,
      coveragePercent,
      severity
    };
  });
}

/**
 * Menghitung skor risiko kebocoran pipa
 * @param {Object} pipe 
 * @param {Object} measurement 
 * @param {Object} nodeMap 
 * @returns {Object}
 */
export function calculateLeakRiskScore(pipe, measurement, nodeMap) {
  let flowDeviationScore = 30; 
  if (measurement && measurement.actualFlow !== undefined && measurement.actualFlow !== null && !isNaN(Number(measurement.actualFlow))) {
    const flowStatus = analyzeFlowStatus(pipe.flowRate || 0, measurement.actualFlow);
    flowDeviationScore = Math.min(100, Math.abs(flowStatus.percentDeviation) * 2);
  }

  let materialRiskScore = 40;
  const mat = (pipe.material || '').toLowerCase();
  if (mat.includes('pvc')) materialRiskScore = 30;
  else if (mat.includes('hdpe')) materialRiskScore = 20;
  else if (mat.includes('dci')) materialRiskScore = 50;
  else if (mat.includes('steel')) materialRiskScore = 60;
  else if (mat.includes('ac') || mat.includes('asbestos')) materialRiskScore = 80;

  let pressureStressScore = 20;
  if (measurement && measurement.actualPressure !== undefined && measurement.actualPressure !== null && !isNaN(Number(measurement.actualPressure))) {
    const p = Number(measurement.actualPressure);
    if (p > 6) pressureStressScore = 100;
    else if (p > 4) pressureStressScore = 70;
    else if (p < 0.7) pressureStressScore = 60;
  }

  let velocityStressScore = 10;
  let vel = pipe.velocity || 0;
  if (measurement && measurement.actualVelocity !== undefined) {
    vel = measurement.actualVelocity;
  } else if (measurement && measurement.actualFlow !== undefined) {
    vel = calculateVelocity(measurement.actualFlow, pipe.diameter || 100);
  }
  
  if (vel > 2.0) velocityStressScore = 80;
  else if (vel > 0 && vel < 0.3) velocityStressScore = 50;

  const lengthRiskScore = Math.min(100, ((pipe.length || 0) / 500) * 100);

  const totalScore = Math.min(100, Math.max(0, 
    (flowDeviationScore * 0.35) + 
    (materialRiskScore * 0.20) + 
    (pressureStressScore * 0.15) + 
    (velocityStressScore * 0.15) + 
    (lengthRiskScore * 0.15)
  ));

  let grade = 'A';
  let recommendation = 'Kondisi prima. Lanjutkan pemantauan rutin.';
  if (totalScore > 80) { grade = 'F'; recommendation = 'KRITIS! Tindakan perbaikan mendesak diperlukan.'; }
  else if (totalScore > 60) { grade = 'D'; recommendation = 'Risiko tinggi! Segera lakukan investigasi kebocoran.'; }
  else if (totalScore > 40) { grade = 'C'; recommendation = 'Perlu perhatian. Prioritaskan inspeksi visual segmen ini.'; }
  else if (totalScore > 20) { grade = 'B'; recommendation = 'Kondisi baik. Jadwalkan inspeksi berkala.'; }

  return {
    totalScore,
    grade,
    factors: {
      flowDeviation: flowDeviationScore,
      materialRisk: materialRiskScore,
      pressureStress: pressureStressScore,
      velocityStress: velocityStressScore,
      lengthRisk: lengthRiskScore
    },
    recommendation
  };
}

/**
 * Menghitung kerugian finansial akibat kehilangan air
 * @param {number} lossLps 
 * @param {number} tariffPerM3 
 * @returns {Object}
 */
export function calculateFinancialLoss(lossLps, tariffPerM3 = 5000) {
  const lossM3Day = lossLps * 86.4;
  const lossM3Month = lossM3Day * 30;
  const lossM3Year = lossM3Day * 365;

  return {
    lossM3Day,
    lossM3Month,
    lossM3Year,
    lossRpDay: lossM3Day * tariffPerM3,
    lossRpMonth: lossM3Month * tariffPerM3,
    lossRpYear: lossM3Year * tariffPerM3,
    tariffPerM3
  };
}

/**
 * Generate laporan lengkap NRW
 * @param {Object} networkData 
 * @param {Object} measurements 
 * @returns {Object}
 */
export function generateNRWReport(networkData, measurements) {
  const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));
  const iwaBalance = calculateIWAWaterBalance(networkData, measurements);
  const dmaResult = assignDMAZones(networkData);
  const dmaBalances = calculateDMABalance(networkData, measurements, dmaResult);
  const financialImpact = calculateFinancialLoss(iwaBalance.waterLossLps);
  const corridorAlerts = calculateWaterBalance(networkData.pipes || [], measurements, nodeMap);

  let totalScoreSum = 0;
  let pipesAtRisk = 0;
  const leakRiskScores = (networkData.pipes || []).map(pipe => {
    const meas = measurements[pipe.id] || {};
    const startNode = nodeMap.get(pipe.startNodeId);
    const endNode = nodeMap.get(pipe.endNodeId);
    const pipeExtended = {
      ...pipe,
      _fromLabel: startNode ? (startNode.label || startNode.id) : pipe.startNodeId,
      _toLabel: endNode ? (endNode.label || endNode.id) : pipe.endNodeId,
    };
    
    const risk = calculateLeakRiskScore(pipe, meas, nodeMap);
    
    totalScoreSum += risk.totalScore;
    if (risk.totalScore > 60) pipesAtRisk++;

    return {
      pipeId: pipe.id,
      pipe: pipeExtended,
      ...risk
    };
  });

  const topRiskPipes = [...leakRiskScores].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
  const totalPipes = (networkData.pipes || []).length;
  const totalLength = (networkData.pipes || []).reduce((sum, p) => sum + (p.length || 0), 0);
  const totalMeasured = Object.keys(measurements).length;

  return {
    iwaBalance,
    dmaResult,
    dmaBalances,
    financialImpact,
    corridorAlerts,
    leakRiskScores,
    topRiskPipes,
    networkStats: {
      totalPipes,
      totalLength,
      totalMeasured,
      avgRiskScore: totalPipes > 0 ? (totalScoreSum / totalPipes) : 0,
      pipesAtRisk
    }
  };
}
