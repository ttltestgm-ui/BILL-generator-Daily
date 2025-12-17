import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, FileDown, Database, Save, Moon, Coffee, Upload, Settings, Search, User, Briefcase, Calendar } from 'lucide-react';
import { Employee, BillItem, BillType } from './types';
import { generateBillPDF } from './services/pdfService';

const App: React.FC = () => {
  // -- State --
  // FIXED: Initialize state lazily from localStorage to prevent overwriting on refresh
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const saved = localStorage.getItem('tusuka_employees');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load database", e);
      return [];
    }
  });

  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [billType, setBillType] = useState<BillType>(BillType.TIFFIN);
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showSettings, setShowSettings] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null); // For auto-focus

  // Special state for Night Bill S/O rate
  const [nightSoRate, setNightSoRate] = useState<number>(350);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    cardNo: '',
    designation: 'S/O', // Default to S/O
    remarks: ''
  });

  const [suggestions, setSuggestions] = useState<Employee[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // -- Helper Logic --
  const calculateRate = (type: BillType, designation: string, currentNightRate: number) => {
    if (type === BillType.TIFFIN) {
      return 50;
    }
    if (type === BillType.DAILY_LABOUR) {
      return 600;
    }
    if (type === BillType.HOLIDAY) {
      if (designation === 'LABOUR') return 600;
      // Returns 800 for S/O, JR. SUPPLY CHAIN EXECUTIVE, etc.
      return 800;
    }
    if (type === BillType.NIGHT_ENTERTAINMENT) {
      if (designation === 'LABOUR') return 150;
      // Default to S/O rate for S/O, Executives, etc.
      return currentNightRate;
    }
    return 0;
  };

  // -- Effects --
  // Save database on change (Persist immediately)
  useEffect(() => {
    localStorage.setItem('tusuka_employees', JSON.stringify(employees));
  }, [employees]);

  // Recalculate existing items' amount when Bill Type or Night Rate changes
  useEffect(() => {
    setBillItems(prevItems => prevItems.map(item => ({
      ...item,
      taka: calculateRate(billType, item.designation, nightSoRate)
    })));
  }, [billType, nightSoRate]);

  // -- Computed Values --
  const currentTaka = useMemo(() => {
    return calculateRate(billType, formData.designation, nightSoRate);
  }, [billType, formData.designation, nightSoRate]);

  // Theme Colors based on Bill Type
  const themeColor = useMemo(() => {
    switch (billType) {
      case BillType.TIFFIN: return "indigo";
      case BillType.NIGHT_ENTERTAINMENT: return "violet";
      case BillType.HOLIDAY: return "rose";
      case BillType.DAILY_LABOUR: return "emerald";
      default: return "slate";
    }
  }, [billType]);

  // -- Handlers --

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    
    // Logic for auto-filling based on Card No
    let nextFormData = { ...formData, [name]: value };
    
    if (name === 'cardNo') {
        const trimmedValue = value.trim();

        // SPECIAL RULE: If ID is 418, Rank is JR. SUPPLY CHAIN EXECUTIVE
        if (trimmedValue === '418') {
             nextFormData.designation = 'JR. SUPPLY CHAIN EXECUTIVE';
        } 
        // If we are navigating AWAY from 418 and had the special rank, reset to S/O
        else if (formData.cardNo.trim() === '418' && formData.designation === 'JR. SUPPLY CHAIN EXECUTIVE') {
             nextFormData.designation = 'S/O';
        }

        const found = employees.find(emp => emp.cardNo === trimmedValue);
        if (found) {
            nextFormData.name = found.name;
            // Only normalize designation if it is NOT the special 418 case
            if (trimmedValue !== '418') {
                const normalized = found.designation === 'LABOUR' ? 'LABOUR' : 'S/O';
                nextFormData.designation = normalized;
            }
        }
    }
    
    setFormData(nextFormData);

    // Autocomplete Logic
    if (name === 'name' || name === 'cardNo') {
      if (value.length > 0) {
        const lowerVal = value.toLowerCase();
        const filtered = employees.filter(emp => 
          emp.name.toLowerCase().includes(lowerVal) || 
          emp.cardNo.includes(lowerVal)
        );
        // Sort exact matches to top
        filtered.sort((a, b) => {
            const aExact = a.cardNo === value || a.name.toLowerCase() === lowerVal;
            const bExact = b.cardNo === value || b.name.toLowerCase() === lowerVal;
            return aExact === bExact ? 0 : aExact ? -1 : 1;
        });
        setSuggestions(filtered.slice(0, 10)); // Limit to 10
        setShowSuggestions(true);
      } else {
        setShowSuggestions(false);
      }
    }
  };

  const selectEmployee = (emp: Employee) => {
    let designation = emp.designation === 'LABOUR' ? 'LABOUR' : 'S/O';
    
    // Override for 418
    if (emp.cardNo === '418') {
        designation = 'JR. SUPPLY CHAIN EXECUTIVE';
    }

    setFormData({
      name: emp.name,
      cardNo: emp.cardNo,
      designation: designation,
      remarks: ''
    });
    setShowSuggestions(false);
  };

  const addEntry = () => {
    if (!formData.name || !formData.cardNo) return;

    const trimmedName = formData.name.trim();
    const trimmedCardNo = formData.cardNo.trim();

    // 1. Add to current bill
    const newItem: BillItem = {
      id: Date.now().toString() + Math.random(),
      name: trimmedName,
      cardNo: trimmedCardNo,
      designation: formData.designation,
      taka: currentTaka,
      remarks: formData.remarks
    };
    
    setBillItems(prev => {
        const newList = [...prev, newItem];
        // Sort: JR. SUPPLY CHAIN EXECUTIVE (0) > S/O (1) > Others (2)
        return newList.sort((a, b) => {
            const getPriority = (d: string) => {
                if (d === 'JR. SUPPLY CHAIN EXECUTIVE') return 0;
                if (d === 'S/O') return 1;
                return 2;
            };
            return getPriority(a.designation) - getPriority(b.designation);
        });
    });

    // 2. Update/Save to "Database" (Memory)
    const existingIndex = employees.findIndex(e => e.cardNo.trim() === trimmedCardNo);
    
    if (existingIndex === -1) {
      const newEmployee: Employee = {
        id: Date.now().toString(),
        name: trimmedName,
        cardNo: trimmedCardNo,
        designation: formData.designation,
        defaultTaka: currentTaka
      };
      setEmployees(prev => [...prev, newEmployee]);
    } else {
      setEmployees(prev => {
        const updated = [...prev];
        updated[existingIndex] = {
            ...updated[existingIndex],
            name: trimmedName,
            designation: formData.designation,
            defaultTaka: currentTaka
        };
        return updated;
      });
    }

    // Reset Form & Focus
    setFormData(prev => ({
      ...prev,
      name: '',
      cardNo: '',
      remarks: ''
    }));
    setShowSuggestions(false);
    // Handy: Auto focus back to name
    nameInputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        addEntry();
    }
  };

  const removeEntry = (id: string) => {
    setBillItems(billItems.filter(item => item.id !== id));
  };

  const handleGeneratePDF = async () => {
    if (billItems.length === 0) {
      alert("Please add at least one entry.");
      return;
    }
    const dateObj = new Date(billDate);
    const formattedDate = `${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getFullYear()).slice(-2)}`;
    
    await generateBillPDF(billType, formattedDate, billItems);
  };

  const exportDatabase = () => {
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Name,CardNo,Designation,DefaultTaka\n"
      + employees.map(e => `${e.name},${e.cardNo},${e.designation},${e.defaultTaka}`).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `tusuka_db_backup_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const importDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      const newEmployees: Employee[] = [];
      
      // Skip header
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = line.split(',');
        if (cols.length >= 3) {
          const name = cols[0].trim();
          const cardNo = cols[1].trim();
          const designation = cols[2].trim();
          const taka = cols[3] ? Number(cols[3]) : 0;

          const emp: Employee = {
            id: Date.now().toString() + Math.random().toString().slice(2),
            name,
            cardNo,
            designation,
            defaultTaka: taka
          };
          newEmployees.push(emp);
        }
      }

      const mergedMap = new Map<string, Employee>();
      employees.forEach(e => mergedMap.set(e.cardNo, e));
      newEmployees.forEach(e => mergedMap.set(e.cardNo, e));
      
      setEmployees(Array.from(mergedMap.values()));
      
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert(`Database updated! Total profiles: ${mergedMap.size}`);
    };
    reader.readAsText(file);
  };

  const totalTaka = useMemo(() => billItems.reduce((acc, curr) => acc + curr.taka, 0), [billItems]);

  return (
    <div className={`min-h-screen bg-gray-50/50 font-sans text-gray-900 pb-10`}>
      
      {/* Navbar / Header */}
      <div className={`bg-white border-b border-${themeColor}-100 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-opacity-95`}>
        <div className="max-w-7xl mx-auto px-4 py-2 flex justify-between items-center">
            <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 bg-${themeColor}-600 rounded-lg flex items-center justify-center text-white shadow-md shadow-${themeColor}-200`}>
                    <FileDown size={16} strokeWidth={3} />
                </div>
                <div>
                    <h1 className="text-base font-black uppercase tracking-tight text-gray-800 leading-none">Daily Bill Generator</h1>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Accurate • Efficient • Reliable</p>
                </div>
            </div>
            
            <div className={`flex items-center gap-3`}>
                
                 {/* Top Bar Config (Desktop) */}
                 <div className="hidden md:flex items-center gap-4 border-r border-gray-100 pr-4 mr-2">
                    {/* Date Selector */}
                    <div className="text-right group">
                         <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 group-hover:text-gray-500 transition-colors">Bill Date</label>
                         <input 
                            type="date" 
                            className={`bg-transparent text-right font-bold text-gray-700 outline-none cursor-pointer focus:text-${themeColor}-600 transition-colors text-xs w-full`}
                            value={billDate}
                            onChange={(e) => setBillDate(e.target.value)}
                        />
                    </div>

                    {/* Bill Type Selector */}
                    <div className="text-right relative group">
                        <label className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-0.5 group-hover:text-gray-500 transition-colors">Bill Type</label>
                        <div className="relative inline-flex items-center justify-end">
                             <select 
                                className={`appearance-none bg-transparent pr-4 text-right font-black text-${themeColor}-600 uppercase text-sm leading-none tracking-tight cursor-pointer outline-none hover:text-${themeColor}-700 transition-colors`}
                                value={billType}
                                onChange={(e) => setBillType(e.target.value as BillType)}
                            >
                                {Object.values(BillType).map(type => (
                                    <option key={type} value={type} className="text-sm font-bold text-gray-700">{type}</option>
                                ))}
                            </select>
                            <div className={`absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-${themeColor}-600`}>
                                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 9l6 6 6-6"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="text-right hidden sm:block">
                   <p className="text-[9px] uppercase font-bold text-gray-400">Total Payable</p>
                   <p className={`text-xl font-black text-${themeColor}-600 leading-none`}>{totalTaka}<span className="text-[10px] text-gray-400 ml-1">Tk</span></p>
                </div>
                <button 
                  onClick={handleGeneratePDF}
                  className={`bg-${themeColor}-600 hover:bg-${themeColor}-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-${themeColor}-200/50 transition-all active:scale-95`}
                >
                  <Save size={16} />
                  <span className="hidden sm:inline">Download PDF</span>
                </button>
            </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Sidebar: Controls */}
        <div className="lg:col-span-4 space-y-3">
          
          {/* Settings Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative group">
             {/* Decorative Top Bar */}
             <div className={`h-1 w-full bg-gradient-to-r from-${themeColor}-400 to-${themeColor}-600`}></div>
             
             <div className="p-3">
                <div className="flex justify-between items-center mb-2">
                   <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                     Configuration
                   </h2>
                   <button 
                     onClick={() => setShowSettings(!showSettings)}
                     className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200 text-gray-500 hover:text-${themeColor}-600 transition-all shadow-sm active:scale-95`}
                     title="Database Settings"
                   >
                     <Settings size={12} strokeWidth={2.5} />
                     <span className="text-[10px] font-bold">Settings</span>
                   </button>
                </div>

                {/* Hidden DB Tools */}
                {showSettings && (
                   <div className="mb-3 bg-slate-50 p-3 rounded-lg border border-slate-100 animate-in slide-in-from-top-2 fade-in duration-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold text-[10px] text-slate-500 uppercase">Database Memory</span>
                        <span className="bg-slate-200 text-slate-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold">{employees.length} Records</span>
                      </div>
                      <div className="flex gap-2">
                         <button onClick={exportDatabase} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 py-1.5 rounded-md text-[10px] font-semibold hover:border-slate-300 hover:shadow-sm transition-all text-slate-600">
                            <Database size={10} /> Export CSV
                         </button>
                         <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-1.5 bg-white border border-slate-200 py-1.5 rounded-md text-[10px] font-semibold hover:border-slate-300 hover:shadow-sm transition-all text-slate-600">
                            <Upload size={10} /> Import CSV
                         </button>
                         <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={importDatabase} />
                      </div>
                   </div>
                )}

                <div className="flex gap-3 md:hidden">
                   {/* Bill Type (60%) */}
                   <div className="w-[60%] space-y-1">
                     <label className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1">
                        <Briefcase size={9} /> Bill Type
                     </label>
                     <div className="relative">
                        <select 
                            className={`w-full py-2 px-2.5 text-xs bg-gray-50 border-gray-200 border rounded-md font-bold text-gray-700 outline-none focus:ring-2 focus:ring-${themeColor}-500/20 focus:border-${themeColor}-500 transition-all appearance-none cursor-pointer`}
                            value={billType}
                            onChange={(e) => setBillType(e.target.value as BillType)}
                        >
                            {Object.values(BillType).map(type => (
                            <option key={type} value={type}>{type}</option>
                            ))}
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                        </div>
                     </div>
                   </div>

                   {/* Date (40%) */}
                   <div className="w-[40%] space-y-1">
                     <label className="text-[9px] font-bold text-gray-400 uppercase flex items-center gap-1">
                        <Calendar size={9} /> Date
                     </label>
                     <input 
                        type="date" 
                        className={`w-full py-2 px-2.5 text-xs bg-gray-50 border-gray-200 border rounded-md font-bold text-gray-700 outline-none focus:ring-2 focus:ring-${themeColor}-500/20 focus:border-${themeColor}-500 transition-all`}
                        value={billDate}
                        onChange={(e) => setBillDate(e.target.value)}
                      />
                   </div>
                </div>

                {/* Info Pill */}
                <div className={`mt-2 bg-${themeColor}-50 border border-${themeColor}-100 rounded-lg p-2.5 flex items-start gap-2.5`}>
                    <div className={`p-1 bg-white rounded-full text-${themeColor}-600 shadow-sm mt-0.5`}>
                        {billType === BillType.NIGHT_ENTERTAINMENT ? <Moon size={12} /> : <Coffee size={12} />}
                    </div>
                    <div>
                        <p className={`text-[9px] font-bold text-${themeColor}-800 uppercase`}>Current Rate Policy</p>
                        <p className={`text-[10px] font-medium text-${themeColor}-600 mt-0.5 leading-tight`}>
                            {billType === BillType.TIFFIN && "Fixed Rate: 50 Tk"}
                            {billType === BillType.DAILY_LABOUR && "Fixed Rate: 600 Tk"}
                            {billType === BillType.HOLIDAY && "S/O & Exec: 800 Tk | Labour: 600 Tk"}
                            {billType === BillType.NIGHT_ENTERTAINMENT && `S/O: ${nightSoRate} Tk | Labour: 150 Tk`}
                            {billType !== BillType.TIFFIN && billType !== BillType.NIGHT_ENTERTAINMENT && billType !== BillType.DAILY_LABOUR && billType !== BillType.HOLIDAY && "Manual Entry Mode"}
                        </p>
                    </div>
                </div>
             </div>
          </div>

          {/* Input Card */}
          <div className="bg-white rounded-xl shadow-md shadow-gray-200/50 border border-gray-100 overflow-hidden relative">
            <div className="p-3">
                <h2 className="text-xs font-bold text-gray-800 uppercase mb-2 flex items-center gap-2">
                  <div className={`w-5 h-5 rounded bg-${themeColor}-100 text-${themeColor}-600 flex items-center justify-center`}>
                    <Plus size={12} strokeWidth={3} />
                  </div>
                  New Entry
                </h2>

                <div className="space-y-3">
                    {/* Horizontal Inputs */}
                    <div className="flex gap-2 relative items-start">
                        {/* Name (40%) */}
                        <div className="w-[40%] space-y-0.5">
                            <label className="text-[9px] font-bold text-gray-400 uppercase">Name</label>
                            <div className="relative group">
                                <User className="absolute left-2.5 top-2 text-gray-400 group-focus-within:text-gray-600 transition-colors" size={12} />
                                <input 
                                    ref={nameInputRef}
                                    name="name"
                                    type="text" 
                                    autoComplete="off"
                                    className={`w-full pl-8 pr-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-${themeColor}-500/20 focus:border-${themeColor}-500 transition-all font-semibold text-gray-800 placeholder:text-gray-300`}
                                    placeholder="Name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                />
                                {showSuggestions && suggestions.length > 0 && (
                                    <div className="absolute top-full left-0 z-20 w-[240px] bg-white border border-gray-100 shadow-xl rounded-xl mt-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                                    <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-100 text-[9px] font-bold text-gray-400 uppercase">Suggestions</div>
                                    <div className="max-h-56 overflow-y-auto">
                                        {suggestions.map(emp => (
                                            <div 
                                            key={emp.id} 
                                            className={`px-3 py-1.5 hover:bg-${themeColor}-50 cursor-pointer border-b border-gray-50 last:border-0 group`}
                                            onClick={() => selectEmployee(emp)}
                                            >
                                            <div className="flex justify-between items-center">
                                                <span className={`font-bold text-gray-700 group-hover:text-${themeColor}-700 text-xs`}>{emp.name}</span>
                                                <span className="text-[9px] bg-gray-100 px-1 py-0.5 rounded text-gray-500 font-mono">{emp.cardNo}</span>
                                            </div>
                                            <div className="text-[9px] text-gray-400 mt-0.5">{emp.designation}</div>
                                            </div>
                                        ))}
                                    </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Card (25%) */}
                        <div className="w-[25%] space-y-0.5">
                            <label className="text-[9px] font-bold text-gray-400 uppercase">Card No</label>
                            <div className="relative group">
                                <div className="absolute left-2.5 top-2 text-gray-400 font-mono text-[10px]">#</div>
                                <input 
                                    name="cardNo"
                                    type="text" 
                                    className={`w-full pl-6 pr-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-${themeColor}-500/20 focus:border-${themeColor}-500 transition-all font-mono font-medium text-gray-700 placeholder:text-gray-300`}
                                    placeholder="000"
                                    value={formData.cardNo}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                />
                            </div>
                        </div>

                        {/* Desig (35%) */}
                        <div className="w-[35%] space-y-0.5">
                            <label className="text-[9px] font-bold text-gray-400 uppercase">Rank</label>
                            <div className="relative">
                                <select 
                                    name="designation"
                                    className={`w-full px-2 py-1.5 text-xs border border-gray-200 rounded-md outline-none focus:ring-2 focus:ring-${themeColor}-500/20 focus:border-${themeColor}-500 transition-all font-medium text-gray-700 bg-white appearance-none cursor-pointer`}
                                    value={formData.designation}
                                    onChange={handleInputChange}
                                >
                                    <option value="S/O">S/O</option>
                                    <option value="LABOUR">LABOUR</option>
                                    {/* Special option for ID 418 */}
                                    {formData.cardNo === '418' && (
                                        <option value="JR. SUPPLY CHAIN EXECUTIVE">JR. SUPPLY CHAIN EXECUTIVE</option>
                                    )}
                                </select>
                            </div>
                        </div>
                    </div>

                     {/* Special Rate Toggles for Night Bill */}
                    {billType === BillType.NIGHT_ENTERTAINMENT && formData.designation === 'S/O' && (
                        <div className="bg-orange-50 border border-orange-100 rounded-md p-2 flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1">
                            <span className="text-[9px] font-bold text-orange-400 uppercase">Overtime Rate Selection</span>
                            <div className="flex gap-2">
                                {[350, 250].map((rate) => (
                                    <label key={rate} className={`flex-1 cursor-pointer border ${nightSoRate === rate ? 'border-orange-500 bg-orange-100 text-orange-700' : 'border-orange-200 bg-white text-gray-500'} rounded-md py-1 text-center transition-all`}>
                                        <input type="radio" className="hidden" checked={nightSoRate === rate} onChange={() => setNightSoRate(rate)} />
                                        <span className="text-[10px] font-bold">{rate} Tk</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    <button 
                        onClick={addEntry}
                        className={`w-full bg-gray-900 hover:bg-black text-white py-2 rounded-lg font-bold text-xs shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 mt-1`}
                    >
                        <Plus size={14} /> Add to List
                    </button>
                    <p className="text-[9px] text-center text-gray-400 font-medium">Press <span className="bg-gray-100 px-1 rounded text-gray-600 border border-gray-200">Enter</span> to add quickly</p>
                </div>
            </div>
          </div>
        </div>

        {/* Right Content: Table */}
        <div className="lg:col-span-8 flex flex-col min-h-[500px]">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
                {/* Table Header */}
                <div className="px-3 py-2 border-b border-gray-100 bg-white flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-4 bg-${themeColor}-500 rounded-full`}></div>
                        <h3 className="font-bold text-gray-800 text-sm">Bill Items</h3>
                        <span className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{billItems.length}</span>
                    </div>
                    {billItems.length > 0 && (
                        <button 
                            onClick={() => setBillItems([])}
                            className="text-red-500 hover:bg-red-50 px-2 py-1 rounded-md text-[10px] font-bold transition-colors flex items-center gap-1"
                        >
                            <Trash2 size={12} /> Clear All
                        </button>
                    )}
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-auto bg-gray-50/30">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider w-10 text-center">SL</th>
                                <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Employee Name</th>
                                <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Card No</th>
                                <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider">Designation</th>
                                <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-right">Amount</th>
                                <th className="px-3 py-2 text-[9px] font-bold text-gray-400 uppercase tracking-wider text-center w-12">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {billItems.length === 0 ? (
                                <tr>
                                    <td colSpan={6}>
                                        <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                                            <Search size={32} strokeWidth={1} className="mb-2 text-gray-200" />
                                            <p className="text-xs font-medium text-gray-400">List is empty</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                billItems.map((item, idx) => (
                                    <tr key={item.id} className="group hover:bg-white hover:shadow-sm transition-all bg-white/50 even:bg-gray-50/50">
                                        <td className="px-3 py-1.5 text-center text-[10px] font-mono text-gray-400 font-medium">{String(idx + 1).padStart(2, '0')}</td>
                                        <td className="px-3 py-1.5">
                                            <div className="font-bold text-gray-700 text-xs group-hover:text-gray-900">{item.name}</div>
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <div className="inline-block bg-gray-100 px-1.5 py-0.5 rounded-[4px] text-[10px] font-mono font-medium text-gray-600 group-hover:bg-gray-200 transition-colors">
                                                {item.cardNo}
                                            </div>
                                        </td>
                                        <td className="px-3 py-1.5">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.designation === 'S/O' ? `bg-${themeColor}-50 text-${themeColor}-600` : item.designation.includes('EXECUTIVE') ? `bg-${themeColor}-100 text-${themeColor}-700` : 'bg-gray-100 text-gray-500'}`}>
                                                {item.designation}
                                            </span>
                                        </td>
                                        <td className="px-3 py-1.5 text-right">
                                            <span className="font-bold text-gray-700 text-xs">{item.taka}</span>
                                        </td>
                                        <td className="px-3 py-1.5 text-center">
                                            <button 
                                                onClick={() => removeEntry(item.id)}
                                                className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 bg-red-50 hover:bg-red-100 transition-all active:scale-95"
                                                title="Remove Entry"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Totals */}
                <div className="bg-white border-t border-gray-100 p-3">
                    <div className="flex justify-end items-center gap-4">
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Count</p>
                            <p className="text-xs font-bold text-gray-700">{billItems.length}</p>
                        </div>
                        <div className={`h-6 w-px bg-gray-200`}></div>
                        <div className="text-right">
                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Total Amount</p>
                            <p className={`text-lg font-black text-${themeColor}-600`}>{totalTaka} <span className="text-[10px] text-gray-400">Tk</span></p>
                        </div>
                    </div>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default App;