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
import { analyzeFlowStatus, getDistanceToPolyline } from '../utils/calculations';

export default function MapComponent({
  networkData,
  measurements,
  selectedPipe,
  onSelectPipe,
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
  const [showNumbers, setShowNumbers] = useState(true); // Toggle angka Q & P di peta
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
      const analysis = analyzeFlowStatus(pipe.flowRate, meas?.actualFlow);
      const isSelected = selectedPipe && selectedPipe.id === pipe.id;

      const fromNode = nodeMap.get(pipe.startNodeId);
      const toNode = nodeMap.get(pipe.endNodeId);
      const pipeLabel = `${fromNode?.label || 'J'} → ${toNode?.label || 'J'}`;

      const pFrom = fromNode?.pressure ?? null;
      const pTo = toNode?.pressure ?? null;
      const designPressure = pFrom !== null && pTo !== null ? (pFrom + pTo) / 2 : (pFrom ?? pTo ?? 2.4);

      // Line width based on diameter (50mm to 400mm)
      const baseWeight = Math.max(3, Math.min(8, (pipe.diameter / 60)));
      const weight = isSelected ? baseWeight + 4 : baseWeight;

      let pipeColor = analysis.color;
      let statusLabel = analysis.label;

      // Jika ada data tekanan aktual, utamakan deteksi krisis tekanan (< 0.7 bar)
      if (meas && meas.actualPressure !== undefined && meas.actualPressure !== null && !isNaN(parseFloat(meas.actualPressure))) {
        const actP = parseFloat(meas.actualPressure);
        if (actP < 0.7) {
          pipeColor = '#ef4444'; // Merah: krisis tekanan / air tidak naik
          statusLabel = `Kritis: Tekanan Rendah (${actP.toFixed(2)} bar)`;
        } else if (actP > 6.0) {
          pipeColor = '#c084fc'; // Ungu: overpressure
          statusLabel = `Bahaya: Overpressure (${actP.toFixed(2)} bar)`;
        } else if (analysis.status === 'unmeasured') {
          pipeColor = '#10b981'; // Hijau: tekanan normal
          statusLabel = `Tekanan Normal (${actP.toFixed(2)} bar)`;
        }
      }

      const polyline = L.polyline(pipe.routeCoordinates, {
        color: isSelected ? '#ffffff' : pipeColor,
        weight: weight,
        opacity: isSelected ? 1 : (meas ? 0.95 : 0.75),
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: !meas && !isSelected ? '6, 6' : null
      });

      // Tooltip
      const designFlow = Math.abs(pipe.flowRate || 0).toFixed(2);
      const actualFlow = meas ? (meas.isEstimatedFlow ? `~${meas.actualFlow.toFixed(2)} L/s (est)` : `${meas.actualFlow.toFixed(2)} L/s`) : 'Belum diukur';
      const tooltipContent = `
        <div style="font-weight: 600; font-size: 12px; margin-bottom: 2px;">
          ${pipeLabel} (${pipe.diameter}mm - ${pipe.material})
        </div>
        <div style="font-size: 11px; color: #94a3b8;">
          Q Desain: <span style="color:#38bdf8">${designFlow} L/s</span> | Q Aktual: <span style="color:${pipeColor}">${actualFlow}</span>
        </div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 1px;">
          P Desain: <span style="color:#fbbf24">${designPressure.toFixed(2)} bar</span> | P Aktual: <span style="color:#34d399">${meas?.actualPressure ? meas.actualPressure + ' bar' : '-'}</span>
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

      // ─── Tampilkan Angka Data Debit & Tekanan Langsung di Peta ───
      const midIdx = Math.floor(pipe.routeCoordinates.length / 2);
      const midPoint = pipe.routeCoordinates[midIdx];

      const designQStr = Math.abs(pipe.flowRate || 0).toFixed(1);
      const designPStr = designPressure.toFixed(1);
      const actualQStr = meas?.actualFlow !== undefined ? Number(meas.actualFlow).toFixed(1) : null;
      const actualPStr = meas?.actualPressure !== undefined && meas.actualPressure !== null ? Number(meas.actualPressure).toFixed(1) : null;

      let statusBadgeClass = '';
      if (meas) {
        if (analysis.status === 'match') statusBadgeClass = 'status-match';
        else if (analysis.status === 'warning') statusBadgeClass = 'status-warning';
        else if (analysis.status === 'leak_alert') statusBadgeClass = 'status-leak';
        else if (analysis.status === 'overflow_alert') statusBadgeClass = 'status-overflow';
      }

      const qDisplay = actualQStr !== null ? actualQStr : designQStr;
      const pDisplay = actualPStr !== null ? actualPStr : designPStr;

      const badgeHtml = `
        <div class="pipe-num-badge ${statusBadgeClass}" title="${pipeLabel}&#10;Debit (Q): ${qDisplay} L/s&#10;Tekanan (P): ${pDisplay} bar">
          <span class="badge-q">Q:${qDisplay}</span>
          <span class="badge-div">|</span>
          <span class="badge-p">P:${pDisplay}b</span>
        </div>
      `;

      const badgeIcon = L.divIcon({
        className: 'pipe-num-badge-container',
        html: badgeHtml,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      });

      const numMarker = L.marker(midPoint, { icon: badgeIcon, interactive: true });
      numMarker.on('click', handlePipeClick);
      labelsGroup.addLayer(numMarker);
    });

    // Render Reservoirs & Junctions
    (networkData.nodes || []).forEach(node => {
      if (node.type === 'reservoir') {
        const resIcon = L.divIcon({
          className: 'custom-res-icon',
          html: `
            <div style="background-color: #0284c7; border: 3px solid #ffffff; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5); color: #fff; font-weight: bold; font-size: 10px;">
              ${node.label || 'RES'}
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = L.marker([node.lat, node.lng], { icon: resIcon });
        marker.bindTooltip(`<b>Reservoir ${node.label}</b><br/>Elevasi: ${node.elevation} m<br/>Tekanan: ${node.pressure || 0} bar`, {
          className: 'pipe-tooltip-custom'
        });
        nodesGroup.addLayer(marker);
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
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>Legenda Status</span>
          <span className="text-[8px] text-slate-500">{showLegend ? '▲' : '▼'}</span>
        </button>

        {showLegend && (
          <div className="mt-1.5 bg-slate-900/95 backdrop-blur-md rounded-2xl p-2.5 border border-slate-700/80 shadow-2xl max-w-[210px] text-xs space-y-1.5 animate-scale-up">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Status Deviasi Debit</span>
              <span className="text-sky-400">Jalur ADB</span>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-slate-200 truncate">Sesuai (±10%)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                <span className="text-slate-200 truncate">Peringatan</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <span className="text-slate-200 truncate">Drop/Bocor</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                <span className="text-slate-200 truncate">Belum Ukur</span>
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
