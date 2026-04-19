/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { auth, db } from './lib/firebase';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, addDoc, serverTimestamp, getDoc, orderBy, deleteDoc, getDocs } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar as CalendarIcon, CheckCircle2, AlertTriangle, User as UserIcon, List, LogOut, Plus, Trash2, Home, Wind, Coffee, Zap, Droplets, Settings, Key } from 'lucide-react';
import { Button, Card, Input } from './components/ui/BrutalComponents';
import { ROOMMATES, CHORES, UserRole, CHORE_CYCLES, FINES } from './constants';
import { format, addDays, isPast, startOfToday, endOfDay, isWeekend, getDay } from 'date-fns';
import { cn } from './lib/utils';

// --- Types ---
interface Task {
  id: string;
  choreId: string;
  assignedTo: string;
  status: 'pending' | 'completed' | 'missed';
  deadline: any;
  completedAt?: any;
}

interface Violation {
  id: string;
  reportedBy: string;
  violatorId: string;
  type: string;
  description: string;
  fineAmount: number;
  status: 'pending' | 'accepted' | 'revoked';
  appeal?: string;
  isPaid?: boolean;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  name: string;
  role: UserRole;
  totalFines: number;
  warningPoints: number;
  avatar: string;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [violations, setViolations] = useState<Violation[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'calendar' | 'violations' | 'admin' | 'profile'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());

  // --- Auth & Profile Sync ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // 1. Ensure default accounts exist in Firestore immediately
    setupDefaults();

    // 2. Check local storage for persistent login
    const savedUser = localStorage.getItem('hv_user');
    if (savedUser) {
      const u = JSON.parse(savedUser);
      setUser(u);
    }
  }, []);

  useEffect(() => {
    if (user) {
      const userRef = doc(db, 'users', user.username);
      const unsub = onSnapshot(userRef, (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      });
      return () => unsub();
    } else {
      setProfile(null);
    }
  }, [user]);

  const setupDefaults = async () => {
    const creds: Record<string, any> = {
      faeyza: { name: 'Faeyza', role: 'admin', pass: 'eyza0304' },
      igun: { name: 'Igun', role: 'member', pass: 'igun123' },
      ilya: { name: 'Ilya', role: 'member', pass: 'ilya123' },
      ryuta: { name: 'Ryuta', role: 'member', pass: 'ryuta123' }
    };

    for (const [uname, data] of Object.entries(creds)) {
      const uRef = doc(db, 'users', uname);
      const snap = await getDoc(uRef);
      if (!snap.exists()) {
        await setDoc(uRef, {
          uid: uname,
          name: data.name,
          role: data.role,
          password: data.pass,
          totalFines: 0,
          warningPoints: 0,
          avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${uname}`
        });
      }
    }
  };

  // --- Data Listening ---
  useEffect(() => {
    if (!user) return;

    const qTasks = query(collection(db, 'tasks'), orderBy('deadline', 'asc'));
    const unsubTasks = onSnapshot(qTasks, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() } as Task)));
    });

    const qViolations = query(collection(db, 'violations'), orderBy('createdAt', 'desc'));
    const unsubViolations = onSnapshot(qViolations, (snap) => {
      setViolations(snap.docs.map(d => ({ id: d.id, ...d.data() } as Violation)));
    });

    const qUsers = query(collection(db, 'users'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setAllUsers(snap.docs.map(d => d.data() as UserProfile));
    });

    return () => {
      unsubTasks();
      unsubViolations();
      unsubUsers();
    };
  }, [user]);

  // --- Actions ---
  const handleLogin = (u: any) => {
    setUser(u);
    localStorage.setItem('hv_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('hv_user');
    setActiveTab('dashboard');
    try {
      auth.signOut();
    } catch (e) {}
  };

  const deleteUser = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e) {
      console.error("Failed to delete user", e);
    }
  };

  const completeTask = async (taskId: string) => {
    const taskRef = doc(db, 'tasks', taskId);
    const taskSnap = await getDoc(taskRef);
    
    if (taskSnap.exists()) {
      const taskData = taskSnap.data();
      
      await updateDoc(taskRef, {
        status: 'completed',
        completedAt: serverTimestamp()
      });

      // Special logic for Wet Trash: Reset the deadline for another 2 days for the same person
      if (taskData.choreId === 'trash_wet') {
        const nextDeadline = addDays(new Date(), 2);
        await addDoc(collection(db, 'tasks'), {
          choreId: 'trash_wet',
          assignedTo: taskData.assignedTo,
          status: 'pending',
          deadline: nextDeadline,
          createdAt: serverTimestamp()
        });
      }
      
      // Special logic for Dry Trash: It's an ongoing monitoring task, 
      // let's just make it stay active or behave similarly? 
      // User says "reminder to check throughout the week"
      // If they "confirm" it, we should probably respawn the "check bin" task
      if (taskData.choreId === 'trash_dry') {
         await addDoc(collection(db, 'tasks'), {
          choreId: 'trash_dry',
          assignedTo: taskData.assignedTo,
          status: 'pending',
          deadline: addDays(new Date(), 7), // Just a weekly "monitoring" slot
          createdAt: serverTimestamp()
        });
      }
    }
  };

  const reportViolation = async (violatorId: string, type: string, fine: number, desc: string) => {
    if (!profile) return;
    await addDoc(collection(db, 'violations'), {
      reportedBy: profile.uid,
      violatorId,
      type,
      description: desc,
      fineAmount: fine,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  };

  const submitAppeal = async (violationId: string, appealText: string) => {
    await updateDoc(doc(db, 'violations', violationId), {
      appeal: appealText
    });
  };

  const resolveViolation = async (v: Violation, accepted: boolean) => {
    if (profile?.role !== 'admin') return;
    await updateDoc(doc(db, 'violations', v.id), {
      status: accepted ? 'accepted' : 'revoked',
      isPaid: accepted ? false : null
    });
    
    if (accepted) {
      // Add fine to user
      const userRef = doc(db, 'users', v.violatorId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentData = userSnap.data() as UserProfile;
        await updateDoc(userRef, {
          totalFines: currentData.totalFines + v.fineAmount,
          warningPoints: currentData.warningPoints + 1
        });
      }
    }
  };

  const togglePaymentStatus = async (v: Violation) => {
    if (profile?.role !== 'admin') return;
    await updateDoc(doc(db, 'violations', v.id), {
      isPaid: !v.isPaid
    });
  };

  // --- Render Helpers ---
  const renderSidebar = () => {
    const violationsBadge = violations.filter(v => {
      if (profile?.role === 'admin') {
        return v.status === 'pending' || (v.status === 'accepted' && !v.isPaid);
      } else {
        return v.violatorId === profile?.uid && v.status === 'pending' && !v.appeal;
      }
    }).length;

    return (
      <motion.div 
        initial={{ x: -240 }}
        animate={{ x: sidebarOpen ? 0 : -240 }}
        className="fixed inset-y-0 left-0 w-[240px] bg-[#00E5FF] border-r-4 border-black z-50 flex flex-col shadow-[8px_0_0_0_rgba(0,0,0,1)]"
      >
        <div className="p-6 border-b-4 border-black bg-black text-white">
          <h1 className="text-2xl font-black italic uppercase tracking-tighter leading-tight">Home Tasks</h1>
        </div>

        <nav className="flex flex-col flex-1 overflow-y-auto">
          <NavButton icon="🏠" label="Daily Tasks" active={activeTab === 'dashboard'} onClick={() => { setActiveTab('dashboard'); setSidebarOpen(false); }} />
          <NavButton icon="📅" label="Calendar" active={activeTab === 'calendar'} onClick={() => { setActiveTab('calendar'); setSidebarOpen(false); }} />
          <NavButton 
            icon="⚠️" 
            label="Violations" 
            active={activeTab === 'violations'} 
            onClick={() => { setActiveTab('violations'); setSidebarOpen(false); }} 
            badge={violationsBadge}
          />
          <NavButton icon="👤" label="My Profile" active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }} />
          {profile?.role === 'admin' && (
            <NavButton icon="⚙️" label="Admin Panel" active={activeTab === 'admin'} onClick={() => { setActiveTab('admin'); setSidebarOpen(false); }} />
          )}
        </nav>

        <div className="p-4 mt-auto border-t-4 border-black">
          <div className="bg-[#FFDE00] border-3 border-black p-3 font-extrabold text-center">
            <div className="text-[10px] uppercase tracking-wider">AC STATUS</div>
            <div className="text-xl uppercase">{isACAllowed() ? "ALLOWED" : "FORBIDDEN"}</div>
            <div className="text-[9px] opacity-70 uppercase">On: 8PM | Off: 6:30AM</div>
          </div>
        </div>
      </motion.div>
    );
  };

  const NavButton = ({ icon, label, active, onClick, badge }: { icon: string, label: string, active: boolean, onClick: () => void, badge?: number }) => (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-5 font-extrabold uppercase transition-colors border-b-3 border-black text-left relative",
        active ? "bg-white text-black" : "hover:bg-[#FFDE00]"
      )}
    >
      <span className="text-xl">{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-4 top-1/2 -translate-y-1/2 bg-[#FF0055] text-white text-[10px] px-1.5 py-0.5 border-2 border-black font-black flex items-center justify-center min-w-[20px]">
          {badge}
        </span>
      )}
    </button>
  );

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#F0F0F0] flex items-center justify-center font-sans uppercase font-black italic text-4xl">
        Loading Profile...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0F0] text-black font-sans pb-20">
      {renderSidebar()}
      
      {/* Header */}
      <header className="h-20 p-4 border-b-4 border-black bg-white flex items-center justify-between sticky top-0 z-40 px-6">
        <div className="flex items-center gap-4 flex-1">
          <button onClick={() => setSidebarOpen(true)} className="p-2 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-[#00E5FF] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-transform">
            <List size={20} />
          </button>
          <div className="hidden lg:block">
            <span className="font-black uppercase text-[10px]">Active User: </span>
            <span className="bg-[#FFDE00] px-2 py-1 border-2 border-black font-black uppercase text-xs">
              {profile?.name}
            </span>
          </div>
        </div>

        {/* Date & Time Center */}
        <div className="flex flex-col items-center justify-center flex-1">
            <div className="bg-black text-[#00FF55] px-4 py-1 border-2 border-black font-mono font-bold shadow-[4px_4px_0_0_#000] text-sm">
                {format(currentTime, 'eee, dd MMM yyyy')}
            </div>
            <div className="text-[10px] font-black uppercase tracking-widest mt-1">
                {format(currentTime, 'HH:mm:ss')}
            </div>
        </div>
        
        <div className="flex justify-end flex-1">
            <Button variant="white" className="p-2 px-4 shadow-[4px_4px_0_0_#000] text-xs" onClick={handleLogout}>
                LOGOUT
            </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-4 max-w-4xl mx-auto">
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && <Dashboard tasks={tasks} violations={violations} profile={profile!} onComplete={completeTask} onReport={reportViolation} allUsers={allUsers} />}
          {activeTab === 'calendar' && <CalendarView tasks={tasks} />}
          {activeTab === 'violations' && (
            <ViolationsView 
              violations={violations} 
              profile={profile!} 
              onResolve={resolveViolation} 
              onAppeal={submitAppeal} 
              onTogglePayment={togglePaymentStatus}
              allUsers={allUsers} 
            />
          )}
          {activeTab === 'profile' && <ProfileSettings profile={profile!} />}
          {activeTab === 'admin' && profile?.role === 'admin' && <AdminPanel allUsers={allUsers} tasks={tasks} chores={CHORES} onDeleteUser={deleteUser} onResetPassword={(uid: string, pass: string) => updateDoc(doc(db, 'users', uid), { password: pass })} />}
        </AnimatePresence>
      </main>
      
      {/* Footer Hint */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-30">
        <Card className="py-1 px-3 bg-[#00FF00] text-xs font-black shadow-[4px_4px_0_0_#000]">
          AC ALLOWED: 8PM - 6:30AM
        </Card>
      </div>
    </div>
  );
}

// --- Sub-views ---

function Dashboard({ tasks, profile, onComplete, onReport, allUsers }: any) {
  const [showReportModal, setShowReportModal] = useState(false);
  const myTasks = tasks.filter((t: any) => t.assignedTo === profile.uid && t.status === 'pending');

  const isWeekendNow = () => {
    const today = getDay(new Date());
    return today === 6 || today === 0; // 6 = Saturday, 0 = Sunday
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
      <section>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <CheckCircle2 /> My Active Tasks
          </h3>
          <span className="bg-black text-white px-2 py-1 text-xs font-bold">{myTasks.length} PENDING</span>
        </div>
        
        {myTasks.length === 0 ? (
          <Card className="text-center py-10 bg-white">
            <p className="font-bold opacity-30 italic">No tasks for today! Enjoy your rest.</p>
          </Card>
        ) : (
          <div className="grid gap-4">
            {myTasks.map((t: any) => {
              const chore = CHORES[t.choreId] || { title: 'Unknown Chore', fine: 5, type: 'on-demand' };
              const isWeekendTask = chore.type === 'weekly';
              const canClickDone = !isWeekendTask || isWeekendNow();

              return (
                <Card key={t.id} className="flex items-center justify-between group hover:translate-x-1 hover:-translate-y-1 transition-transform">
                  <div>
                    <h4 className="text-xl font-bold uppercase">{chore.title}</h4>
                    <p className="text-xs font-medium text-gray-500 uppercase">Deadline: {format(t.deadline.toDate(), 'eee do MMM, hh:mm a')}</p>
                  </div>
                  {canClickDone ? (
                    <Button variant="primary" onClick={() => onComplete(t.id)}>Done</Button>
                  ) : (
                    <div className="bg-[#FFE600] border-2 border-black px-2 py-1 text-[10px] font-black uppercase text-center flex flex-col items-center">
                      <span className="text-black">Task hasn't started</span>
                      <span className="opacity-50">(Weekend Only)</span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h3 className="text-2xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
          <AlertTriangle /> Report Issue
        </h3>
        <Card className="bg-[#FF00E5] text-white">
          <p className="font-bold mb-4 uppercase">See a violation? Don't let it slide!</p>
          <Button variant="secondary" onClick={() => setShowReportModal(true)} className="w-full">Report Now!</Button>
        </Card>
      </section>

      <AnimatePresence>
        {showReportModal && (
          <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
              <ReportModal onClose={() => setShowReportModal(false)} onSubmit={onReport} allUsers={allUsers} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <section className="mt-8 grid grid-cols-2 gap-4">
          <Card className="bg-[#00F0FF]">
              <div className="flex flex-col items-center gap-2">
                  <Wind size={32} />
                  <span className="text-xs font-black uppercase">AC Status</span>
                  <span className="font-bold uppercase">{isACAllowed() ? "Allowed" : "Prohibited"}</span>
              </div>
          </Card>
          <Card className="bg-[#FFE600]">
              <div className="flex flex-col items-center gap-2">
                  <Droplets size={32} />
                  <span className="text-xs font-black uppercase">Trash Status</span>
                  <span className="font-bold uppercase">Check Bin</span>
              </div>
          </Card>
      </section>
    </motion.div>
  );
}

function isACAllowed() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeInMins = hours * 60 + minutes;

    const startMins = 20 * 60; // 8 PM
    const endMins = 6 * 60 + 30; // 6:30 AM

    // If current time is after 8PM or before 6:30AM
    return timeInMins >= startMins || timeInMins <= endMins;
}

function ReportModal({ onClose, onSubmit, allUsers }: any) {
  const [violator, setViolator] = useState('');
  const [type, setType] = useState('dish_spoon');
  const [desc, setDesc] = useState('');

  const types = [
    { id: 'dish_spoon', label: 'Dish: Spoon/Fork (RM 2)', fine: 2 },
    { id: 'dish_others', label: 'Dish: Plate/Bowl (RM 5)', fine: 5 },
    { id: 'dish_cookware', label: 'Dish: Cookware (RM 7)', fine: 7 },
    { id: 'ac_violation', label: 'AC Misuse (RM 7)', fine: 7 },
    { id: 'dirty_bin', label: 'Overflowing Bin (RM 5)', fine: 5 },
  ];

  return (
    <Card className="max-w-md w-full flex flex-col gap-4">
      <h3 className="text-2xl font-black uppercase tracking-tight">Report Violation</h3>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-black uppercase block mb-1">Violator</label>
          <select 
            value={violator} 
            onChange={e => setViolator(e.target.value)}
            className="w-full p-2 border-2 border-black font-bold outline-none"
          >
            <option value="">Select User</option>
            {allUsers.map((u: any) => <option key={u.uid} value={u.uid}>{u.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-black uppercase block mb-1">Violation Type</label>
          <select 
            value={type} 
            onChange={e => setType(e.target.value)}
            className="w-full p-2 border-2 border-black font-bold outline-none"
          >
            {types.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-black uppercase block mb-1">Details</label>
          <Input placeholder="e.g. Left unwashed spoon in sink" value={desc} onChange={e => setDesc(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="accent" className="flex-1" onClick={() => {
          const selected = types.find(t => t.id === type);
          onSubmit(violator, type, selected?.fine || 0, desc);
          onClose();
        }}>Submit</Button>
      </div>
    </Card>
  );
}

function ViolationsView({ violations, profile, onResolve, onAppeal, onTogglePayment, allUsers }: any) {
  const [appealText, setAppealText] = useState('');
  const [appealingId, setAppealingId] = useState<string | null>(null);

  // Calculate summary
  const acceptedViolations = violations.filter((v: any) => v.status === 'accepted');
  const fineSummary = allUsers.map((u: any) => {
    const userFines = acceptedViolations.filter((v: any) => v.violatorId === u.uid);
    const total = userFines.reduce((acc: number, v: any) => acc + v.fineAmount, 0);
    const unpaid = userFines.filter((v: any) => !v.isPaid).reduce((acc: number, v: any) => acc + v.fineAmount, 0);
    return { name: u.name, total, unpaid, avatar: u.avatar };
  }).filter((s: any) => s.total > 0);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <h3 className="text-3xl font-black uppercase tracking-tight mb-4">Resident Rap Sheet</h3>
      
      {/* Fine Summary Box */}
      {fineSummary.length > 0 && (
        <Card className="bg-[#FFDE00] border-4 border-black shadow-[8px_8px_0_0_#000]">
          <h4 className="text-lg font-black uppercase mb-3 flex items-center gap-2">
            <Zap size={20} className="fill-black" /> Fine Leaderboard
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fineSummary.map((s: any) => (
              <div key={s.name} className="flex items-center justify-between bg-white/50 p-2 border-2 border-black">
                <div className="flex items-center gap-2">
                  <img src={s.avatar} className="w-8 h-8 border-2 border-black" />
                  <span className="font-black text-xs uppercase">{s.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase opacity-50">Total Fine</p>
                  <p className="font-black text-[#FF0055]">RM {s.total}</p>
                  {s.unpaid > 0 && <p className="text-[8px] font-black uppercase text-[#FF3D00]">Unpaid: RM {s.unpaid}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6">
        {violations.map((v: any) => {
          const violator = allUsers.find((u: any) => u.uid === v.violatorId);
          const reporter = allUsers.find((u: any) => u.uid === v.reportedBy);
          
          return (
            <Card key={v.id} className={cn("relative overflow-hidden", v.status === 'revoked' && "opacity-50 grayscale")}>
              <div className="flex items-start justify-between">
                <div className="flex gap-4">
                  <img src={violator?.avatar} className="w-16 h-16 border-4 border-black" />
                  <div>
                    <h4 className="text-xl font-bold uppercase">{violator?.name}</h4>
                    <p className="text-xs font-black bg-black text-white px-1 inline-block uppercase mb-2">{v.type.replace('_', ' ')}</p>
                    <p className="text-sm font-medium">{v.description}</p>
                    <p className="text-[10px] text-gray-500 uppercase mt-1">Reported by: {reporter?.name}</p>
                  </div>
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <div className="flex flex-col items-end">
                    <p className="text-2xl font-black italic text-[#FF0055]">RM {v.fineAmount}</p>
                    {v.status === 'accepted' && (
                      <div className={cn(
                        "text-[10px] font-black uppercase px-2 py-0.5 border-2 border-black mt-1",
                        v.isPaid ? "bg-[#7CFF01] text-black" : "bg-[#FFDE00] text-black"
                      )}>
                        {v.isPaid ? 'PAID ✓' : 'NOT PAID'}
                      </div>
                    )}
                  </div>
                  <p className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 border-2 border-black",
                    v.status === 'pending' ? "bg-[#FFDE00]" : v.status === 'accepted' ? "bg-[#FF3D00] text-white" : "bg-[#7CFF01]"
                  )}>
                    {v.status}
                  </p>
                </div>
              </div>

              {v.appeal && (
                <div className="mt-4 p-3 bg-gray-100 border-l-4 border-black font-medium text-sm italic">
                  " {v.appeal} "
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2">
                <div className="flex gap-2">
                  {v.violatorId === profile.uid && v.status === 'pending' && !v.appeal && !appealingId && (
                    <Button variant="secondary" className="w-full text-xs" onClick={() => setAppealingId(v.id)}>Appeal</Button>
                  )}
                  {profile.role === 'admin' && v.status === 'pending' && (
                    <>
                      <Button variant="primary" className="flex-1 text-xs" onClick={() => onResolve(v, true)}>Accept</Button>
                      <Button variant="secondary" className="flex-1 text-xs" onClick={() => onResolve(v, false)}>Revoke</Button>
                    </>
                  )}
                </div>

                {/* Admin Payment Toggle */}
                {profile.role === 'admin' && v.status === 'accepted' && (
                  <Button 
                    variant="white" 
                    className={cn(
                      "w-full text-[10px] py-1 border-black border-2 shadow-[2px_2px_0_0_#000] uppercase font-black",
                      v.isPaid ? "hover:bg-red-50" : "hover:bg-green-50"
                    )}
                    onClick={() => onTogglePayment(v)}
                  >
                    {v.isPaid ? "Mark as UNPAID" : "Mark as PAID"}
                  </Button>
                )}
              </div>

              {appealingId === v.id && (
                <div className="mt-4 flex flex-col gap-2">
                  <Input placeholder="Write your excuse..." value={appealText} onChange={e => setAppealText(e.target.value)} />
                  <div className="flex gap-2">
                    <Button variant="primary" className="flex-1 text-xs" onClick={() => { onAppeal(v.id, appealText); setAppealingId(null); setAppealText(''); }}>Submit Appeal</Button>
                    <Button variant="secondary" className="flex-1 text-xs" onClick={() => setAppealingId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}

function CalendarView({ tasks }: any) {
  const futureTasks = tasks.filter((t: any) => !isPast(t.deadline.toDate()));
  
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <h3 className="text-3xl font-black uppercase tracking-tight">Shared Schedule</h3>
      <div className="space-y-4">
        {futureTasks.map((t: any) => (
          <div key={t.id} className="flex gap-4 items-center">
            <div className="flex flex-col items-center justify-center w-16 h-16 bg-white border-4 border-black text-center shadow-[4px_4px_0_0_#000]">
              <span className="text-xs font-black uppercase">{format(t.deadline.toDate(), 'EEE')}</span>
              <span className="text-2xl font-black">{format(t.deadline.toDate(), 'd')}</span>
            </div>
            <Card className="flex-1 flex justify-between items-center py-2">
              <div>
                <h4 className="font-black uppercase">{CHORES[t.choreId]?.title || 'Chore'}</h4>
                <p className="text-xs font-medium text-gray-500 uppercase">{format(t.deadline.toDate(), 'hh:mm a')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase text-gray-400">Assignee</span>
                <img src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${t.assignedTo}`} className="w-8 h-8 rounded-full border-2 border-black" />
              </div>
            </Card>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function ProfileSettings({ profile }: { profile: UserProfile }) {
  const [newPass, setNewPass] = useState('');
  const [msg, setMsg] = useState('');

  const updatePassword = async () => {
    if (newPass.length < 4) {
      setMsg('Password too short!');
      return;
    }
    await updateDoc(doc(db, 'users', profile.uid), { password: newPass });
    setMsg('Password updated successfully!');
    setNewPass('');
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <h3 className="text-3xl font-black uppercase tracking-tight">Profile Settings</h3>
      <Card className="flex flex-col gap-4">
        <div className="flex items-center gap-4 border-b-2 border-black pb-4">
          <img src={profile.avatar} className="w-20 h-20 border-4 border-black bg-white" />
          <div>
            <p className="text-2xl font-black uppercase">{profile.name}</p>
            <p className="text-sm font-bold opacity-50 uppercase">{profile.role}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <h4 className="text-xl font-black uppercase flex items-center gap-2">
            <Key size={20} /> Change Password
          </h4>
          <div className="flex flex-col gap-1">
            <Input 
              type="password" 
              placeholder="Enter New Password" 
              value={newPass} 
              onChange={e => setNewPass(e.target.value)} 
            />
          </div>
          <Button variant="primary" onClick={updatePassword}>Save New Password</Button>
          {msg && <p className="text-xs font-black uppercase text-[#FF0055]">{msg}</p>}
        </div>
      </Card>
    </motion.div>
  );
}

function AdminPanel({ allUsers, tasks, chores, onResetPassword, onDeleteUser }: any) {
  const [loading, setLoading] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newPass, setNewPass] = useState('');
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);

  const factoryReset = async () => {
    setLoading(true);
    try {
      // 1. Clear Tasks
      const tasksSnap = await getDocs(query(collection(db, 'tasks')));
      const taskDeletes = tasksSnap.docs.map(d => deleteDoc(doc(db, 'tasks', d.id)));
      
      // 2. Clear Violations
      const violationsSnap = await getDocs(query(collection(db, 'violations')));
      const violationDeletes = violationsSnap.docs.map(d => deleteDoc(doc(db, 'violations', d.id)));

      // 3. Reset User Stats
      const usersSnap = await getDocs(query(collection(db, 'users')));
      const userResets = usersSnap.docs.map(d => updateDoc(doc(db, 'users', d.id), {
        totalFines: 0,
        warningPoints: 0
      }));

      await Promise.all([...taskDeletes, ...violationDeletes, ...userResets]);
      setIsConfirmingReset(false);
      alert("System has been FACTORY RESET. All data cleared.");
    } catch (e) {
      console.error(e);
      alert("Factory reset failed. Check console for details.");
    }
    setLoading(false);
  };

  const generateWeeklyTasks = async () => {
    setLoading(true);
    // Rough simulation of task generation for next Sunday
    const sunday = addDays(startOfToday(), (7 - getDay(startOfToday())) % 7);
    const deadline = endOfDay(sunday);
    deadline.setHours(22, 0, 0, 0); // 10 PM

    for (const [id, chore] of Object.entries(chores)) {
      const c = chore as any;
      if (c.type === 'weekly') {
        await addDoc(collection(db, 'tasks'), {
          choreId: id,
          assignedTo: c.cycle[0], 
          status: 'pending',
          deadline: deadline,
          createdAt: serverTimestamp()
        });
      }

      // Special logic for Wet Trash starting this week
      if (id === 'trash_wet') {
        await addDoc(collection(db, 'tasks'), {
          choreId: id,
          assignedTo: c.cycle[0], 
          status: 'pending',
          deadline: addDays(new Date(), 2), // 2-day initial deadline
          createdAt: serverTimestamp()
        });
      }

      // Special logic for Dry Trash monitoring
      if (id === 'trash_dry') {
        await addDoc(collection(db, 'tasks'), {
          choreId: id,
          assignedTo: c.cycle[0], 
          status: 'pending',
          deadline: deadline, // Weekly monitoring deadline
          createdAt: serverTimestamp()
        });
      }
    }

    setLoading(false);
    alert("New weekly tasks generated!");
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
      <h3 className="text-3xl font-black uppercase tracking-tight">Command Center</h3>
      <Card className="bg-[#FFDE00] flex flex-col gap-4">
          <div>
            <h4 className="text-xl font-black uppercase mb-2">System Maintenance</h4>
            <div className="flex flex-col gap-3">
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase opacity-70">Task Management</p>
                <div className="flex gap-2">
                  <Button variant="white" onClick={generateWeeklyTasks} disabled={loading} className="flex-1">
                    {loading ? "Generating..." : "Generate New Tasks"}
                  </Button>
                </div>
              </div>

              <div className="space-y-2 border-t-2 border-black/10 pt-2">
                <p className="text-xs font-bold uppercase text-red-600">Danger Zone</p>
                {isConfirmingReset ? (
                  <div className="bg-red-100 p-3 border-2 border-black flex flex-col gap-2">
                    <p className="text-[10px] font-black uppercase text-red-600 leading-tight">CRITICAL: WIPE ALL TASKS, HISTORY, AND FINES?</p>
                    <div className="flex gap-2">
                      <Button variant="primary" className="flex-1 text-[10px] py-1 h-auto" onClick={factoryReset}>YES, RESET</Button>
                      <Button variant="secondary" className="flex-1 text-[10px] py-1 h-auto" onClick={() => setIsConfirmingReset(false)}>CANCEL</Button>
                    </div>
                  </div>
                ) : (
                  <Button 
                    variant="secondary" 
                    onClick={() => setIsConfirmingReset(true)} 
                    disabled={loading}
                    className="bg-red-500 hover:bg-black text-white w-full border-black shadow-[4px_4px_0px_0px_#000]"
                  >
                    {loading ? "Wiping Data..." : "Factory Reset (Clear All)"}
                  </Button>
                )}
                <p className="text-[10px] uppercase font-black opacity-50 italic">Clears all tasks, violations, and resets all RM fines.</p>
              </div>
            </div>
          </div>
      </Card>

      <section className="mt-4">
          <h4 className="text-xl font-black uppercase mb-4">Resident Roster</h4>
          <div className="grid gap-4">
              {allUsers.map((u: any) => (
                  <Card key={u.uid} className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <img src={u.avatar} className="w-12 h-12 border-2 border-black" />
                            <div>
                                <p className="font-black uppercase">{u.name}</p>
                                <p className="text-xs font-bold text-gray-500 uppercase">{u.role}</p>
                            </div>
                        </div>
                        <div className="text-right flex flex-col items-end gap-1">
                            <p className="text-lg font-black tracking-tighter">RM {u.totalFines}</p>
                            <p className="text-[10px] font-black uppercase bg-black text-white px-1">Warn: {u.warningPoints}</p>
                            {u.uid !== 'faeyza' && (
                              <div className="flex flex-col items-end gap-1 mt-1">
                                {deletingId === u.uid ? (
                                    <div className="bg-red-100 p-2 border-2 border-black flex flex-col gap-2 scale-90 origin-right">
                                        <p className="text-[9px] font-black uppercase text-red-600">Permanently delete user?</p>
                                        <div className="flex gap-1 justify-end">
                                            <Button variant="primary" className="text-[8px] px-2 py-1 h-auto" onClick={() => { onDeleteUser(u.uid); setDeletingId(null); }}>YES</Button>
                                            <Button variant="secondary" className="text-[8px] px-2 py-1 h-auto" onClick={() => setDeletingId(null)}>NO</Button>
                                        </div>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setDeletingId(u.uid)}
                                        className="text-[9px] font-black underline hover:text-red-600 transition-colors uppercase text-red-500"
                                    >
                                        [ Delete User ]
                                    </button>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                      
                      <div className="border-t-2 border-black pt-2">
                        {resettingId === u.uid ? (
                          <div className="flex gap-2">
                            <Input placeholder="New Pass" value={newPass} onChange={e => setNewPass(e.target.value)} />
                            <Button variant="primary" className="text-xs" onClick={() => { onResetPassword(u.uid, newPass); setResettingId(null); setNewPass(''); }}>Set</Button>
                            <Button variant="secondary" className="text-xs" onClick={() => setResettingId(null)}>X</Button>
                          </div>
                        ) : (
                          <Button variant="secondary" className="w-full text-xs" onClick={() => setResettingId(u.uid)}>Force Password Reset</Button>
                        )}
                      </div>
                  </Card>
              ))}
          </div>
      </section>
    </motion.div>
  );
}

function AuthScreen({ onLogin }: { onLogin: (u: any) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [error, setError] = useState('');

  const setupDefaultsFlow = async () => {
    setInitLoading(true);
    try {
      const creds: Record<string, any> = {
        faeyza: { name: 'Faeyza', role: 'admin', pass: 'eyza0304' },
        igun: { name: 'Igun', role: 'member', pass: 'igun123' },
        ilya: { name: 'Ilya', role: 'member', pass: 'ilya123' },
        ryuta: { name: 'Ryuta', role: 'member', pass: 'ryuta123' }
      };

      for (const [uname, data] of Object.entries(creds)) {
        await setDoc(doc(db, 'users', uname), {
          uid: uname,
          name: data.name,
          role: data.role,
          password: data.pass,
          totalFines: 0,
          warningPoints: 0,
          avatar: `https://api.dicebear.com/7.x/pixel-art/svg?seed=${uname}`
        }, { merge: true });
      }
      alert('System initialized! You can now login.');
    } catch (e) {
      setError('Initialization failed. Check internet.');
    } finally {
      setInitLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!username || !password) return;
    setLoading(true);
    setError('');
    
    try {
      const userRef = doc(db, 'users', username.toLowerCase().trim());
      const snap = await getDoc(userRef);
      
      if (snap.exists()) {
        const data = snap.data();
        if (data.password === password) {
          onLogin({ username: username.toLowerCase().trim(), name: data.name });
        } else {
          setError('Incorrect Password!');
        }
      } else {
        setError(`User "${username}" not found!`);
      }
    } catch (e) {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFE600] flex items-center justify-center p-6 font-sans">
      <Card className="max-w-md w-full flex flex-col gap-6 p-8">
        <h1 className="text-6xl font-black tracking-tighter leading-none italic uppercase text-center">HOME<br/>TASKS</h1>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-black uppercase block mb-1">Username</label>
            <Input placeholder="e.g. faeyza" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-black uppercase block mb-1">Password</label>
            <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-xs font-black uppercase text-[#FF0055]">{error}</p>}
          <Button 
            variant="primary" 
            className="w-full py-4 text-xl" 
            onClick={handleAuth}
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </Button>
        </div>
        <p className="text-[10px] font-bold text-center opacity-50 uppercase">Secured Roommate Portal</p>
        
        <div className="pt-4 border-t-2 border-black border-dashed flex flex-col items-center gap-2">
            <p className="text-[9px] font-black uppercase text-gray-500">New setup? Hit the button below</p>
            <Button 
                variant="secondary" 
                className="text-[10px] py-1 px-4 leading-none h-auto"
                onClick={setupDefaultsFlow}
                disabled={initLoading}
            >
                {initLoading ? 'Initializing...' : 'Initialize System Tools'}
            </Button>
        </div>
      </Card>
    </div>
  );
}
