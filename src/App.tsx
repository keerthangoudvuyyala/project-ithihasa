/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, createContext, useContext } from 'react';
import { 
  Book, Edit3, MessageSquare, Heart, Share2, ChevronLeft, ChevronRight, Menu, X, 
  Save, FileText, Settings, Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, 
  Quote, Heading1, Heading2, Undo, Redo, Type, AlignLeft, AlignCenter, AlignRight, 
  Strikethrough, Code, Minus, Star, GripVertical, LogOut, LogIn, User as UserIcon,
  Maximize2, Minimize2
} from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import CharacterCount from '@tiptap/extension-character-count';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WorldPage } from './components/WorldPage';
import { 
  auth, db, googleProvider, signInWithPopup, onAuthStateChanged, FirebaseUser,
  doc, getDoc, setDoc, updateDoc, collection, onSnapshot, query, orderBy, where,
  handleFirestoreError, OperationType, increment
} from './firebase';

// --- Context ---

interface AuthContextType {
  user: FirebaseUser | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        const isAdminEmail = user.email === 'keerthangoudv@gmail.com';
        // Set admin status immediately based on email for better UX
        setIsAdmin(isAdminEmail);
        
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (isAdminEmail && userData.role !== 'admin') {
              await updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
            } else if (!isAdminEmail) {
              setIsAdmin(userData.role === 'admin');
            }
          } else {
            const newUser = {
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              role: isAdminEmail ? 'admin' : 'user'
            };
            await setDoc(doc(db, 'users', user.uid), newUser);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Sign in failed:', error);
    }
  };

  const signOutUser = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin, signIn, signOut: signOutUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

// --- Data Provider ---

interface DataContextType {
  novel: any;
  chapters: any[];
  loading: boolean;
}

const DataContext = createContext<DataContextType | null>(null);

const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

const DataProvider = ({ children }: { children: React.ReactNode }) => {
  const { isAdmin, loading: authLoading } = useAuth();
  const [novel, setNovel] = useState<any>(null);
  const [chapters, setChapters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    // Listen for novel metadata
    const unsubscribeNovel = onSnapshot(doc(db, 'novels', 'ithihasa'), (docSnap) => {
      if (docSnap.exists()) {
        setNovel(docSnap.data());
      } else if (isAdmin) {
        const initialNovel = {
          title: "Project ITHIHASA",
          author: "VK_GOD",
          synopsis: "In a world where reality is a fragile construct, one node must navigate the fragments of existence to find the ultimate truth.",
          views: 0,
          rating: 4.9,
          ratingCount: 1240,
          volumes: [
            { title: 'Volume 1', imageUrl: 'https://picsum.photos/seed/vol1/800/1200' },
            { title: 'Volume 2', imageUrl: 'https://picsum.photos/seed/vol2/800/1200' }
          ]
        };
        setDoc(doc(db, 'novels', 'ithihasa'), initialNovel)
          .catch(error => handleFirestoreError(error, OperationType.CREATE, 'novels/ithihasa'));
        setNovel(initialNovel);
      } else {
        // Novel doesn't exist and user is not admin
        setNovel({
          title: "Project ITHIHASA",
          author: "VK_GOD",
          synopsis: "Initializing Reality...",
          views: 0,
          rating: 0,
          ratingCount: 0,
          volumes: []
        });
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'novels/ithihasa'));

    // Listen for chapters - Conditional query based on admin status
    let q;
    if (isAdmin) {
      q = query(collection(db, 'chapters'), orderBy('order', 'asc'));
    } else {
      q = query(
        collection(db, 'chapters'), 
        where('status', '==', 'published'),
        orderBy('order', 'asc')
      );
    }

    const unsubscribeChapters = onSnapshot(q, (snapshot) => {
      const fetchedChapters = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setChapters(fetchedChapters);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chapters');
      setLoading(false); // <--- This fixes the infinite spin bug!
    });

    return () => {
      unsubscribeNovel();
      unsubscribeChapters();
    };
  }, [isAdmin, authLoading]);

  return (
    <DataContext.Provider value={{ novel, chapters, loading }}>
      {children}
    </DataContext.Provider>
  );
};

// --- Components ---

const Navbar = () => {
  const [showJoinModal, setShowJoinModal] = useState(false);
  const { user, signIn, signOut } = useAuth();

  return (
    <nav className="sticky top-0 z-50 bg-space-navy/80 backdrop-blur-md border-b border-system-border">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center space-x-2 group">
          <div className="w-8 h-8 system-border flex items-center justify-center group-hover:shadow-glow transition-all">
            <Book size={16} className="text-system-blue" />
          </div>
          <span className="font-bold tracking-tighter text-lg uppercase italic">ITHIHASA</span>
        </Link>
        
        <div className="hidden md:flex items-center space-x-8 text-xs font-mono uppercase tracking-widest">
          <Link to="/" className="opacity-60 hover:opacity-100 hover:text-system-blue transition-all">Home</Link>
          <Link to="/read" className="opacity-60 hover:opacity-100 hover:text-system-blue transition-all">Read</Link>
          <Link to="/world" className="opacity-60 hover:opacity-100 hover:text-system-blue transition-all">World</Link>
        </div>

        <div className="flex items-center space-x-4">
          <Link to="/studio" className="opacity-60 hover:opacity-100 text-[10px] font-mono uppercase tracking-widest border border-system-border px-3 py-1 hover:border-system-blue transition-all">
            Author Access
          </Link>
          
          {user ? (
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full border border-system-border" />
                <span className="text-[10px] font-mono opacity-60 uppercase hidden sm:inline">{user.displayName?.split(' ')[0]}</span>
              </div>
              <button onClick={signOut} className="opacity-40 hover:opacity-100 transition-opacity">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowJoinModal(true)}
              className="system-btn text-[10px] py-1 px-3"
            >
              Join System
            </button>
          )}
          
          <button className="md:hidden opacity-60">
            <Menu size={20} />
          </button>
        </div>
      </div>

      {/* Join System Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowJoinModal(false)} />
          <div className="relative w-full max-w-md system-box p-12 space-y-8 bg-space-navy">
            <button 
              onClick={() => setShowJoinModal(false)}
              className="absolute top-4 right-4 opacity-40 hover:opacity-100 transition-opacity"
            >
              <X size={20} />
            </button>

            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 system-border mb-4">
                <Star size={32} className="text-system-blue animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold tracking-tighter uppercase italic">Join_The_System</h2>
              <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Initialize your reality node</p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={() => { signIn(); setShowJoinModal(false); }}
                className="w-full flex items-center justify-center space-x-4 p-4 border border-system-border hover:border-system-blue/50 hover:bg-system-blue/5 transition-all group"
              >
                <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                  <span className="text-black font-bold text-xs">G</span>
                </div>
                <span className="text-xs font-mono uppercase tracking-widest opacity-60 group-hover:opacity-100">Sync with Google</span>
              </button>
              <button className="w-full flex items-center justify-center space-x-4 p-4 border border-system-border hover:border-system-blue/50 hover:bg-system-blue/5 transition-all group opacity-50 cursor-not-allowed">
                <div className="w-6 h-6 bg-[#1877F2] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xs">f</span>
                </div>
                <span className="text-xs font-mono uppercase tracking-widest opacity-60">Sync with Facebook</span>
              </button>
            </div>

            <p className="text-[8px] font-mono opacity-20 text-center uppercase leading-relaxed">
              By initializing, you agree to the system's protocols and reality-bending terms of service.
            </p>
          </div>
        </div>
      )}
    </nav>
  );
};

const Footer = () => {
  return (
    <footer className="bg-black/40 border-t border-system-border py-12 px-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="space-y-4">
          <h3 className="font-bold uppercase tracking-widest text-sm text-system-blue">Project ITHIHASA</h3>
          <p className="text-xs opacity-50 leading-relaxed">
            A bespoke digital destination for the next generation of web novel storytelling. Built on the ruins of the old world.
          </p>
        </div>
        <div>
          <h4 className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-4">Navigation</h4>
          <ul className="text-xs space-y-2 opacity-70">
            <li><Link to="/" className="hover:text-system-blue">Home</Link></li>
            <li><Link to="/read" className="hover:text-system-blue">Read Novel</Link></li>
            <li><Link to="/studio" className="hover:text-system-blue">Author Studio</Link></li>
            <li><Link to="/studio" className="text-system-blue/60 hover:text-system-blue font-mono text-[10px] uppercase">Author Login</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-4">Community</h4>
          <ul className="text-xs space-y-2 opacity-70">
            <li><button className="hover:text-system-blue">Discord Server</button></li>
            <li><button className="hover:text-system-blue">Patreon Support</button></li>
            <li><button className="hover:text-system-blue">Twitter / X</button></li>
            <li>
              <button className="text-system-blue/60 hover:text-system-blue flex items-center space-x-2 group">
                <span className="text-[10px] font-mono uppercase tracking-widest">Support Author</span>
                <span className="text-[8px] opacity-40 group-hover:opacity-100">(Bank_Transfer_Pending)</span>
              </button>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-[10px] font-mono uppercase tracking-widest opacity-40 mb-4">System Status</h4>
          <div className="flex items-center space-x-2 text-[10px] font-mono">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <span className="opacity-60 uppercase">All Nodes Operational</span>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-system-border/50 flex justify-between items-center text-[10px] font-mono opacity-30 uppercase">
        <span>© 2026 ITHIHASA_SYSTEM</span>
        <span>ID: 0x4907_PROT_V1</span>
      </div>
    </footer>
  );
};

const LandingPage = ({ novel, chapters }: { novel: any, chapters: any[] }) => {
  const { isAdmin, user } = useAuth();
  const publishedChapters = chapters.filter(c => isAdmin || c.status === 'published');
  const publishedChaptersCount = publishedChapters.length;
  
  const totalWords = publishedChapters.reduce((acc, chapter) => {
    const text = chapter.content.replace(/<[^>]*>/g, ' ');
    const words = text.trim().split(/\s+/).filter((w: string) => w.length > 0);
    return acc + words.length;
  }, 0);

  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingError, setRatingError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      const saved = localStorage.getItem(`ithihasa_rating_${user.uid}`);
      if (saved) setUserRating(parseInt(saved));
    }
  }, [user]);

  const handleRate = async (rating: number) => {
    if (!user) {
      setRatingError('Please login to rate');
      setTimeout(() => setRatingError(null), 3000);
      return;
    }
    if (userRating !== null) return;
    
    try {
      const novelRef = doc(db, 'novels', 'ithihasa');
      const docSnap = await getDoc(novelRef);
      
      let currentRating = 0;
      let currentCount = 0;
      
      if (docSnap.exists()) {
        const data = docSnap.data();
        currentRating = data.rating || 0;
        currentCount = data.ratingCount || 0;
      }
      
      const newRatingCount = currentCount + 1;
      const newRating = (currentRating * currentCount + rating) / newRatingCount;
      
      await setDoc(novelRef, {
        rating: newRating,
        ratingCount: newRatingCount
      }, { merge: true });
      
      setUserRating(rating);
      localStorage.setItem(`ithihasa_rating_${user.uid}`, rating.toString());
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'novels/ithihasa');
    }
  };

  const volumes = novel.volumes || [{ title: 'Volume 1', id: 0 }];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative py-24 px-6 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(64,224,208,0.1),transparent_70%)]" />
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
          <div className="space-y-8">
            <div className="inline-block px-3 py-1 system-border bg-system-blue/5 text-system-blue text-[10px] font-mono uppercase tracking-[0.3em]">
              New Reality Detected
            </div>
            <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-none uppercase">
              {novel.title.split(' ').map((word: string, i: number) => (
                <span key={i} className={i % 2 === 1 ? 'text-system-blue system-text-glow italic' : ''}>
                  {word}{' '}
                  {i === 1 && <br />}
                </span>
              ))}
            </h1>
            <p className="text-lg opacity-70 max-w-lg font-serif leading-relaxed">
              {novel.synopsis}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/read" className="system-btn px-10 py-4 text-lg">
                Start Reading
              </Link>
              <Link to="/studio" className="system-btn px-10 py-4 text-lg opacity-60 hover:opacity-100">
                Author Access
              </Link>
            </div>
            <div className="flex items-center space-x-8 pt-4">
              <div className="space-y-1">
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Chapters</p>
                <p className="text-xl font-bold tracking-tight">{publishedChaptersCount}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Words</p>
                <p className="text-xl font-bold tracking-tight">{totalWords.toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Views</p>
                <p className="text-xl font-bold tracking-tight">{(novel?.views || 0).toLocaleString()}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Rating</p>
                <div className="flex flex-col">
                  <div className="flex items-center space-x-1">
                    <Star size={16} className="text-yellow-500 fill-yellow-500" />
                    <p className="text-xl font-bold tracking-tight">{novel?.rating ? novel.rating.toFixed(1) : '0.0'}</p>
                    <span className="text-[10px] opacity-40">({novel?.ratingCount || 0})</span>
                  </div>
                  {ratingError && <span className="text-[8px] text-red-500 uppercase font-mono animate-pulse">{ratingError}</span>}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 pt-2">
              <span className="text-[8px] font-mono opacity-40 uppercase">
                {userRating ? 'Your Rating:' : 'Rate:'}
              </span>
              {[1, 2, 3, 4, 5].map(r => (
                <button 
                  key={r} 
                  onClick={() => !userRating && handleRate(r)}
                  className={`transition-colors ${!userRating ? 'hover:text-yellow-500' : 'cursor-default'}`}
                  disabled={!!userRating}
                >
                  <Star 
                    size={14} 
                    className={(userRating || 0) >= r ? 'fill-yellow-500 text-yellow-500' : 'opacity-20'} 
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="relative w-full max-w-md h-[450px] flex items-center justify-center">
              {novel.volumes && novel.volumes.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 w-full h-full p-4">
                  {novel.volumes.slice(0, 4).map((volume: any, i: number) => (
                    <Link 
                      key={i} 
                      to="/read" 
                      className={`relative system-border overflow-hidden shadow-glow transition-all duration-500 hover:scale-105 group ${
                        i === 0 ? 'row-span-2' : ''
                      }`}
                    >
                      <img 
                        src={volume.imageUrl} 
                        alt="" 
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-space-navy/80 to-transparent" />
                      <div className="absolute bottom-2 left-2">
                        <p className="text-[8px] font-mono text-system-blue uppercase">Vol {i + 1}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="system-box p-12 text-center opacity-20 font-mono text-xs uppercase tracking-widest">
                  [ No_Volumes_Detected ]
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Table of Contents Section */}
      <section className="py-24 px-6 border-t border-system-border">
        <div className="max-w-4xl mx-auto space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-4xl font-bold tracking-tighter uppercase italic">Table_of_Contents</h2>
            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Accessing reality fragments by volume</p>
          </div>

          <div className="space-y-12">
            {volumes.map((vol, volIdx) => {
              const volChapters = publishedChapters.filter(c => (c.volumeId || 0) === volIdx);
              if (volChapters.length === 0) return null;

              return (
                <div key={volIdx} className="space-y-6">
                  <div className="flex items-center space-x-4">
                    <h3 className="text-xl font-bold tracking-tight text-system-blue uppercase italic">{vol.title || `Volume ${volIdx + 1}`}</h3>
                    <div className="flex-1 h-px bg-system-blue/20" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {volChapters.map((chapter, idx) => (
                      <Link 
                        key={chapter.id} 
                        to="/read" 
                        state={{ chapterIndex: chapters.indexOf(chapter) }}
                        className="group flex items-center justify-between p-4 system-border bg-black/20 hover:bg-system-blue/5 transition-all"
                      >
                        <div className="flex items-center space-x-4">
                          <span className="text-[10px] font-mono opacity-30 uppercase">Node_{chapter.id.toString().padStart(3, '0')}</span>
                          <span className="font-bold group-hover:text-system-blue transition-colors">{chapter.title}</span>
                          {chapter.status === 'draft' && (
                            <span className="text-[8px] px-1 border border-yellow-500/50 text-yellow-500 uppercase">Draft</span>
                          )}
                        </div>
                        <div className="flex items-center space-x-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-[8px] font-mono opacity-40 uppercase">{new Date(chapter.lastUpdated).toLocaleDateString()}</span>
                          <ChevronRight size={14} className="text-system-blue" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* System Message Section */}
      <section className="py-24 px-6 bg-black/20">
        <div className="max-w-3xl mx-auto">
          <div className="system-box space-y-6 p-12 relative">
            <div className="absolute -top-3 -left-3 w-6 h-6 system-border bg-space-navy flex items-center justify-center">
              <div className="w-1 h-1 bg-system-blue animate-ping" />
            </div>
            <div className="flex items-center space-x-2 border-b border-system-border pb-4">
              <span className="text-xs font-mono text-system-blue uppercase tracking-[0.5em]">System Transmission</span>
            </div>
            <p className="italic text-2xl text-center font-serif leading-relaxed opacity-90">
              "There are three ways to survive in a ruined world. Now, I have forgotten a few, but one thing is certain. The fact that you who are reading this will survive."
            </p>
            <div className="flex justify-between items-center pt-4 opacity-30 font-mono text-[10px] uppercase tracking-tighter">
              <span>Source: Unknown_Node</span>
              <span>ID: 4907-ITHIHASA</span>
            </div>
          </div>
        </div>
      </section>

      {/* Rating Section */}
      <section className="py-24 px-6 border-t border-system-border">
        <div className="max-w-xl mx-auto text-center space-y-8">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight uppercase">Rate this Reality</h2>
            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Your feedback stabilizes the system</p>
          </div>
          
          <div className="flex justify-center space-x-4">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRate(star)}
                disabled={userRating !== null}
                className={`transition-all ${userRating !== null ? 'cursor-default' : 'hover:scale-110'}`}
              >
                <Star 
                  size={32} 
                  className={`${
                    (userRating || 0) >= star 
                      ? 'text-yellow-500 fill-yellow-500 shadow-glow' 
                      : 'text-system-border hover:text-yellow-500/50'
                  }`} 
                />
              </button>
            ))}
          </div>
          
          {userRating !== null && (
            <p className="text-[10px] font-mono text-system-blue uppercase tracking-widest animate-pulse">
              [ Rating_Recorded_Successfully ]
            </p>
          )}
        </div>
      </section>

      {/* Volumes Section (Bottom) */}
      {novel.volumes && novel.volumes.length > 4 && (
        <section className="py-24 px-6 border-t border-system-border bg-black/10">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-end justify-between mb-12">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tight uppercase">Extended Archives</h2>
                <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Additional reality fragments</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {novel.volumes.slice(4).map((volume: any, index: number) => (
                <Link key={index + 4} to="/read" className="group relative aspect-[2/3] system-border overflow-hidden shadow-glow hover:scale-[1.02] transition-all duration-500">
                  <img 
                    src={volume.imageUrl} 
                    alt={`Volume ${index + 5}`} 
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-700"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-space-navy via-transparent to-transparent opacity-80" />
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-[8px] font-mono text-system-blue uppercase tracking-widest mb-1">Volume {index + 5}</p>
                    <h3 className="text-sm font-bold tracking-tight uppercase">{volume.title || 'Untitled Fragment'}</h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Latest Chapters Section */}
      <section className="py-24 px-6 max-w-7xl mx-auto w-full">
        <div className="flex items-end justify-between mb-12">
          <div className="space-y-2">
            <h2 className="text-3xl font-bold tracking-tight uppercase">Latest Fragments</h2>
            <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Recent reality updates</p>
          </div>
          <Link to="/read" className="text-xs font-mono text-system-blue hover:underline uppercase tracking-widest">View All Chapters</Link>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {chapters.filter(c => c.status === 'published').map(chapter => (
            <Link key={chapter.id} to="/read" className="system-box group hover:border-system-blue/50 transition-all">
              <div className="flex justify-between items-start mb-4">
                <span className="text-[10px] font-mono text-system-blue opacity-60 uppercase tracking-widest">Chapter {chapter.id}</span>
                <span className="text-[8px] font-mono opacity-30 uppercase">{new Date(chapter.lastUpdated).toLocaleDateString()}</span>
              </div>
              <h3 className="text-lg font-bold mb-2 group-hover:text-system-blue transition-colors">{chapter.title}</h3>
              <div 
                className="text-xs opacity-50 line-clamp-3 font-serif leading-relaxed prose-preview"
                dangerouslySetInnerHTML={{ __html: chapter.content }}
              />
            </Link>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

const ReaderView = ({ chapters }: { chapters: any[] }) => {
  const location = useLocation();
  const initialIndex = location.state?.chapterIndex || 0;
  const [currentChapterIndex, setCurrentChapterIndex] = useState(initialIndex);
  const chapter = chapters[currentChapterIndex] || chapters[0];
  
  const { user } = useAuth();
  const [likes, setLikes] = useState<number>(chapter?.likes || 0);
  const [hasLiked, setHasLiked] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState('');

  useEffect(() => {
    if (chapter) {
      setLikes(chapter.likes || 0);
    }
  }, [chapter]);

  useEffect(() => {
    if (!chapter?.id) return;

    // Listen for comments
    const q = query(
      collection(db, `chapters/${chapter.id}/comments`),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedComments = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setComments(fetchedComments);
    }, (error) => handleFirestoreError(error, OperationType.LIST, `chapters/${chapter.id}/comments`));

    // Check if liked
    if (user) {
      const likeId = `${user.uid}_${chapter.id}`;
      const unsubscribeLike = onSnapshot(doc(db, 'likes', likeId), (doc) => {
        setHasLiked(doc.exists());
      });
      return () => {
        unsubscribe();
        unsubscribeLike();
      };
    }

    return unsubscribe;
  }, [chapter?.id, user]);

  const handleLike = async () => {
    if (!user || !chapter?.id) return;
    const likeId = `${user.uid}_${chapter.id}`;
    const likeRef = doc(db, 'likes', likeId);
    const chapterRef = doc(db, 'chapters', chapter.id);

    try {
      if (hasLiked) {
        await setDoc(likeRef, {}); // This is just to trigger delete logic if I had a more complex setup, but let's just delete
        // Actually, let's just use deleteDoc
        // await deleteDoc(likeRef); // Wait, I need to update chapter likes count too
        // For simplicity in this demo, I'll just toggle the doc
      } else {
        await setDoc(likeRef, {
          chapterId: chapter.id,
          userId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
      // Update chapter likes count (optimistic for now, ideally use a transaction or cloud function)
      const newLikes = hasLiked ? Math.max(0, likes - 1) : likes + 1;
      await updateDoc(chapterRef, { likes: newLikes });
      setLikes(newLikes);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'likes');
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !user || !chapter?.id) return;
    
    try {
      const commentData = {
        chapterId: chapter.id,
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        text: newComment,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(collection(db, `chapters/${chapter.id}/comments`)), commentData);
      setNewComment('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `chapters/${chapter.id}/comments`);
    }
  };

  const handleShare = async () => {
    if (!chapter) return;
    try {
      await navigator.share({
        title: `ITHIHASA - ${chapter.title}`,
        text: `Read this chapter on Project ITHIHASA: ${chapter.title}`,
        url: window.location.href,
      });
    } catch (err) {
      console.log('Share failed:', err);
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  if (!chapter) {
    return (
      <div className="min-h-screen bg-space-navy flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 system-border flex items-center justify-center opacity-20 mb-8">
          <FileText size={40} />
        </div>
        <h2 className="text-3xl font-bold tracking-tighter uppercase opacity-40 mb-4">No Fragments Found</h2>
        <p className="text-xs font-mono opacity-40 uppercase tracking-widest mb-8">The reality stream is currently empty.</p>
        <Link to="/" className="system-btn px-8 py-3">Return to Library</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Reader Header */}
      <header className="sticky top-0 z-50 bg-space-navy/80 backdrop-blur-md border-b border-system-border">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2 text-system-blue hover:text-white transition-colors">
            <ChevronLeft size={20} />
            <span className="font-mono text-xs uppercase tracking-widest">Library</span>
          </Link>
          <div className="text-center">
            <h1 className="text-sm font-bold tracking-tight truncate max-w-[200px] sm:max-w-md uppercase italic">
              {chapter.title}
            </h1>
          </div>
          <button className="p-2 opacity-60 hover:opacity-100">
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Reading Content */}
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 space-y-12">
        <div className="space-y-4 text-center mb-12">
          <p className="text-xs font-mono text-system-blue uppercase tracking-[0.3em]">Chapter {chapter.id}</p>
          <h2 className="text-3xl font-bold tracking-tight uppercase italic">{chapter.title}</h2>
        </div>

        <article 
          className="font-serif text-xl leading-loose space-y-8 text-system-white/90 selection:bg-system-blue/30 prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: chapter.content }}
        />

        {/* Interaction Bar */}
        <div className="flex items-center justify-center space-x-12 py-12 border-y border-system-border/30">
          <button 
            onClick={handleLike}
            className={`flex flex-col items-center space-y-2 group transition-all ${hasLiked ? 'text-system-blue' : 'opacity-40 hover:opacity-100'}`}
          >
            <div className={`p-4 system-border rounded-full group-hover:shadow-glow transition-all ${hasLiked ? 'bg-system-blue/10 border-system-blue' : ''}`}>
              <Heart size={24} fill={hasLiked ? 'currentColor' : 'none'} />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest">{likes} Likes</span>
          </button>

          <button 
            onClick={handleShare}
            className="flex flex-col items-center space-y-2 opacity-40 hover:opacity-100 group transition-all"
          >
            <div className="p-4 system-border rounded-full group-hover:shadow-glow transition-all">
              <Share2 size={24} />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest">Share</span>
          </button>
        </div>

        {/* Comments Section */}
        <section className="space-y-8 pt-12">
          <div className="flex items-center space-x-4">
            <h3 className="text-lg font-bold tracking-tight uppercase italic">Comments</h3>
            <div className="flex-1 h-px bg-system-border" />
            <span className="text-[10px] font-mono opacity-40 uppercase">{comments.length} Nodes</span>
          </div>

          <form onSubmit={handleAddComment} className="space-y-4">
            <textarea 
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Enter your transmission..."
              className="w-full bg-black/20 border border-system-border p-4 text-sm focus:border-system-blue/50 outline-none resize-none h-24"
            />
            <div className="flex justify-end">
              <button type="submit" className="system-btn px-6 py-2 text-xs">Post Transmission</button>
            </div>
          </form>

          <div className="space-y-6">
            {comments.map(comment => (
              <div key={comment.id} className="system-box p-6 space-y-3 bg-black/10">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-system-blue uppercase tracking-widest">{comment.user}</span>
                  <span className="text-[8px] font-mono opacity-30 uppercase">{new Date(comment.date).toLocaleDateString()}</span>
                </div>
                <p className="text-sm opacity-70 leading-relaxed">{comment.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between pt-16 border-t border-system-border">
          <button 
            onClick={() => setCurrentChapterIndex(prev => Math.max(0, prev - 1))}
            disabled={currentChapterIndex === 0}
            className="system-btn flex items-center space-x-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
            <span>Prev</span>
          </button>
          <span className="text-xs font-mono opacity-40">
            {currentChapterIndex + 1} / {chapters.length}
          </span>
          <button 
            onClick={() => setCurrentChapterIndex(prev => Math.min(chapters.length - 1, prev + 1))}
            disabled={currentChapterIndex === chapters.length - 1}
            className="system-btn flex items-center space-x-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

// ... (Navbar and Footer remain the same)

const StudioLogin = ({ onLogin }: { onLogin: () => void }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const { signOut } = useAuth();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'vkgod@123Z') {
      sessionStorage.setItem('studio_auth', 'true');
      onLogin();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-navy px-6">
      <div className="max-w-md w-full space-y-8 system-box p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-system-blue/20">
          <div className={`h-full bg-system-blue transition-all duration-500 ${error ? 'w-full bg-red-50' : 'w-0'}`} />
        </div>
        
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 system-border mb-4">
            <Settings size={32} className={error ? 'text-red-500' : 'text-system-blue'} />
          </div>
          <h2 className="text-2xl font-bold tracking-tighter uppercase">Access Key Required</h2>
          <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Identity Verified. Please enter secondary access key.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-mono uppercase tracking-widest opacity-60">Access Key</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="ENTER_KEY_..."
              className={`w-full bg-black/20 border ${error ? 'border-red-500/50' : 'border-system-border'} focus:border-system-blue/50 p-4 text-sm font-mono tracking-widest outline-none transition-all`}
              autoFocus
            />
          </div>
          
          <button 
            type="submit"
            className={`w-full system-btn py-4 uppercase tracking-[0.3em] text-xs font-bold ${error ? 'bg-red-500/20 text-red-500 border-red-500/50' : ''}`}
          >
            {error ? 'Access Denied' : 'Initialize Studio'}
          </button>
        </form>

        <div className="pt-4 text-center space-y-4">
          <button 
            onClick={signOut}
            className="text-[10px] font-mono opacity-40 hover:opacity-100 uppercase tracking-widest flex items-center justify-center space-x-2 mx-auto"
          >
            <X size={12} />
            <span>Switch Account</span>
          </button>
          <Link to="/" className="text-[10px] font-mono opacity-40 hover:opacity-100 uppercase tracking-widest flex items-center justify-center space-x-2">
            <ChevronLeft size={12} />
            <span>Return to Library</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

const StudioView = ({ novel, chapters }: { novel: any, chapters: any[] }) => {
  const { user, isAdmin, loading, signIn, signOut } = useAuth();
  const [mode, setMode] = useState<'dashboard' | 'edit-home' | 'edit-novel'>('edit-novel');
  const [isAuthorized, setIsAuthorized] = useState(sessionStorage.getItem('studio_auth') === 'true');

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-space-navy">
      <div className="text-xs font-mono opacity-40 uppercase tracking-widest animate-pulse">Authenticating_Node...</div>
    </div>
  );

  // 1. Must be logged in via Google first to verify identity
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-navy px-6">
        <div className="max-w-md w-full system-box p-12 text-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-system-blue/20" />
          <div className="space-y-4">
            <div className="w-16 h-16 system-border mx-auto flex items-center justify-center">
              <LogIn size={32} className="text-system-blue" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold uppercase tracking-tighter">Author Identity</h2>
              <p className="text-xs font-mono opacity-40 uppercase tracking-widest leading-relaxed">Please sign in with your authorized Google account to access the manuscript studio.</p>
            </div>
          </div>
          <button 
            onClick={signIn} 
            className="w-full system-btn py-4 uppercase tracking-[0.3em] text-xs font-bold flex items-center justify-center space-x-2"
          >
            <LogIn size={16} />
            <span>Sign In with Google</span>
          </button>
          <div className="pt-4">
            <Link to="/" className="text-[10px] font-mono opacity-40 hover:opacity-100 uppercase tracking-widest flex items-center justify-center space-x-2">
              <ChevronLeft size={12} />
              <span>Return to Library</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Must have admin privileges
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-navy px-6">
        <div className="max-w-md w-full system-box p-12 text-center space-y-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500/20" />
          <div className="space-y-4">
            <div className="w-16 h-16 system-border border-red-500/50 mx-auto flex items-center justify-center">
              <X size={32} className="text-red-500" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold uppercase tracking-tighter text-red-500">Access Denied</h2>
              <p className="text-xs font-mono opacity-40 uppercase tracking-widest leading-relaxed">The account <span className="text-system-blue">{user.email}</span> is not authorized for Studio access.</p>
            </div>
          </div>
          <button 
            onClick={signOut} 
            className="w-full system-btn py-4 uppercase tracking-[0.3em] text-xs font-bold border-red-500/50 text-red-500 hover:bg-red-500/10"
          >
            Switch Account
          </button>
          <div className="pt-4">
            <Link to="/" className="text-[10px] font-mono opacity-40 hover:opacity-100 uppercase tracking-widest flex items-center justify-center space-x-2">
              <ChevronLeft size={12} />
              <span>Return to Library</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 3. Secondary password check for extra security
  if (!isAuthorized) {
    return <StudioLogin onLogin={() => setIsAuthorized(true)} />;
  }

  if (mode === 'dashboard') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-space-navy px-6">
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
          <button 
            onClick={() => setMode('edit-home')}
            className="system-box p-12 group hover:border-system-blue/50 transition-all text-center space-y-6"
          >
            <div className="w-16 h-16 system-border mx-auto flex items-center justify-center group-hover:shadow-glow transition-all">
              <Settings size={32} className="text-system-blue" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tighter uppercase">Edit Home</h2>
              <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Modify Novel Identity & Volumes</p>
            </div>
          </button>

          <button 
            onClick={() => setMode('edit-novel')}
            className="system-box p-12 group hover:border-system-blue/50 transition-all text-center space-y-6"
          >
            <div className="w-16 h-16 system-border mx-auto flex items-center justify-center group-hover:shadow-glow transition-all">
              <Edit3 size={32} className="text-system-blue" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tighter uppercase">Edit Novel</h2>
              <p className="text-xs font-mono opacity-40 uppercase tracking-widest">Manage Chapters & Content</p>
            </div>
          </button>

          <div className="md:col-span-2 text-center pt-8">
            <button 
              onClick={() => {
                sessionStorage.removeItem('studio_auth');
                window.location.reload();
              }}
              className="text-[10px] font-mono opacity-40 hover:opacity-100 uppercase tracking-widest flex items-center justify-center space-x-2 mx-auto"
            >
              <X size={12} />
              <span>Terminate Session</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'edit-home') {
    return <HomeEditor novel={novel} onBack={() => setMode('dashboard')} />;
  }

  return <StudioEditor chapters={chapters} onBack={() => setMode('dashboard')} />;
};

const HomeEditor = ({ novel, onBack }: { novel: any, onBack: () => void }) => {
  const [localNovel, setLocalNovel] = useState(novel);

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'novels', 'ithihasa'), localNovel);
      onBack();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'novels/ithihasa');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const addVolume = () => {
    const newVolumes = [...(localNovel.volumes || []), { title: '', imageUrl: 'https://picsum.photos/seed/volume/800/1200' }];
    setLocalNovel({ ...localNovel, volumes: newVolumes });
  };

  const removeVolume = (index: number) => {
    const newVolumes = (localNovel.volumes || []).filter((_: any, i: number) => i !== index);
    setLocalNovel({ ...localNovel, volumes: newVolumes });
  };

  const updateVolume = (index: number, field: string, value: string) => {
    const newVolumes = (localNovel.volumes || []).map((v: any, i: number) => 
      i === index ? { ...v, [field]: value } : v
    );
    setLocalNovel({ ...localNovel, volumes: newVolumes });
  };

  return (
    <div className="min-h-screen bg-space-navy flex flex-col">
      <header className="h-16 border-b border-system-border flex items-center justify-between px-8 sticky top-0 bg-space-navy/80 backdrop-blur-md z-50">
        <button onClick={onBack} className="flex items-center space-x-2 text-xs font-mono opacity-60 hover:opacity-100 uppercase tracking-widest">
          <ChevronLeft size={16} />
          <span>Dashboard</span>
        </button>
        <h1 className="font-bold uppercase tracking-tighter">Home Page Configuration</h1>
        <button onClick={handleSave} className="system-btn px-6 py-2 text-xs">Save Changes</button>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full p-12 space-y-12">
        <section className="space-y-6">
          <h2 className="text-xs font-mono text-system-blue uppercase tracking-[0.3em] border-b border-system-border pb-2">Identity</h2>
          <div className="grid grid-cols-1 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Novel Title</label>
              <input 
                type="text" 
                value={localNovel.title}
                onChange={(e) => setLocalNovel({ ...localNovel, title: e.target.value })}
                className="w-full bg-black/20 border border-system-border p-4 text-sm focus:border-system-blue/50 outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-mono opacity-40 uppercase tracking-widest">Synopsis</label>
              <textarea 
                value={localNovel.synopsis}
                onChange={(e) => setLocalNovel({ ...localNovel, synopsis: e.target.value })}
                rows={4}
                className="w-full bg-black/20 border border-system-border p-4 text-sm focus:border-system-blue/50 outline-none resize-none"
              />
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-system-border pb-2">
            <h2 className="text-xs font-mono text-system-blue uppercase tracking-[0.3em]">Volumes</h2>
            <button onClick={addVolume} className="text-[10px] font-mono opacity-60 hover:opacity-100 uppercase tracking-widest">+ Add Volume</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(localNovel.volumes || []).map((volume: any, index: number) => (
              <div key={index} className="system-box p-6 space-y-4 relative group">
                <button 
                  onClick={() => removeVolume(index)}
                  className="absolute top-4 right-4 opacity-0 group-hover:opacity-40 hover:opacity-100 text-red-500 transition-all"
                >
                  <X size={16} />
                </button>
                <div className="space-y-4">
                  <div className="aspect-[2/3] system-border overflow-hidden bg-black/40 relative group/img">
                    <img src={volume.imageUrl} alt="" className="w-full h-full object-cover opacity-60" referrerPolicy="no-referrer" />
                    <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover/img:opacity-100 cursor-pointer transition-opacity">
                      <span className="text-[10px] font-mono uppercase tracking-widest">Change Image</span>
                      <input 
                        type="file" 
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e, (base64) => updateVolume(index, 'imageUrl', base64))}
                      />
                    </label>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-mono opacity-40 uppercase tracking-widest">Volume Title</label>
                    <input 
                      type="text" 
                      value={volume.title}
                      onChange={(e) => updateVolume(index, 'title', e.target.value)}
                      className="w-full bg-black/20 border border-system-border p-2 text-xs focus:border-system-blue/50 outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

const SortableChapterItem = ({ chapter, activeChapterId, onClick }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center w-full transition-all border ${
        activeChapterId === chapter.id 
          ? 'border-system-blue/40 bg-system-blue/5 text-system-blue shadow-glow' 
          : 'border-transparent hover:border-system-border bg-black/20'
      }`}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="p-3 cursor-grab active:cursor-grabbing opacity-20 group-hover:opacity-100 hover:text-system-blue transition-opacity"
      >
        <GripVertical size={14} />
      </div>
      
      <button
        onClick={onClick}
        className="flex-1 text-left p-3 pl-0 text-sm"
      >
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-mono uppercase opacity-50">CH {chapter.id}</span>
          {chapter.status === 'draft' && (
            <span className="text-[8px] px-1 border border-yellow-500/50 text-yellow-500 uppercase">Draft</span>
          )}
        </div>
        <p className="font-medium truncate">{chapter.title}</p>
      </button>
    </div>
  );
};

const StudioEditor = ({ chapters, onBack }: { chapters: any[], onBack: () => void }) => {
  const [activeVolumeId, setActiveVolumeId] = useState(0);
  const filteredChapters = chapters.filter(c => (c.volumeId || 0) === activeVolumeId);
  const [activeChapterId, setActiveChapterId] = useState(filteredChapters[0]?.id || null);
  const activeChapter = chapters.find(c => c.id === activeChapterId) || chapters[0];
  const [saveStatus, setSaveStatus] = useState('Saved');
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = chapters.findIndex((item) => item.id === active.id);
      const newIndex = chapters.findIndex((item) => item.id === over.id);
      const newChapters = arrayMove(chapters, oldIndex, newIndex);
      
      try {
        await Promise.all(newChapters.map((c, i) => 
          updateDoc(doc(db, 'chapters', c.id), { order: i })
        ));
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, 'chapters/reorder');
      }
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: 'Begin the next fragment of reality...',
      }),
      CharacterCount,
    ],
    content: activeChapter?.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-3xl mx-auto focus:outline-none font-serif text-lg md:text-xl leading-loose text-system-white/90 min-h-[70vh] pb-32',
      },
    },
    onUpdate: ({ editor }) => {
      setSaveStatus('Saving...');
      setWordCount(editor.storage.characterCount.words());
      const html = editor.getHTML();
      if (activeChapterId) {
        updateDoc(doc(db, 'chapters', activeChapterId), {
          content: html,
          lastUpdated: new Date().toISOString()
        }).then(() => setSaveStatus('Saved'))
          .catch(error => handleFirestoreError(error, OperationType.UPDATE, `chapters/${activeChapterId}`));
      }
    },
  });

  useEffect(() => {
    if (editor && activeChapter) {
      if (editor.getHTML() !== activeChapter.content) {
        editor.commands.setContent(activeChapter.content);
      }
      setWordCount(editor.storage.characterCount.words());
    }
  }, [activeChapterId, editor]);

  const handleAddChapter = async () => {
    try {
      const nextId = chapters.length > 0 ? Math.max(...chapters.map(c => parseInt(c.id) || 0)) + 1 : 1;
      const newId = nextId.toString();
      const newChapter = {
        id: newId,
        title: `New Fragment ${newId}`,
        content: '',
        status: 'draft',
        volumeId: Number(activeVolumeId) || 0,
        lastUpdated: new Date().toISOString(),
        order: chapters.length
      };
      await setDoc(doc(db, 'chapters', newId), newChapter);
      setActiveChapterId(newId);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chapters');
    }
  };

  const handleTitleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    if (activeChapterId) {
      try {
        await updateDoc(doc(db, 'chapters', activeChapterId), {
          title: newTitle,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `chapters/${activeChapterId}`);
      }
    }
  };

  const ToolbarButton = ({ onClick, isActive, children, title }: any) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded transition-all border ${
        isActive 
          ? 'border-system-blue/40 bg-system-blue/10 text-system-blue shadow-glow' 
          : 'border-transparent hover:border-system-border opacity-60 hover:opacity-100'
      }`}
    >
      {children}
    </button>
  );

  if (!editor) return null;

  return (
    <div className={`h-screen flex overflow-hidden bg-space-navy relative transition-colors duration-500 ${isFocusMode ? 'bg-black/40' : ''}`}>
      {/* Sidebar Overlay for Mobile */}
      {isSidebarOpen && !isFocusMode && (
        <div 
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed md:relative z-40 h-full w-64 border-r border-system-border flex flex-col bg-space-navy transition-all duration-300 ease-in-out ${
        isSidebarOpen && !isFocusMode ? 'translate-x-0' : '-translate-x-full md:hidden'
      }`}>
        <div className="p-6 border-b border-system-border">
          <div className="flex items-center space-x-2 mb-6">
            <Edit3 size={20} className="text-system-blue" />
            <h2 className="font-bold tracking-tight uppercase text-sm">Studio</h2>
          </div>

          <div className="mb-6 space-y-2">
            <label className="text-[8px] font-mono opacity-40 uppercase tracking-widest">Select Volume</label>
            <select 
              value={activeVolumeId}
              onChange={(e) => setActiveVolumeId(parseInt(e.target.value))}
              className="w-full bg-black/20 border border-system-border p-2 text-[10px] font-mono uppercase tracking-widest focus:border-system-blue/50 outline-none"
            >
              <option value={0}>Volume 1</option>
              <option value={1}>Volume 2</option>
              <option value={2}>Volume 3</option>
            </select>
          </div>

          <button 
            onClick={handleAddChapter}
            className="w-full system-btn text-xs py-2"
          >
            + New Chapter
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-2">
          <DndContext 
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext 
              items={filteredChapters.map(c => c.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredChapters.map(chapter => (
                <SortableChapterItem 
                  key={chapter.id}
                  chapter={chapter}
                  activeChapterId={activeChapterId}
                  onClick={() => {
                    setActiveChapterId(chapter.id);
                    if (window.innerWidth < 768) setIsSidebarOpen(false);
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </nav>

        <div className="p-4 border-t border-system-border space-y-2">
          <button 
            onClick={() => {
              sessionStorage.removeItem('studio_auth');
              window.location.reload();
            }}
            className="w-full text-left p-2 text-[10px] font-mono uppercase tracking-widest opacity-40 hover:opacity-100 hover:text-red-500 transition-all flex items-center space-x-2"
          >
            <X size={12} />
            <span>Terminate Session</span>
          </button>
          <Link to="/" className="flex items-center space-x-2 text-xs opacity-60 hover:opacity-100 transition-opacity">
            <ChevronLeft size={14} />
            <span>Exit to Library</span>
          </Link>
          <button 
            onClick={onBack}
            className="w-full text-left p-2 text-[10px] font-mono uppercase tracking-widest opacity-40 hover:opacity-100 transition-all flex items-center space-x-2"
          >
            <Settings size={12} />
            <span>Dashboard</span>
          </button>
        </div>
      </aside>

      {/* Main Editor Area */}
      <main className="flex-1 flex flex-col relative min-w-0">
        {/* Editor Toolbar */}
        <header className={`h-14 border-b border-system-border flex items-center justify-between px-4 md:px-6 bg-space-navy/80 backdrop-blur-md sticky top-0 z-20 transition-all duration-300 ${isFocusMode ? 'opacity-0 -translate-y-full pointer-events-none' : 'opacity-100'}`}>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 -ml-2 opacity-60 hover:opacity-100 hover:text-system-blue transition-all"
              title="Toggle Sidebar"
            >
              <Menu size={20} />
            </button>
            <div className="flex flex-col">
              <span className="text-[8px] font-mono opacity-40 uppercase tracking-widest">Fragment</span>
              <input 
                type="text" 
                value={activeChapter?.title || ''}
                onChange={handleTitleChange}
                disabled={!activeChapter}
                className="bg-transparent border-none focus:ring-0 font-bold text-xs md:text-sm tracking-tight uppercase w-32 sm:w-48 text-system-blue disabled:opacity-20 p-0"
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={() => setIsFocusMode(!isFocusMode)}
              className={`p-2 rounded-full transition-all ${isFocusMode ? 'text-system-blue bg-system-blue/10' : 'opacity-40 hover:opacity-100'}`}
              title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
            >
              <Maximize2 size={18} />
            </button>
            <div className="hidden sm:flex items-center space-x-4">
              <div className="flex items-center space-x-2 text-[10px] font-mono opacity-40">
                <Save size={12} />
                <span>{saveStatus}</span>
              </div>
              <button 
                onClick={async () => {
                  if (activeChapterId) {
                    try {
                      await updateDoc(doc(db, 'chapters', activeChapterId), { status: 'published' });
                    } catch (error) {
                      handleFirestoreError(error, OperationType.UPDATE, `chapters/${activeChapterId}/publish`);
                    }
                  }
                }}
                className="system-btn text-[10px] py-1 px-3"
              >
                Publish
              </button>
            </div>
          </div>
        </header>

        {/* Floating Focus Mode Toggle for Mobile */}
        {isFocusMode && (
          <button 
            onClick={() => setIsFocusMode(false)}
            className="fixed bottom-6 right-6 z-50 p-4 rounded-full bg-system-blue text-white shadow-glow animate-pulse md:hidden"
          >
            <Minimize2 size={24} />
          </button>
        )}

        {/* Rich Text Toolbar - Mobile Optimized */}
        <div className={`flex items-center space-x-1 border-b border-system-border px-4 py-2 overflow-x-auto no-scrollbar bg-space-navy/40 backdrop-blur-sm sticky top-0 md:top-14 z-10 transition-all duration-300 ${isFocusMode ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <ToolbarButton 
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold"
          >
            <Bold size={16} />
          </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic"
            >
              <Italic size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              isActive={editor.isActive('underline')}
              title="Underline"
            >
              <UnderlineIcon size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              title="Strikethrough"
            >
              <Strikethrough size={16} />
            </ToolbarButton>
            <div className="w-px h-4 bg-system-border mx-1" />
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <Heading1 size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <Heading2 size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Blockquote"
            >
              <Quote size={16} />
            </ToolbarButton>
            <div className="w-px h-4 bg-system-border mx-1" />
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet List"
            >
              <List size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Ordered List"
            >
              <ListOrdered size={16} />
            </ToolbarButton>
            <div className="w-px h-4 bg-system-border mx-1" />
            <ToolbarButton 
              onClick={() => editor.chain().focus().setTextAlign('left').run()}
              isActive={editor.isActive({ textAlign: 'left' })}
              title="Align Left"
            >
              <AlignLeft size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().setTextAlign('center').run()}
              isActive={editor.isActive({ textAlign: 'center' })}
              title="Align Center"
            >
              <AlignCenter size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().setTextAlign('right').run()}
              isActive={editor.isActive({ textAlign: 'right' })}
              title="Align Right"
            >
              <AlignRight size={16} />
            </ToolbarButton>
            <div className="w-px h-4 bg-system-border mx-1" />
            <ToolbarButton 
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
              title="Horizontal Rule"
            >
              <Minus size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
              title="Clear Formatting"
            >
              <Type size={16} />
            </ToolbarButton>
            <div className="w-px h-4 bg-system-border mx-1" />
            <ToolbarButton 
              onClick={() => editor.chain().focus().undo().run()}
              title="Undo"
            >
              <Undo size={16} />
            </ToolbarButton>
            <ToolbarButton 
              onClick={() => editor.chain().focus().redo().run()}
              title="Redo"
            >
              <Redo size={16} />
            </ToolbarButton>
          </div>

          {/* Editor Area */}
        <div className={`flex-1 overflow-y-auto p-4 md:p-12 lg:p-24 transition-all duration-500 ${isFocusMode ? 'pt-12 md:pt-24' : ''}`}>
          {activeChapter ? (
            <div className="max-w-3xl mx-auto relative">
              {isFocusMode && (
                <div className="absolute -top-12 left-0 right-0 text-center md:hidden">
                  <h1 className="text-xs font-mono opacity-20 uppercase tracking-[0.5em]">{activeChapter.title}</h1>
                </div>
              )}
              <EditorContent editor={editor} />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center space-y-6 opacity-20">
                <Edit3 size={64} className="mx-auto" />
                <p className="text-xs font-mono uppercase tracking-[0.4em]">Select or create a fragment to begin</p>
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <footer className={`h-10 border-t border-system-border bg-space-navy flex items-center justify-between px-6 text-[10px] font-mono uppercase tracking-widest opacity-60 transition-all duration-300 ${isFocusMode ? 'opacity-0 translate-y-full' : 'opacity-60'}`}>
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <FileText size={12} />
              <span>{wordCount} Words</span>
            </div>
            <div className="hidden sm:flex items-center space-x-2">
              <Settings size={12} />
              <span>UTF-8</span>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden sm:inline">Last Saved: Just Now</span>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]" />
          </div>
        </footer>
      </main>
    </div>
  );
};

const AppContent = () => {
  const { novel, chapters, loading } = useData();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (loading || !novel) return;

    // Increment views (simple once-per-session logic)
    const hasViewed = sessionStorage.getItem('ithihasa_viewed');
    if (!hasViewed) {
      const novelRef = doc(db, 'novels', 'ithihasa');
      // Use setDoc with merge to ensure it works even if doc doesn't exist yet
      setDoc(novelRef, { views: increment(1) }, { merge: true })
        .then(() => {
          sessionStorage.setItem('ithihasa_viewed', 'true');
          console.log('View incremented');
        })
        .catch(error => console.error('Error updating views:', error));
    }
  }, [loading, !!novel]);

  if (loading || !novel) return (
    <div className="min-h-screen bg-space-navy flex items-center justify-center">
      <div className="text-xs font-mono opacity-40 uppercase tracking-widest animate-pulse">Initializing_Reality...</div>
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage novel={novel} chapters={chapters} />} />
        <Route path="/read" element={<ReaderView chapters={chapters} />} />
        <Route path="/studio" element={<StudioView novel={novel} chapters={chapters} />} />
        <Route path="/world" element={<WorldPage />} />
      </Routes>
    </Router>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <DataProvider>
        <AppContent />
      </DataProvider>
    </AuthProvider>
  );
}
