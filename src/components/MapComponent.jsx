import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import {
  Layers,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Compass,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Gauge,
  Droplets,
  Hash
} from 'lucide-react';
import { analyzeFlowStatus, evaluatePipeFlowCapability, getDistanceToPolyline } from '../utils/calculations';

export default function MapComponent({
  networkData,
  measurements,
  selectedPipe,
  onSelectPipe,
  onSelectNode,
  userLocation,
  setUserLocation
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const pipesLayerRef = useRef(null);
  const nodesLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);

  const [mapType, setMapType] = useState('osm'); // 'osm' or 'satellite'
  const [showNumbers, setShowNumbers] = useState(false); // Toggle angka Q & P di peta
  const [showLegend, setShowLegend] = useState(false);
  const [nearestPipe, setNearestPipe] = useState(null);
  const [isLocating, setIsLocating] = useState(false);

  // Network Telemetry Summary for HUD
  const telemetry = useMemo(() => {
    if (!networkData?.pipes) {
      return {
        mainSupplyQ: 0,
        actualMainSupplyQ: 0,
        hasActualSupply: false,
        totalDesignQ: 0,
        totalActualQ: 0,
        avgPressure: 0,
        measuredCount: 0,
        avgActualPressure: 0,
        measuredPressureCount: 0
      };
    }

    const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));
    const resNodeIds = new Set(
      (networkData.nodes || []).filter(n => n.type === 'reservoir').map(n => n.id)
    );

    let mainSupplyQ = 0;
    let actualMainSupplyQ = 0;
    let hasActualSupply = false;

    let totalDesignQ = 0;
    let totalActualQ = 0;
    let measuredCount = 0;
    let totalPressure = 0;
    let pressureCount = 0;
    let totalActualPressure = 0;
    let measuredPressureCount = 0;

    (networkData.nodes || []).forEach(n => {
      if (typeof n.pressure === 'number') {
        totalPressure += n.pressure;
        pressureCount++;
      }
    });

    (networkData.pipes || []).forEach(pipe => {
      const designQ = Math.abs(pipe.flowRate || 0);
      totalDesignQ += designQ;

      // Pipa keluaran Reservoir R1 & R2 (Pasokan Utama Jaringan Subang ADB: 140.6 L/s)
      const isSupplyPipe = resNodeIds.has(pipe.startNodeId) || resNodeIds.has(pipe.endNodeId);
      if (isSupplyPipe) {
        mainSupplyQ += designQ;
      }

      const meas = measurements[pipe.id];
      if (meas && meas.actualFlow !== undefined) {
        totalActualQ += Number(meas.actualFlow);
        measuredCount++;
        if (isSupplyPipe) {
          actualMainSupplyQ += Number(meas.actualFlow);
          hasActualSupply = true;
        }
      } else if (isSupplyPipe) {
        actualMainSupplyQ += designQ;
      }

      if (meas && meas.actualPressure !== undefined && meas.actualPressure !== null && !isNaN(meas.actualPressure)) {
        totalActualPressure += Number(meas.actualPressure);
        measuredPressureCount++;
      }
    });

    return {
      mainSupplyQ,
      actualMainSupplyQ,
      hasActualSupply,
      totalDesignQ,
      totalActualQ,
      avgPressure: pressureCount > 0 ? totalPressure / pressureCount : 2.4,
      measuredCount,
      avgActualPressure: measuredPressureCount > 0 ? totalActualPressure / measuredPressureCount : 0,
      measuredPressureCount
    };
  }, [networkData, measurements]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Subang center
    const defaultCenter = [-6.5581, 107.8065];
    const map = L.map(mapContainerRef.current, {
      center: defaultCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      tap: false,          // Mencegah ghost-tap / double-tap di Android Chrome
    });

    mapInstanceRef.current = map;

    // Tile Layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    });

    const satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19 }
    );

    osmLayer.addTo(map);
    map._osmLayer = osmLayer;
    map._satLayer = satelliteLayer;

    // Tambahkan class CSS otomatis berdasarkan zoom level untuk menyembunyikan label kecil saat zoom out
    const updateZoomClass = () => {
      const currentZoom = map.getZoom();
      if (currentZoom < 15) {
        map.getContainer().classList.add('hide-minor-labels');
      } else {
        map.getContainer().classList.remove('hide-minor-labels');
      }
    };
    
    map.on('zoomend', updateZoomClass);
    // Panggil sekali saat inisialisasi
    updateZoomClass();

    // Initial fit bounds if pipes exist
    if (networkData?.pipes && networkData.pipes.length > 0) {
      const allCoords = [];
      networkData.pipes.forEach(p => {
        if (p.routeCoordinates) {
          p.routeCoordinates.forEach(c => allCoords.push(c));
        }
      });
      if (allCoords.length > 0) {
        const bounds = L.latLngBounds(allCoords);
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    }

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [networkData]);

  // Handle Layer Toggle
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !map._osmLayer || !map._satLayer) return;

    if (mapType === 'satellite') {
      map.removeLayer(map._osmLayer);
      map._satLayer.addTo(map);
    } else {
      map.removeLayer(map._satLayer);
      map._osmLayer.addTo(map);
    }
  }, [mapType]);

  // Render Pipes, Nodes, and Numeric Labels
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !networkData) return;

    // Clear existing layers
    if (pipesLayerRef.current) map.removeLayer(pipesLayerRef.current);
    if (nodesLayerRef.current) map.removeLayer(nodesLayerRef.current);
    if (labelsLayerRef.current) map.removeLayer(labelsLayerRef.current);

    const pipesGroup = L.layerGroup();
    const nodesGroup = L.layerGroup();
    const labelsGroup = L.layerGroup();

    const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));

    // Render Pipes & Numeric Badges
    (networkData.pipes || []).forEach(pipe => {
      if (!pipe.routeCoordinates || pipe.routeCoordinates.length === 0) return;

      const meas = measurements[pipe.id];
      const isSelected = selectedPipe && selectedPipe.id === pipe.id;

      const fromNode = nodeMap.get(pipe.startNodeId);
      const toNode = nodeMap.get(pipe.endNodeId);
      const pipeLabel = `${fromNode?.label || 'J'} → ${toNode?.label || 'J'}`;

      const pFrom = fromNode?.pressure ?? null;
      const pTo = toNode?.pressure ?? null;
      const designPressure = pFrom !== null && pTo !== null ? (pFrom + pTo) / 2 : (pFrom ?? pTo ?? 2.4);

      // Evaluasi kemampuan pipa mengalirkan debit sesuai demand (Biru vs Merah + Animasi Laju Air)
      const flowCap = evaluatePipeFlowCapability(pipe, fromNode, toNode, meas);
      const pipeColor = flowCap.color; // #0ea5e9 (Biru) jika sanggup, #ef4444 (Merah) jika tidak sanggup
      const statusLabel = flowCap.statusLabel;

      // Line width based on diameter (50mm to 400mm)
      const baseWeight = Math.max(3.5, Math.min(8.5, (pipe.diameter / 55)));
      const weight = isSelected ? baseWeight + 4 : baseWeight;

      // 1. Garis dasar pipa (Biru jika sanggup mengalirkan demand, Merah jika tidak sanggup)
      const polyline = L.polyline(pipe.routeCoordinates, {
        color: isSelected ? '#ffffff' : pipeColor,
        weight: weight,
        opacity: isSelected ? 1 : 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      });

      // Tooltip
      const designFlow = flowCap.requiredFlow.toFixed(2);
      const hasActualQ = meas && meas.actualFlow !== null && meas.actualFlow !== undefined && !isNaN(Number(meas.actualFlow));
      const actualFlow = hasActualQ
        ? (meas.isEstimatedFlow ? `~${Number(meas.actualFlow).toFixed(2)} L/s (est)` : `${Number(meas.actualFlow).toFixed(2)} L/s`)
        : `${flowCap.effectiveFlow.toFixed(2)} L/s`;
      
      const pAktualStr = (meas && meas.actualPressure !== undefined && meas.actualPressure !== null && !isNaN(Number(meas.actualPressure)))
        ? `${Number(meas.actualPressure).toFixed(2)} bar`
        : `${flowCap.endPressure.toFixed(2)} bar`;

      const tooltipContent = `
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">
          ${pipeLabel} (Ø${pipe.diameter}mm - ${pipe.material})
        </div>
        <div style="font-size: 11px; color: #94a3b8;">
          Q Demand: <span style="color:#38bdf8">${designFlow} L/s</span> | Mengalir: <span style="color:${pipeColor};font-weight:bold;">${actualFlow}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 1px;">
          Tekanan Hilir: <span style="color:#fbbf24">${pAktualStr}</span> | Laju (v): <span style="color:#e2e8f0">${flowCap.velocity.toFixed(2)} m/s</span>
        </div>
        <div style="font-size: 10px; margin-top: 2px; color: ${pipeColor}; font-weight: bold;">
          ● ${statusLabel}
        </div>
      `;
      polyline.bindTooltip(tooltipContent, {
        className: 'pipe-tooltip-custom',
        sticky: true
      });

      const handlePipeClick = () => {
        onSelectPipe({
          ...pipe,
          _fromLabel: fromNode?.label,
          _toLabel: toNode?.label,
          _designPressure: designPressure
        });
      };

      polyline.on('click', handlePipeClick);
      pipesGroup.addLayer(polyline);

      // 2. Animasi gerakan laju air di atas garis pipa (searah aliran hulu -> hilir)
      if (flowCap.hasFlowAnimation) {
        const flowCoords = flowCap.isReverseFlow
          ? [...pipe.routeCoordinates].reverse()
          : pipe.routeCoordinates;

        const flowAnimPolyline = L.polyline(flowCoords, {
          color: flowCap.flowColor,
          weight: Math.max(1.8, weight * 0.45),
          opacity: flowCap.canDeliver ? 0.95 : 0.75,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: `pipe-water-flow ${flowCap.speedClass}`
        });
        pipesGroup.addLayer(flowAnimPolyline);
      }

      // ─── Tampilkan Angka Data Debit & Tekanan Langsung di Peta ───
      const midIdx = Math.floor(pipe.routeCoordinates.length / 2);
      const midPoint = pipe.routeCoordinates[midIdx];

      const designQStr = flowCap.requiredFlow.toFixed(1);
      const designPStr = flowCap.endPressure.toFixed(1);
      const actualQStr = (meas && meas.actualFlow !== undefined && meas.actualFlow !== null && !isNaN(Number(meas.actualFlow)))
        ? Number(meas.actualFlow).toFixed(1)
        : null;
      const actualPStr = (meas && meas.actualPressure !== undefined && meas.actualPressure !== null && !isNaN(Number(meas.actualPressure)))
        ? Number(meas.actualPressure).toFixed(1)
        : null;

      const statusBadgeClass = flowCap.canDeliver ? '' : 'status-leak';

      const qDisplay = actualQStr !== null ? actualQStr : designQStr;
      const pDisplay = actualPStr !== null ? actualPStr : designPStr;

      // Filter label: pipa utama (diameter >= 100), atau yang memiliki hasil ukuran lapangan, atau sedang dipilih
      const isImportantLabel = pipe.diameter >= 100 || meas !== undefined || isSelected;
      const visibilityClass = isImportantLabel ? 'major-pipe-label' : 'minor-pipe-label';

      // Design ulang ukuran & susunan badge agar jauh lebih ringkas (compact)
      const badgeHtml = `
        <div class="pipe-num-badge compact ${statusBadgeClass}" title="${pipeLabel}&#10;Debit (Q): ${qDisplay} L/s&#10;Tekanan (P): ${pDisplay} bar">
          <span class="badge-v badge-q">${qDisplay}</span>
          <span class="badge-v badge-p">${pDisplay}</span>
        </div>
      `;

      const badgeIcon = L.divIcon({
        className: `pipe-num-badge-container ${visibilityClass}`,
        html: badgeHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });

      const numMarker = L.marker(midPoint, { icon: badgeIcon, interactive: true });
      numMarker.on('click', handlePipeClick);
      labelsGroup.addLayer(numMarker);
    });

    // Calculate node degrees to filter out 2-pipe straight junctions
    const nodeDegrees = {};
    (networkData.pipes || []).forEach(p => {
      nodeDegrees[p.startNodeId] = (nodeDegrees[p.startNodeId] || 0) + 1;
      nodeDegrees[p.endNodeId] = (nodeDegrees[p.endNodeId] || 0) + 1;
    });

    // Render Reservoirs & Junctions
    (networkData.nodes || []).forEach(node => {
      if (node.type === 'reservoir') {
        const resIcon = L.divIcon({
          className: 'custom-res-icon',
          html: `
            <div style="background-color: #0284c7; border: 3px solid #ffffff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5); color: #fff; font-weight: bold; font-size: 10px; cursor: pointer;">
              ${node.label || 'RES'}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = L.marker([node.lat, node.lng], { icon: resIcon });
        marker.bindTooltip(`<b>Reservoir ${node.label}</b><br/>Elevasi: ${node.elevation} m<br/>Tekanan: ${node.pressure || 0} bar<br/><span style="color:#38bdf8;font-size:10px;">Klik untuk detail node</span>`, {
          className: 'pipe-tooltip-custom'
        });
        marker.on('click', () => onSelectNode && onSelectNode(node));
        nodesGroup.addLayer(marker);
      } else if (node.type === 'junction') {
        const degree = nodeDegrees[node.id] || 0;
        const hasDemand = node.demand && node.demand > 0;
        const isOverridden = !!node._isOverridden;
        
        // Tampilkan simpang (>2), ujung (1), yang memiliki demand, yang sudah diubah manual, atau semua saat angka aktif
        if (degree !== 2 || hasDemand || isOverridden || showNumbers) {
          const isEndNode = degree === 1;
          const iconSize = hasDemand || isOverridden ? 14 : 11;
          // Warna node: kuning emas (demand > 0), merah (ujung), biru terang (simpang)
          const bgColor = hasDemand ? '#f59e0b' : (isEndNode ? '#ef4444' : '#38bdf8');
          const borderStyle = isOverridden ? '2px solid #ffffff' : '1.5px solid #0f172a';
          
          const juncIcon = L.divIcon({
            className: 'custom-junc-icon',
            html: `
              <div style="background-color: ${bgColor}; border: ${borderStyle}; width: ${iconSize}px; height: ${iconSize}px; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.6); cursor: pointer;"></div>
            `,
            iconSize: [iconSize, iconSize],
            iconAnchor: [iconSize / 2, iconSize / 2]
          });
          
          const marker = L.marker([node.lat, node.lng], { icon: juncIcon });
          marker.bindTooltip(
            `<b>Node ${node.label}</b>${isOverridden ? ' <span style="color:#fbbf24">(Diubah)</span>' : ''}<br/>` +
            `Tipe: ${hasDemand ? 'Distribusi (Demand)' : (isEndNode ? 'Ujung Jalur' : 'Simpang')}<br/>` +
            `Elevasi: ${node.elevation} m | P: ${node.pressure?.toFixed(2) || 0} bar<br/>` +
            `Demand: <b style="color:#fbbf24">${node.demand || 0} L/s</b><br/>` +
            `<span style="color:#38bdf8;font-size:10px;">● Klik untuk ubah Demand</span>`,
            { className: 'pipe-tooltip-custom' }
          );
          marker.on('click', () => onSelectNode && onSelectNode(node));
          nodesGroup.addLayer(marker);
        }
      }
    });

    pipesGroup.addTo(map);
    nodesGroup.addTo(map);

    if (showNumbers) {
      labelsGroup.addTo(map);
    }

    pipesLayerRef.current = pipesGroup;
    nodesLayerRef.current = nodesGroup;
    labelsLayerRef.current = labelsGroup;
  }, [networkData, measurements, selectedPipe, showNumbers]);


  // Center on selected pipe when chosen
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !selectedPipe || !selectedPipe.routeCoordinates) return;

    const bounds = L.latLngBounds(selectedPipe.routeCoordinates);
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
  }, [selectedPipe]);

  // Handle GPS Surveyor Geolocation
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('Perangkat Anda tidak mendukung geolokasi GPS.');
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setIsLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const latlng = [latitude, longitude];
        setUserLocation({ lat: latitude, lng: longitude, accuracy });

        const map = mapInstanceRef.current;
        if (!map) return;

        // Update or create user marker
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(latlng);
        } else {
          const surveyorIcon = L.divIcon({
            className: 'surveyor-marker',
            html: `
              <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                <div class="gps-pulse-outer"></div>
                <div class="gps-dot"></div>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });
          userMarkerRef.current = L.marker(latlng, { icon: surveyorIcon }).addTo(map);
        }

        // Accuracy circle
        if (accuracyCircleRef.current) {
          accuracyCircleRef.current.setLatLng(latlng);
          accuracyCircleRef.current.setRadius(accuracy);
        } else {
          accuracyCircleRef.current = L.circle(latlng, {
            radius: accuracy,
            color: '#38bdf8',
            fillColor: '#38bdf8',
            fillOpacity: 0.15,
            weight: 1
          }).addTo(map);
        }

        // Pan to user
        map.setView(latlng, Math.max(map.getZoom(), 16));

        // Find nearest pipe
        if (networkData?.pipes) {
          let closest = null;
          let minDistance = Infinity;

          const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));

          networkData.pipes.forEach(pipe => {
            const dist = getDistanceToPolyline([latitude, longitude], pipe.routeCoordinates);
            if (dist < minDistance) {
              minDistance = dist;
              closest = {
                pipe: {
                  ...pipe,
                  _fromLabel: nodeMap.get(pipe.startNodeId)?.label,
                  _toLabel: nodeMap.get(pipe.endNodeId)?.label
                },
                distance: dist
              };
            }
          });

          setNearestPipe(closest);
        }
      },
      err => {
        setIsLocating(false);
        console.warn('Geolocation warning/error:', err.message);
        // Fallback or demo prompt
        alert(
          'Tidak dapat membaca GPS (' +
            err.message +
            '). Pastikan izin lokasi aktif atau Anda menggunakan browser yang aman (HTTPS / Localhost).'
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSimulateGPS = () => {
    // Simulate surveyor standing right in Subang network near pipe 1
    const simulatedLat = -6.55715;
    const simulatedLng = 107.80913;
    const pos = { coords: { latitude: simulatedLat, longitude: simulatedLng, accuracy: 5 } };
    const { latitude, longitude, accuracy } = pos.coords;
    const latlng = [latitude, longitude];
    setUserLocation({ lat: latitude, lng: longitude, accuracy });

    const map = mapInstanceRef.current;
    if (map) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(latlng);
      } else {
        const surveyorIcon = L.divIcon({
          className: 'surveyor-marker',
          html: `
            <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
              <div class="gps-pulse-outer"></div>
              <div class="gps-dot"></div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });
        userMarkerRef.current = L.marker(latlng, { icon: surveyorIcon }).addTo(map);
      }
      map.setView(latlng, 17);
    }

    // Find nearest
    if (networkData?.pipes) {
      const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));
      let closest = null;
      let minDistance = Infinity;
      networkData.pipes.forEach(pipe => {
        const dist = getDistanceToPolyline([latitude, longitude], pipe.routeCoordinates);
        if (dist < minDistance) {
          minDistance = dist;
          closest = {
            pipe: {
              ...pipe,
              _fromLabel: nodeMap.get(pipe.startNodeId)?.label,
              _toLabel: nodeMap.get(pipe.endNodeId)?.label
            },
            distance: dist
          };
        }
      });
      setNearestPipe(closest);
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden select-none">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Floating Telemetry Strip - Angka Data Debit & Tekanan Langsung di Layar */}
      <div className="absolute top-2.5 left-2.5 right-16 sm:right-auto sm:max-w-md z-20 bg-slate-900/95 backdrop-blur-md rounded-2xl p-2 sm:p-2.5 border border-slate-700/80 shadow-2xl flex items-center justify-between gap-2 text-xs">
        {/* Debit Pasokan Utama (Q) */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
            <Droplets className="w-4 h-4 fill-sky-400/20" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase font-bold text-sky-400 tracking-wider">Pasokan Utama (Q)</span>
              <span className="text-[8px] bg-sky-950 text-sky-300 px-1 py-0.2 rounded border border-sky-800 font-mono">L/s</span>
            </div>
            <div className="font-mono font-bold text-white text-xs truncate" title="Debit Pasokan Utama Sumber Reservoir R1 & R2: 140.6 L/detik">
              <span>{telemetry.mainSupplyQ.toFixed(1)}</span>
              {telemetry.hasActualSupply && (
                <span className="text-emerald-400 text-[11px] ml-1.5 font-bold">
                  ➔ {telemetry.actualMainSupplyQ.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="h-7 w-px bg-slate-800 shrink-0" />

        {/* Tekanan P */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
            <Gauge className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[9px] uppercase font-bold text-amber-400 tracking-wider">Tekanan (P)</span>
              <span className="text-[8px] bg-amber-950 text-amber-300 px-1 py-0.2 rounded border border-amber-800 font-mono">bar</span>
            </div>
            <div className="font-mono font-bold text-white text-xs truncate">
              <span>~{telemetry.avgPressure.toFixed(1)}</span>
              {telemetry.measuredPressureCount > 0 && (
                <span className="text-emerald-400 text-[11px] ml-1.5 font-bold">
                  ➔ ~{telemetry.avgActualPressure.toFixed(1)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Map Controls (Top Right) */}
      <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-2">
        {/* Toggle Angka Q & P di Peta */}
        <button
          onClick={() => setShowNumbers(!showNumbers)}
          className={`p-2.5 rounded-xl shadow-lg border transition flex items-center justify-center text-xs font-medium gap-1.5 active:scale-95 ${
            showNumbers
              ? 'bg-sky-600 border-sky-400 text-white shadow-sky-500/20'
              : 'bg-slate-900/90 backdrop-blur-md text-slate-400 border-slate-700 hover:text-white hover:bg-slate-800'
          }`}
          title={showNumbers ? 'Sembunyikan Angka Q & P di Peta' : 'Tampilkan Angka Q & P di Peta'}
        >
          <Hash className="w-4 h-4" />
          <span className="hidden sm:inline">{showNumbers ? 'Angka: ON' : 'Angka: OFF'}</span>
        </button>

        {/* Toggle Layer (Street / Satellite) */}
        <button
          onClick={() => setMapType(mapType === 'osm' ? 'satellite' : 'osm')}
          className="bg-slate-900/90 backdrop-blur-md text-white p-2.5 rounded-xl shadow-lg border border-slate-700 hover:bg-slate-800 active:scale-95 transition flex items-center justify-center text-xs font-medium gap-1.5"
          title="Ganti Tampilan Peta"
        >
          <Layers className="w-4 h-4 text-sky-400" />
          <span className="hidden sm:inline">{mapType === 'osm' ? 'Satelit' : 'Jalan'}</span>
        </button>

        {/* GPS Button */}
        <button
          onClick={handleGetLocation}
          className={`p-2.5 rounded-xl shadow-lg border transition flex items-center justify-center text-xs font-medium gap-1.5 active:scale-95 ${
            isLocating
              ? 'bg-sky-600 text-white animate-pulse border-sky-400'
              : 'bg-slate-900/90 backdrop-blur-md text-white border-slate-700 hover:bg-slate-800'
          }`}
          title="Lokasi GPS Saya di Lapangan"
        >
          <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : 'text-emerald-400'}`} />
          <span className="hidden sm:inline">GPS Saya</span>
        </button>

        {/* Simulate GPS Button */}
        <button
          onClick={handleSimulateGPS}
          className="bg-slate-900/90 backdrop-blur-md text-white p-2.5 rounded-xl shadow-lg border border-slate-700 hover:bg-slate-800 active:scale-95 transition flex items-center justify-center text-xs font-medium gap-1"
          title="Simulasi Posisi Lapangan Subang"
        >
          <Compass className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Tes Lapangan</span>
        </button>

        {/* Zoom In / Out */}
        <div className="bg-slate-900/90 backdrop-blur-md rounded-xl shadow-lg border border-slate-700 flex flex-col overflow-hidden">
          <button
            onClick={() => mapInstanceRef.current?.zoomIn()}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition"
            title="Perbesar Peta"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-px bg-slate-800" />
          <button
            onClick={() => mapInstanceRef.current?.zoomOut()}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 active:bg-slate-700 transition"
            title="Perkecil Peta"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Legend Pill (Below Telemetry Strip) */}
      <div className="absolute top-[62px] left-2.5 z-20">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="bg-slate-900/90 backdrop-blur-md rounded-xl px-2.5 py-1.5 border border-slate-700/80 shadow-lg text-[10px] font-bold text-slate-300 flex items-center gap-1.5 hover:bg-slate-800 active:scale-95 transition"
        >
          <span className="w-2 h-2 rounded-full bg-sky-400"></span>
          <span>Legenda Aliran</span>
          <span className="text-[8px] text-slate-500">{showLegend ? '▲' : '▼'}</span>
        </button>

        {showLegend && (
          <div className="mt-1.5 bg-slate-900/95 backdrop-blur-md rounded-2xl p-2.5 border border-slate-700/80 shadow-2xl max-w-[235px] text-xs space-y-2 animate-scale-up">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Status Aliran & Demand</span>
              <span className="text-sky-400">Jalur ADB</span>
            </div>
            <div className="space-y-1.5 text-[10px]">
              <div className="flex items-center gap-2">
                <span className="w-5 h-1.5 rounded-full bg-sky-500 shrink-0 relative overflow-hidden">
                  <span className="absolute inset-0 border-t-2 border-dashed border-sky-100" />
                </span>
                <span className="text-slate-200">Biru: Sanggup Mengalirkan Demand</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-slate-200">Merah: Tidak Sanggup Mengalir</span>
              </div>
              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-300">Titik Node Demand (Klik = Ubah)</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nearest Pipe Floating Action Card (When GPS is active) */}
      {nearestPipe && (
        <div className="absolute bottom-16 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-3 sm:max-w-sm z-20 bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 border border-sky-500/40 shadow-2xl flex items-center justify-between gap-3 animate-bounce-once">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
              <Crosshair className="w-5 h-5 animate-spin-slow" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                Pipa Terdekat ({Math.round(nearestPipe.distance)} m)
              </div>
              <div className="text-xs font-semibold text-white truncate">
                {nearestPipe.pipe._fromLabel} → {nearestPipe.pipe._toLabel} ({nearestPipe.pipe.diameter}mm)
              </div>
              <div className="text-[11px] text-slate-300 font-mono flex items-center gap-2 mt-0.5">
                <span className="text-sky-400 font-bold">
                  Q: {Math.abs(nearestPipe.pipe.flowRate || 0)} L/s
                </span>
                <span>•</span>
                <span className="text-amber-400 font-bold">
                  P: ~{nearestPipe.pipe._designPressure ? nearestPipe.pipe._designPressure.toFixed(1) : '2.4'} bar
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => onSelectPipe(nearestPipe.pipe)}
            className="bg-sky-500 hover:bg-sky-400 active:scale-95 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs shrink-0 transition shadow-lg shadow-sky-500/20"
          >
            Ukur Sekarang
          </button>
        </div>
      )}
    </div>
  );
}
