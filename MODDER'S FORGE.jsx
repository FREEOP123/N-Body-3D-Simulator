import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, FileText, Binary, Download, Save, 
  Search, AlertTriangle, Cpu, RefreshCw, 
  FileJson, Database, Package, FileCode, Image as ImageIcon, Music, Box,
  Wrench, Globe, GraduationCap
} from 'lucide-react';

const GameModTool = () => {
  // --- State Management ---
  const [fileData, setFileData] = useState(null); // ArrayBuffer
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [viewMode, setViewMode] = useState('home'); // home, hex, text, unpack, patch
  
  // Text Extraction State
  const [extractedStrings, setExtractedStrings] = useState([]);
  const [minStrLen, setMinStrLen] = useState(4);
  const [encoding, setEncoding] = useState('utf-8');
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Unpacker State
  const [virtualFiles, setVirtualFiles] = useState([]);
  const [scanType, setScanType] = useState('all'); // all, text, media

  // Editing State
  const [translations, setTranslations] = useState({}); // Map offset -> newString

  // --- File Handling ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setFileSize(file.size);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      setFileData(event.target.result);
      setIsProcessing(false);
      setViewMode('unpack'); // Default to unpack view for new "all-in-one" feel
      // Clear previous data
      setExtractedStrings([]);
      setVirtualFiles([]);
      setTranslations({});
    };
    reader.readAsArrayBuffer(file);
  };

  // --- Core Logic: Text Extraction (Scanner) ---
  const extractText = () => {
    if (!fileData) return;
    setIsProcessing(true);

    setTimeout(() => {
      const uint8 = new Uint8Array(fileData);
      const strings = [];
      let currentStringBytes = [];
      let startOffset = 0;

      for (let i = 0; i < uint8.length; i++) {
        const byte = uint8[i];
        // Scan for printable characters
        const isPrintable = (byte >= 32 && byte <= 126) || (byte > 127);

        if (isPrintable) {
          if (currentStringBytes.length === 0) startOffset = i;
          currentStringBytes.push(byte);
        } else {
          if (currentStringBytes.length >= minStrLen) {
            try {
              const decoder = new TextDecoder(encoding);
              const text = decoder.decode(new Uint8Array(currentStringBytes));
              if (!text.includes('')) {
                 strings.push({
                  id: strings.length,
                  offset: startOffset,
                  length: currentStringBytes.length,
                  original: text,
                });
              }
            } catch (e) {}
          }
          currentStringBytes = [];
        }
      }
      setExtractedStrings(strings);
      setIsProcessing(false);
    }, 100);
  };

  // --- Core Logic: Smart File Carver (Unpacker) ---
  const scanForVirtualFiles = () => {
    if (!fileData) return;
    setIsProcessing(true);

    setTimeout(() => {
      const view = new DataView(fileData);
      const uint8 = new Uint8Array(fileData);
      const foundFiles = [];
      
      // Heuristic Scanner for Common Game Asset Formats
      for (let i = 0; i < uint8.length - 16; i++) {
        let detected = null;

        // 1. Detect JSON/Text Configs ('{' start, '}' end heuristic)
        if (uint8[i] === 0x7B) { // '{'
            // Simple validator: Check if it looks like JSON
            if (uint8[i+1] === 0x22 || uint8[i+1] === 0x0A) { // Followed by " or newline
                // Try to find end
                let braceCount = 1;
                let j = i + 1;
                while (j < uint8.length && j < i + 50000) { // Max 50KB scan for per text file
                    if (uint8[j] === 0x7B) braceCount++;
                    if (uint8[j] === 0x7D) braceCount--;
                    if (braceCount === 0) {
                        detected = { type: 'json', ext: 'json', size: j - i + 1 };
                        break;
                    }
                    j++;
                }
            }
        }

        // 2. Detect PNG Images (89 50 4E 47 0D 0A 1A 0A)
        if (!detected && i + 8 < uint8.length && 
            uint8[i]===0x89 && uint8[i+1]===0x50 && uint8[i+2]===0x4E && uint8[i+3]===0x47) {
            // Find IEND chunk for size
            let j = i + 8;
            while(j < uint8.length - 12) {
                if (uint8[j]===0x49 && uint8[j+1]===0x45 && uint8[j+2]===0x4E && uint8[j+3]===0x44) {
                    detected = { type: 'image', ext: 'png', size: (j + 8) - i };
                    break;
                }
                j++;
            }
        }

        // 3. Detect UnityFS (Unity Bundle)
        if (!detected && i + 7 < uint8.length &&
            uint8[i]===0x55 && uint8[i+1]===0x6E && uint8[i+2]===0x69 && uint8[i+3]===0x74 && uint8[i+4]===0x79 && uint8[i+5]===0x46 && uint8[i+6]===0x53) {
            detected = { type: 'archive', ext: 'assets', size: 0 }; // Unknown size, just mark start
        }

        // 4. Detect Ogg Audio (OggS)
        if (!detected && i + 4 < uint8.length &&
            uint8[i]===0x4F && uint8[i+1]===0x67 && uint8[i+2]===0x67 && uint8[i+3]===0x53) {
            detected = { type: 'audio', ext: 'ogg', size: 0 }; // Stream format, hard to find end without parsing pages
        }

        // Add to list if found
        if (detected) {
            foundFiles.push({
                id: foundFiles.length,
                offset: i,
                size: detected.size,
                type: detected.type,
                ext: detected.ext,
                name: `File_${foundFiles.length}.${detected.ext}`
            });
            // Skip ahead if we know the size
            if (detected.size > 0) i += detected.size - 1;
        }
      }

      setVirtualFiles(foundFiles);
      setIsProcessing(false);
    }, 100);
  };

  // --- Logic: Download Sub-file ---
  const downloadSubFile = (vFile) => {
    let blob;
    if (vFile.size > 0) {
        const slice = fileData.slice(vFile.offset, vFile.offset + vFile.size);
        blob = new Blob([slice], { type: 'application/octet-stream' });
    } else {
        // Fallback for unknown size: extract 1MB chunk or until next likely header
        // For Ogg/Unity, we just grab a chunk for analysis
        const slice = fileData.slice(vFile.offset, Math.min(vFile.offset + 1024*1024*5, fileData.byteLength));
        blob = new Blob([slice], { type: 'application/octet-stream' });
        alert("คำเตือน: ไฟล์นี้ไม่ทราบขนาดที่แน่นอน ระบบจะตัดมาให้ 5MB แรกเท่านั้น");
    }
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vFile.name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // --- Logic: Replace Sub-file ---
  const replaceSubFile = (vFile, newFile) => {
    if (vFile.size === 0) {
        alert("ไม่สามารถแทนที่ไฟล์ที่ไม่ทราบขนาดได้");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const newBytes = new Uint8Array(e.target.result);
        
        if (newBytes.length > vFile.size) {
            const confirm = window.confirm(`ไฟล์ใหม่ (${newBytes.length} bytes) ใหญ่กว่าที่เดิม (${vFile.size} bytes)!\nการเขียนทับอาจทำให้ไฟล์เกมเสียหายได้ ยืนยันหรือไม่?`);
            if (!confirm) return;
        }

        // Clone main buffer
        const newBuffer = fileData.slice(0);
        const view = new Uint8Array(newBuffer);
        
        // Write new bytes
        for (let i = 0; i < newBytes.length; i++) {
            if (vFile.offset + i < view.length) {
                view[vFile.offset + i] = newBytes[i];
            }
        }
        
        // Fill remaining space with 0x00 if new file is smaller
        if (newBytes.length < vFile.size) {
            for (let i = newBytes.length; i < vFile.size; i++) {
                 view[vFile.offset + i] = 0x00;
            }
        }

        setFileData(newBuffer);
        alert(`แทนที่ไฟล์ ${vFile.name} เรียบร้อยแล้ว!`);
    };
    reader.readAsArrayBuffer(newFile);
  };

  // --- Core Logic: Binary Repacking (Global) ---
  const generatePatchedFile = () => {
    if (!fileData) return;
    
    // Clone buffer
    const newBuffer = fileData.slice(0);
    const view = new Uint8Array(newBuffer);
    const encoder = new TextEncoder();

    let successCount = 0;
    let failCount = 0;

    Object.keys(translations).forEach(offsetKey => {
      const offset = parseInt(offsetKey);
      const translation = translations[offsetKey];
      const originalEntry = extractedStrings.find(s => s.offset === offset);

      if (!originalEntry) return;

      const encodedTrans = encoder.encode(translation);
      if (encodedTrans.length <= originalEntry.length) {
        for (let i = 0; i < encodedTrans.length; i++) {
          view[offset + i] = encodedTrans[i];
        }
        for (let i = encodedTrans.length; i < originalEntry.length; i++) {
          view[offset + i] = 0x00;
        }
        successCount++;
      } else {
        failCount++;
      }
    });

    const blob = new Blob([newBuffer], { type: "application/octet-stream" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MODDED_${fileName}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    alert(`สร้างไฟล์เกมใหม่สำเร็จ!\nแก้ไข Text: ${successCount} จุด\nแทนที่ไฟล์ย่อย: (บันทึกใน Memory แล้ว)`);
  };

  // --- Export/Import JSON ---
  const exportJson = () => {
    const dataToExport = extractedStrings.map(s => ({
      offset: s.offset,
      original: s.original,
      translation: translations[s.offset] || ""
    }));
    
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}_translation.json`;
    a.click();
  };

  const importJson = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        const newTranslations = { ...translations };
        imported.forEach(item => {
          if (item.translation) newTranslations[item.offset] = item.translation;
        });
        setTranslations(newTranslations);
        alert(`นำเข้าคำแปล ${imported.length} รายการเรียบร้อย`);
      } catch (err) { alert("ไฟล์ JSON ไม่ถูกต้อง"); }
    };
    reader.readAsText(file);
  };

  // --- Render Components ---

  const Sidebar = () => (
    <div className="w-20 md:w-64 bg-slate-900 border-r border-slate-700 flex flex-col items-center md:items-start py-6 text-slate-300">
      <div className="px-4 mb-8 font-bold text-xl md:flex items-center hidden text-blue-400">
        <Cpu className="mr-2" /> MODDER'S FORGE
      </div>
      
      <nav className="flex-1 w-full space-y-2 px-2">
        <button onClick={() => setViewMode('home')} className={`w-full flex items-center p-3 rounded-lg hover:bg-slate-800 transition ${viewMode === 'home' ? 'bg-blue-900 text-white' : ''}`}>
          <Upload size={20} /> <span className="ml-3 hidden md:block">เปิดไฟล์เกม</span>
        </button>
        <div className="h-px bg-slate-800 my-2 mx-2"></div>
        <button onClick={() => setViewMode('unpack')} disabled={!fileData} className={`w-full flex items-center p-3 rounded-lg hover:bg-slate-800 transition disabled:opacity-30 ${viewMode === 'unpack' ? 'bg-blue-900 text-white' : ''}`}>
          <Package size={20} /> <span className="ml-3 hidden md:block">แยกไฟล์/Extract</span>
        </button>
        <button onClick={() => setViewMode('text')} disabled={!fileData} className={`w-full flex items-center p-3 rounded-lg hover:bg-slate-800 transition disabled:opacity-30 ${viewMode === 'text' ? 'bg-blue-900 text-white' : ''}`}>
          <FileText size={20} /> <span className="ml-3 hidden md:block">แปลภาษา/Text</span>
        </button>
        <button onClick={() => setViewMode('hex')} disabled={!fileData} className={`w-full flex items-center p-3 rounded-lg hover:bg-slate-800 transition disabled:opacity-30 ${viewMode === 'hex' ? 'bg-blue-900 text-white' : ''}`}>
          <Binary size={20} /> <span className="ml-3 hidden md:block">Hex Editor</span>
        </button>
        <div className="h-px bg-slate-800 my-2 mx-2"></div>
        <button onClick={() => setViewMode('patch')} disabled={!fileData} className={`w-full flex items-center p-3 rounded-lg hover:bg-slate-800 transition disabled:opacity-30 ${viewMode === 'patch' ? 'bg-blue-900 text-white' : ''}`}>
          <Save size={20} /> <span className="ml-3 hidden md:block">สร้าง/Repack</span>
        </button>
      </nav>
    </div>
  );

  const Unpacker = () => (
    <div className="h-full flex flex-col bg-slate-900">
       <div className="p-4 bg-slate-800 border-b border-slate-700">
          <div className="flex justify-between items-center mb-4">
             <h2 className="text-xl font-bold text-white flex items-center"><Package className="mr-2 text-yellow-400"/> File Unpacker & Replacer</h2>
          </div>
          <div className="flex gap-4 items-center bg-slate-900 p-3 rounded-lg text-sm text-slate-300">
             <span className="text-slate-400">Scanner:</span>
             <button onClick={scanForVirtualFiles} disabled={isProcessing} className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded flex items-center font-bold">
               <Search size={14} className="mr-2"/> Deep Scan
             </button>
             <span className="text-xs text-slate-500 ml-2">สแกนหา JSON, PNG, UnityFS, Ogg ภายในไบนารี</span>
          </div>
       </div>

       <div className="flex-1 overflow-auto p-4">
          {virtualFiles.length === 0 ? (
             <div className="text-center text-slate-500 mt-20">
                <Box size={48} className="mx-auto mb-4 opacity-50"/>
                <p>กดปุ่ม "Deep Scan" เพื่อค้นหาไฟล์ที่ซ่อนอยู่</p>
             </div>
          ) : (
             <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {virtualFiles.map((vFile) => (
                  <div key={vFile.id} className="bg-slate-800 border border-slate-700 p-3 rounded flex items-center justify-between hover:border-blue-500 transition">
                     <div className="flex items-center space-x-3 overflow-hidden">
                        <div className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${
                            vFile.type === 'image' ? 'bg-purple-900 text-purple-300' :
                            vFile.type === 'json' ? 'bg-orange-900 text-orange-300' :
                            vFile.type === 'audio' ? 'bg-pink-900 text-pink-300' : 'bg-slate-700'
                        }`}>
                           {vFile.type === 'image' ? <ImageIcon size={20}/> : 
                            vFile.type === 'json' ? <FileCode size={20}/> : 
                            vFile.type === 'audio' ? <Music size={20}/> : <Binary size={20}/>}
                        </div>
                        <div className="min-w-0">
                           <div className="font-bold text-sm text-white truncate">{vFile.name}</div>
                           <div className="text-xs text-slate-500 font-mono">
                             Size: {vFile.size > 0 ? `${vFile.size} B` : 'Unknown'} | Offset: 0x{vFile.offset.toString(16).toUpperCase()}
                           </div>
                        </div>
                     </div>
                     
                     <div className="flex space-x-2 shrink-0 ml-2">
                        <button onClick={() => downloadSubFile(vFile)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-blue-400" title="Extract">
                           <Download size={16}/>
                        </button>
                        <label className="p-2 bg-slate-700 hover:bg-slate-600 rounded text-green-400 cursor-pointer" title="Replace">
                           <Upload size={16}/>
                           <input type="file" className="hidden" onChange={(e) => {
                             if(e.target.files[0]) replaceSubFile(vFile, e.target.files[0]);
                             e.target.value = null; 
                           }}/>
                        </label>
                     </div>
                  </div>
                ))}
             </div>
          )}
       </div>
    </div>
  );

  const HexViewer = () => {
    const previewSize = 512; 
    const rows = [];
    if (fileData) {
      for (let i = 0; i < Math.min(fileData.byteLength, previewSize); i += 16) {
        // Safe access to buffer
        const chunk = new Uint8Array(fileData.slice(i, Math.min(i+16, fileData.byteLength)));
        const hexStr = Array.from(chunk).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
        const asciiStr = Array.from(chunk).map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.').join('');
        
        rows.push(
          <div key={i} className="flex font-mono text-sm hover:bg-slate-800">
            <span className="w-24 text-blue-400 select-none">{i.toString(16).padStart(8, '0').toUpperCase()}</span>
            <span className="w-96 text-slate-300 ml-4">{hexStr}</span>
            <span className="w-48 text-yellow-600 ml-4 hidden lg:block opacity-70">{asciiStr}</span>
          </div>
        );
      }
    }
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-slate-700 bg-slate-800"><h2 className="text-xl font-bold text-white"><Binary className="inline mr-2"/>Hex Inspector</h2></div>
        <div className="flex-1 overflow-auto p-4 bg-slate-900 text-slate-300">{rows}</div>
      </div>
    );
  };

  const TextExtractor = () => {
    const filteredStrings = extractedStrings.filter(s => 
      s.original.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (translations[s.offset] && translations[s.offset].toLowerCase().includes(searchQuery.toLowerCase()))
    );

    return (
      <div className="h-full flex flex-col bg-slate-900">
        <div className="p-4 bg-slate-800 border-b border-slate-700 space-y-4">
          <div className="flex justify-between">
             <h2 className="text-xl font-bold text-white flex items-center"><FileText className="mr-2 text-blue-400"/> Text Tools</h2>
             <div className="flex space-x-2">
                <button onClick={exportJson} disabled={extractedStrings.length === 0} className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-sm flex items-center"><Download size={14} className="mr-1"/> JSON</button>
                <label className="px-3 py-1 bg-blue-700 hover:bg-blue-600 text-white rounded text-sm flex items-center cursor-pointer"><Database size={14} className="mr-1"/> Import<input type="file" onChange={importJson} accept=".json" className="hidden" /></label>
             </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm text-slate-300 bg-slate-900 p-3 rounded-lg">
            <div className="flex items-center space-x-2"><span>Min Length:</span><input type="number" value={minStrLen} onChange={(e) => setMinStrLen(Number(e.target.value))} className="w-16 bg-slate-800 border border-slate-600 rounded px-2 py-1"/></div>
            <button onClick={extractText} disabled={isProcessing} className="px-4 py-1 bg-orange-600 hover:bg-orange-500 text-white rounded flex items-center"><RefreshCw size={14} className={`mr-1 ${isProcessing ? 'animate-spin' : ''}`}/> {extractedStrings.length > 0 ? 'Rescan' : 'Scan Text'}</button>
          </div>
          {extractedStrings.length > 0 && <input type="text" placeholder="Search text..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-white"/>}
        </div>
        <div className="flex-1 overflow-auto p-4 space-y-2">
          {filteredStrings.map((str) => {
              const currentTrans = translations[str.offset] || '';
              const isTooLong = new TextEncoder().encode(currentTrans).length > str.length;
              return (
                <div key={str.offset} className="bg-slate-800 rounded border border-slate-700 p-3">
                  <div className="flex justify-between text-xs text-slate-500 mb-1 font-mono"><span>0x{str.offset.toString(16).toUpperCase()}</span><span>Max: {str.length}B</span></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-900 p-2 rounded text-slate-300 font-mono text-sm break-all">{str.original}</div>
                    <div className="relative">
                       <input type="text" value={currentTrans} placeholder="Translation..." onChange={(e) => setTranslations({...translations, [str.offset]: e.target.value})} className={`w-full bg-slate-700 text-white px-3 py-2 rounded text-sm outline-none ${isTooLong ? 'bg-red-900/20 ring-1 ring-red-500' : 'focus:ring-1 ring-blue-500'}`}/>
                       {isTooLong && <div className="text-red-400 text-xs mt-1">Too long!</div>}
                    </div>
                  </div>
                </div>
              );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-950 text-white font-sans overflow-hidden">
      <Sidebar />
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-6 justify-between shrink-0">
          <div className="flex items-center text-sm text-slate-300">
             {fileData ? <><span className="font-bold text-blue-400 mr-2">{fileName}</span><span className="bg-slate-800 px-2 py-0.5 rounded text-xs">{(fileSize/1024/1024).toFixed(2)} MB</span></> : <span className="text-slate-500 italic">No File Loaded</span>}
          </div>
          {isProcessing && <span className="text-orange-400 text-xs animate-pulse">Processing...</span>}
        </header>

        <div className="flex-1 overflow-hidden relative">
          {viewMode === 'home' && (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300 overflow-y-auto">
              <div className="w-full max-w-lg border-2 border-dashed border-slate-700 bg-slate-900/50 rounded-2xl p-12 hover:border-blue-500 hover:bg-slate-800/50 transition cursor-pointer relative group">
                <input type="file" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                <div className="w-20 h-20 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition"><Upload size={40} className="text-blue-400" /></div>
                <h2 className="text-2xl font-bold mb-2">Drop Game File Here</h2>
                <p className="text-slate-400 mb-6">Support: .assets, .pak, .bin, .dat</p>
              </div>

              {/* Added Description Section */}
              <div className="mt-12 max-w-3xl space-y-6 text-left">
                <div className="text-center mb-8">
                  <h3 className="text-xl font-bold text-blue-400 mb-2">สร้างสรรค์ไร้ขีดจำกัด: พื้นที่สำหรับนักม็อดและนักพอร์ต</h3>
                  <p className="text-slate-400 text-sm">
                    เครื่องมือนี้ถูกสร้างมาเพื่อให้นักม็อด (Modders) และนักพัฒนาอิสระ สามารถเข้าถึงและแก้ไขไฟล์เกมได้โดยตรง 
                    เพื่อนำไปต่อยอดจินตนาการ ไม่ว่าจะเป็นการแปลภาษา, การปรับแต่งตัวเกม, หรือการเตรียมไฟล์สำหรับการพอร์ต
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700 hover:border-blue-500 transition">
                      <div className="w-10 h-10 bg-blue-900/50 rounded-lg flex items-center justify-center mb-3 text-blue-400">
                         <Wrench size={20}/>
                      </div>
                      <h4 className="font-bold text-white mb-2">สำหรับนักม็อด</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        ดึง Assets และแก้ไขค่าต่างๆ ในเกมเพื่อสร้าง Mod ใหม่ๆ ไม่ว่าจะเป็น Total Conversion หรือ Quality of Life
                      </p>
                   </div>

                   <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700 hover:border-emerald-500 transition">
                      <div className="w-10 h-10 bg-emerald-900/50 rounded-lg flex items-center justify-center mb-3 text-emerald-400">
                         <Globe size={20}/>
                      </div>
                      <h4 className="font-bold text-white mb-2">Localization & แปลเกม</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                         เครื่องมือช่วยแกะไฟล์ภาษาและนำกลับเข้าไปใหม่ (Repack) อย่างปลอดภัย เหมาะสำหรับทำ Patch ภาษาไทย
                      </p>
                   </div>

                   <div className="bg-slate-800/40 p-5 rounded-xl border border-slate-700 hover:border-purple-500 transition">
                      <div className="w-10 h-10 bg-purple-900/50 rounded-lg flex items-center justify-center mb-3 text-purple-400">
                         <GraduationCap size={20}/>
                      </div>
                      <h4 className="font-bold text-white mb-2">สร้างผลงานลง Portfolio (P-F)</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">
                         โปรเจกต์นี้แสดงให้เห็นถึงทักษะเชิงลึกด้าน Technical, Reverse Engineering และการจัดการข้อมูล ซึ่งเป็นผลงานที่โดดเด่นสำหรับการยื่นเข้ามหาวิทยาลัย
                      </p>
                   </div>
                </div>
              </div>
            </div>
          )}
          {viewMode === 'unpack' && <Unpacker />}
          {viewMode === 'hex' && <HexViewer />}
          {viewMode === 'text' && <TextExtractor />}
          {viewMode === 'patch' && (
             <div className="h-full flex flex-col items-center justify-center p-8 bg-slate-900">
                <div className="max-w-md w-full bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl text-center">
                   <h2 className="text-xl font-bold mb-4 flex justify-center items-center"><Save className="mr-2 text-green-400"/> Build Game File</h2>
                   <p className="text-slate-400 mb-6">Ready to repack all changes (Text & Replaced Files) into a new binary?</p>
                   <button onClick={generatePatchedFile} className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold shadow-lg transition flex justify-center items-center"><Download className="mr-2" /> Download Modded File</button>
                </div>
             </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default GameModTool;