import React, { useState, useEffect } from 'react';
import {
  Map as MapIcon,
  ListFilter,
  BarChart3,
  QrCode,
  Wifi,
  WifiOff,
  Droplets,
  Layers,
  Sparkles,
  Download,
  SearchX
} from 'lucide-react';

import MapComponent from './components/MapComponent';
import PipeListView from './components/PipeListView';
import DashboardView from './components/DashboardView';
import InspectionModal from './components/InspectionModal';
import QrCodeModal from './components/QrCodeModal';
import WaterLossView from './components/WaterLossView';

import subangData from './Subang_Jalur_ADB.json';
import {
  getStoredMeasurements,
  saveMeasurement,
  deleteMeasurement,
  clearAllMeasurements,
  generateDemoData,
  exportToCSV
} from './utils/storage';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center h-full bg-slate-950 text-slate-100">
          <div className="bg-slate-900 border border-rose-500/30 p-6 rounded-3xl max-w-md space-y-3 shadow-2xl">
            <h2 className="text-base font-bold text-rose-400">Terjadi Kendala Tampilan</h2>
            <p className="text-xs text-slate-300 font-mono">
              {this.state.error?.message || 'Terjadi kesalahan sistem saat memuat komponen.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs rounded-xl transition"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [activeTab, setActiveTab] = useState('map'); // 'map', 'list', 'dashboard', 'nrw'
  const [networkData, setNetworkData] = useState(subangData);
  const [measurements, setMeasurements] = useState({});
  const [selectedPipe, setSelectedPipe] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Load measurements on mount
  useEffect(() => {
    setMeasurements(getStoredMeasurements());

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSaveMeasurement = (pipeId, data, cascadeList = []) => {
    const updated = saveMeasurement(pipeId, data, cascadeList);
    setMeasurements({ ...updated });
  };

  const handleDeleteMeasurement = (pipeId) => {
    const updated = deleteMeasurement(pipeId);
    setMeasurements({ ...updated });
  };

  const handleClearAll = () => {
    if (window.confirm('Yakin ingin menghapus seluruh data pengukuran lapangan?')) {
      const updated = clearAllMeasurements();
      setMeasurements({ ...updated });
    }
  };

  const handleLoadDemo = () => {
    const nodeMap = new Map((networkData.nodes || []).map(n => [n.id, n]));
    const demo = generateDemoData(networkData.pipes, nodeMap);
    setMeasurements({ ...demo });
  };

  const handleExportCSV = () => {
    const nodeMap = {};
    (networkData.nodes || []).forEach(n => {
      nodeMap[n.id] = n;
    });
    exportToCSV(networkData.pipes || [], measurements, nodeMap);
  };

  const measuredList = Object.values(measurements);
  const directCount = measuredList.filter(m => m.source !== 'cascade').length;
  const cascadeCount = measuredList.filter(m => m.source === 'cascade').length;
  const totalCount = networkData.pipes?.length || 0;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Application Bar */}
      <header className="h-14 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 pt-safe">
        {/* Brand & Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-600 to-sky-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
            <Droplets className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-sm sm:text-base text-white tracking-tight leading-none">
                DebitAir Subang
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                ADB
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">
              Monitoring Jalur Transmisi & Distribusi
            </p>
          </div>
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-2">
          {/* Inspected Counter Pill */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700 text-xs">
            <span className="text-slate-400">Aktual:</span>
            <span className="font-bold text-sky-400 font-mono">
              {directCount}/{totalCount}
            </span>
            {cascadeCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-indigo-500/20 text-indigo-300 font-mono border border-indigo-500/30 font-semibold" title={`Terdampak estimasi jalur: ${cascadeCount} pipa`}>
                +{cascadeCount} jalur
              </span>
            )}
          </div>

          {/* Online / Offline status */}
          <div
            className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-xl border ${
              isOnline
                ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-400'
                : 'bg-amber-950/40 border-amber-600/40 text-amber-400'
            }`}
            title={isOnline ? 'Online (Terhubung)' : 'Offline (Tersimpan Lokal)'}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span className="hidden xs:inline">{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* QR Code Button for Mobile Access */}
          <button
            onClick={() => setShowQrModal(true)}
            className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 border border-sky-500/40 p-2 rounded-xl text-xs font-semibold flex items-center gap-1 transition active:scale-95"
            title="Scan QR untuk Buka di HP"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">Buka di HP</span>
          </button>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 relative overflow-hidden">
        <ErrorBoundary>
          {activeTab === 'map' && (
            <MapComponent
              networkData={networkData}
              measurements={measurements}
              selectedPipe={selectedPipe}
              onSelectPipe={setSelectedPipe}
              userLocation={userLocation}
              setUserLocation={setUserLocation}
            />
          )}

          {activeTab === 'list' && (
            <PipeListView
              networkData={networkData}
              measurements={measurements}
              onSelectPipe={setSelectedPipe}
              userLocation={userLocation}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              networkData={networkData}
              measurements={measurements}
              onLoadDemo={handleLoadDemo}
              onClearData={handleClearAll}
              onExportCSV={handleExportCSV}
              onSelectPipe={(p) => {
                setSelectedPipe(p);
                setActiveTab('map');
              }}
            />
          )}

          {activeTab === 'nrw' && (
            <WaterLossView
              networkData={networkData}
              measurements={measurements}
              onSelectPipe={(p) => {
                setSelectedPipe(p);
                setActiveTab('map');
              }}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Bottom Mobile Navigation Bar */}
      <nav className="h-16 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 flex items-center justify-around shrink-0 z-30 pb-safe">
        {/* Tab Peta */}
        <button
          onClick={() => setActiveTab('map')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition ${
            activeTab === 'map' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'map' ? 'bg-sky-500/20' : 'bg-transparent'
            }`}
          >
            <MapIcon className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Peta Jalur</span>
        </button>

        {/* Tab Daftar Pipa */}
        <button
          onClick={() => setActiveTab('list')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition relative ${
            activeTab === 'list' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'list' ? 'bg-sky-500/20' : 'bg-transparent'
            }`}
          >
            <ListFilter className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Daftar Pipa</span>
          {directCount > 0 && (
            <span className="absolute top-1 right-[28%] w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </button>

        {/* Tab Dashboard Analisis */}
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition ${
            activeTab === 'dashboard' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'dashboard' ? 'bg-sky-500/20' : 'bg-transparent'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Dashboard</span>
        </button>

        {/* Tab Analisis NRW */}
        <button
          onClick={() => setActiveTab('nrw')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-1 transition ${
            activeTab === 'nrw' ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <div
            className={`p-1 rounded-xl transition ${
              activeTab === 'nrw' ? 'bg-sky-500/20' : 'bg-transparent'
            }`}
          >
            <SearchX className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">NRW</span>
        </button>
      </nav>

      {/* Pipe Inspection Bottom Sheet / Modal */}
      {selectedPipe && (
        <ErrorBoundary>
          <InspectionModal
            pipe={selectedPipe}
            networkData={networkData}
            existingMeasurement={measurements[selectedPipe.id]}
            onSave={handleSaveMeasurement}
            onDelete={handleDeleteMeasurement}
            onClose={() => setSelectedPipe(null)}
          />
        </ErrorBoundary>
      )}

      {/* QR Code Modal */}
      {showQrModal && (
        <QrCodeModal
          onClose={() => setShowQrModal(false)}
          defaultIp="10.38.180.170"
          port={5173}
        />
      )}
    </div>
  );
}
