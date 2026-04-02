import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Line } from 'react-konva';
import { ChevronLeft, Image as ImageIcon, Type, Pencil, Move, Trash2, Undo, Redo } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, onSnapshot, setDoc, deleteDoc, doc, handleFirestoreError, OperationType } from '../firebase';

interface Element {
  id: string;
  type: 'image' | 'text' | 'line';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  points?: number[];
  src?: string;
  color?: string;
  fontSize?: number;
  userId?: string;
}

const URLImage = ({ src, x, y, width, height, draggable, onDragEnd, onDblClick }: any) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new window.Image();
    img.src = src;
    img.onload = () => setImage(img);
  }, [src]);

  return (
    <KonvaImage
      image={image || undefined}
      x={x}
      y={y}
      width={width}
      height={height}
      draggable={draggable}
      onDragEnd={onDragEnd}
      onDblClick={onDblClick}
    />
  );
};

export const WorldPage = () => {
  const [elements, setElements] = useState<Element[]>([]);
  const [history, setHistory] = useState<Element[][]>([]);
  const [historyStep, setHistoryStep] = useState(-1);
  const [activeLine, setActiveLine] = useState<Element | null>(null);
  const [tool, setTool] = useState<'select' | 'pencil' | 'text' | 'image'>('select');
  const isDrawing = useRef(false);
  const stageRef = useRef<any>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'world_elements'), (snapshot) => {
      const fetchedElements = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Element[];
      setElements(fetchedElements);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'world_elements'));

    return unsubscribe;
  }, []);

  // Save current state to history
  const saveToHistory = (newElements: Element[]) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push([...newElements]);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  // Sync a specific state back to Firestore
  const syncStateToFirestore = async (targetElements: Element[]) => {
    try {
      // 1. Find elements to delete (in current elements but not in target)
      const toDelete = elements.filter(el => !targetElements.find(t => t.id === el.id));
      await Promise.all(toDelete.map(el => deleteDoc(doc(db, 'world_elements', el.id))));

      // 2. Find elements to add or update
      await Promise.all(targetElements.map(el => setDoc(doc(db, 'world_elements', el.id), el)));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'world_elements/sync');
    }
  };

  const undo = () => {
    if (historyStep > 0) {
      const prevState = history[historyStep - 1];
      setHistoryStep(historyStep - 1);
      syncStateToFirestore(prevState);
    }
  };

  const redo = () => {
    if (historyStep < history.length - 1) {
      const nextState = history[historyStep + 1];
      setHistoryStep(historyStep + 1);
      syncStateToFirestore(nextState);
    }
  };

  // Update history when elements change from external sources (initial load)
  useEffect(() => {
    if (elements.length > 0 && history.length === 0) {
      setHistory([[...elements]]);
      setHistoryStep(0);
    }
  }, [elements]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyStep, history]);

  const handleMouseDown = (e: any) => {
    if (tool !== 'pencil') return;
    isDrawing.current = true;
    const pos = e.target.getStage().getPointerPosition();
    const id = Date.now().toString();
    const newElement: Element = {
      id,
      type: 'line',
      x: 0,
      y: 0,
      points: [pos.x, pos.y],
      color: '#40E0D0'
    };
    setActiveLine(newElement);
  };

  const handleMouseMove = (e: any) => {
    if (!isDrawing.current || tool !== 'pencil' || !activeLine) return;
    const stage = e.target.getStage();
    const point = stage.getPointerPosition();
    
    const newPoints = [...(activeLine.points || []), point.x, point.y];
    setActiveLine({ ...activeLine, points: newPoints });
  };

  const handleMouseUp = async () => {
    if (isDrawing.current && activeLine) {
      try {
        await setDoc(doc(db, 'world_elements', activeLine.id), activeLine);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'world_elements');
      }
    }
    isDrawing.current = false;
    if (activeLine) {
      saveToHistory([...elements, activeLine]);
    }
    setActiveLine(null);
  };

  const addText = () => {
    const text = prompt('Enter text:');
    if (text) {
      const id = Date.now().toString();
      const newElement: Element = {
        id,
        type: 'text',
        x: 100,
        y: 100,
        text,
        color: '#ffffff',
        fontSize: 20
      };
      saveToHistory([...elements, newElement]);
      setDoc(doc(db, 'world_elements', id), newElement)
        .catch(error => handleFirestoreError(error, OperationType.CREATE, 'world_elements'));
    }
  };

  const addImage = () => {
    const url = prompt('Enter image URL:');
    if (url) {
      const id = Date.now().toString();
      const newElement: Element = {
        id,
        type: 'image',
        x: 200,
        y: 200,
        width: 200,
        height: 200,
        src: url
      };
      saveToHistory([...elements, newElement]);
      setDoc(doc(db, 'world_elements', id), newElement)
        .catch(error => handleFirestoreError(error, OperationType.CREATE, 'world_elements'));
    }
  };

  const clearBoard = async () => {
    if (window.confirm('Clear the entire board?')) {
      try {
        saveToHistory([]);
        await Promise.all(elements.map(el => deleteDoc(doc(db, 'world_elements', el.id))));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'world_elements');
      }
    }
  };

  const deleteElement = async (id: string) => {
    try {
      saveToHistory(elements.filter(el => el.id !== id));
      await deleteDoc(doc(db, 'world_elements', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `world_elements/${id}`);
    }
  };

  const updateElementPos = async (id: string, x: number, y: number) => {
    try {
      const updatedElements = elements.map(el => el.id === id ? { ...el, x, y } : el);
      saveToHistory(updatedElements);
      await setDoc(doc(db, 'world_elements', id), { x, y }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `world_elements/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-space-navy flex flex-col overflow-hidden">
      <header className="h-16 border-b border-system-border flex items-center justify-between px-8 bg-space-navy/80 backdrop-blur-md z-50">
        <div className="flex items-center space-x-6">
          <Link to="/" className="flex items-center space-x-2 text-xs font-mono opacity-60 hover:opacity-100 uppercase tracking-widest">
            <ChevronLeft size={16} />
            <span>Library</span>
          </Link>
          <div className="h-6 w-px bg-system-border" />
          <h1 className="font-bold uppercase tracking-tighter text-lg italic">World_Board</h1>
        </div>

        <div className="flex items-center space-x-2 bg-black/40 p-1 system-border">
          <button 
            onClick={() => setTool('select')}
            className={`p-2 transition-all ${tool === 'select' ? 'bg-system-blue/20 text-system-blue' : 'opacity-40 hover:opacity-100'}`}
            title="Select & Move"
          >
            <Move size={18} />
          </button>
          <button 
            onClick={() => setTool('pencil')}
            className={`p-2 transition-all ${tool === 'pencil' ? 'bg-system-blue/20 text-system-blue' : 'opacity-40 hover:opacity-100'}`}
            title="Pencil Tool"
          >
            <Pencil size={18} />
          </button>
          <button 
            onClick={addText}
            className="p-2 opacity-40 hover:opacity-100 transition-all"
            title="Add Text"
          >
            <Type size={18} />
          </button>
          <button 
            onClick={addImage}
            className="p-2 opacity-40 hover:opacity-100 transition-all"
            title="Add Image"
          >
            <ImageIcon size={18} />
          </button>
          <div className="w-px h-6 bg-system-border mx-2" />
          <button 
            onClick={undo}
            disabled={historyStep <= 0}
            className={`p-2 transition-all ${historyStep <= 0 ? 'opacity-10 cursor-not-allowed' : 'opacity-40 hover:opacity-100'}`}
            title="Undo"
          >
            <Undo size={18} />
          </button>
          <button 
            onClick={redo}
            disabled={historyStep >= history.length - 1}
            className={`p-2 transition-all ${historyStep >= history.length - 1 ? 'opacity-10 cursor-not-allowed' : 'opacity-40 hover:opacity-100'}`}
            title="Redo"
          >
            <Redo size={18} />
          </button>
          <div className="w-px h-6 bg-system-border mx-2" />
          <button 
            onClick={clearBoard}
            className="p-2 opacity-40 hover:opacity-100 hover:text-red-500 transition-all"
            title="Clear Board"
          >
            <Trash2 size={18} />
          </button>
        </div>

        <div className="text-[10px] font-mono opacity-40 uppercase tracking-widest">
          Reality_Sync: Active
        </div>
      </header>

      <main className="flex-1 relative bg-space-navy">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" 
             style={{ 
               backgroundImage: 'radial-gradient(#40E0D0 1px, transparent 1px)', 
               backgroundSize: '40px 40px' 
             }} 
        />
        
        <Stage
          width={window.innerWidth}
          height={window.innerHeight - 64}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          ref={stageRef}
        >
          <Layer>
            {elements.map((el) => {
              if (el.type === 'line') {
                return (
                  <Line
                    key={el.id}
                    points={el.points}
                    stroke={el.color}
                    strokeWidth={3}
                    tension={0.5}
                    lineCap="round"
                    draggable={tool === 'select'}
                  />
                );
              }
              if (el.type === 'text') {
                return (
                  <Text
                    key={el.id}
                    text={el.text}
                    x={el.x}
                    y={el.y}
                    fontSize={el.fontSize}
                    fill={el.color}
                    draggable={tool === 'select'}
                    onDragEnd={(e) => {
                      updateElementPos(el.id, e.target.x(), e.target.y());
                    }}
                    onDblClick={() => deleteElement(el.id)}
                  />
                );
              }
              if (el.type === 'image') {
                return (
                  <URLImage
                    key={el.id}
                    src={el.src}
                    x={el.x}
                    y={el.y}
                    width={el.width}
                    height={el.height}
                    draggable={tool === 'select'}
                    onDragEnd={(e: any) => {
                      updateElementPos(el.id, e.target.x(), e.target.y());
                    }}
                    onDblClick={() => deleteElement(el.id)}
                  />
                );
              }
              return null;
            })}
            {activeLine && (
              <Line
                points={activeLine.points}
                stroke={activeLine.color}
                strokeWidth={3}
                tension={0.5}
                lineCap="round"
              />
            )}
          </Layer>
        </Stage>

        <div className="absolute bottom-8 right-8 pointer-events-none">
          <div className="system-box p-4 bg-space-navy/80 backdrop-blur-md space-y-2">
            <p className="text-[10px] font-mono text-system-blue uppercase tracking-widest">Controls</p>
            <ul className="text-[9px] font-mono opacity-40 space-y-1">
              <li>• Drag to move elements (Select tool)</li>
              <li>• Double click to delete</li>
              <li>• Pencil to draw reality lines</li>
              <li>• Ctrl+Z / Ctrl+Y for Undo/Redo</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
};
