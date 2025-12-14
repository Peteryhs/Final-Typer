/**
 * Debug Panel Component
 *
 * Displays real-time debug information during typing:
 * - Current buffer state
 * - Step-by-step execution log
 * - Toggle for disabling double-typing errors
 * - Draggable and resizable window
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    Paper,
    Typography,
    IconButton,
    Switch,
    FormControlLabel,
    Chip,
    Divider,
    Collapse,
    Slider,
} from '@mui/material';
import {
    BugReport,
    Close,
    ExpandMore,
    ExpandLess,
    Delete,
    DragIndicator,
    Settings,
} from '@mui/icons-material';

// Shared state types
export interface DebugLogEntry {
    timestamp: number;
    stepNumber: number;
    action: string;
    detail: string;
    buffer: string;
    caret: number;
    level: 'info' | 'warn' | 'error' | 'debug';
}

interface DebugPanelProps {
    isOpen: boolean;
    onClose: () => void;
    logs: DebugLogEntry[];
    currentBuffer: string;
    currentCaret: number;
    onClearLogs: () => void;
    disableDoubleTap: boolean;
    onToggleDoubleTap: (disabled: boolean) => void;
}

function formatBuffer(buffer: string, caret: number): string {
    const display = buffer.replace(/\n/g, '↵');
    return display.slice(0, caret) + '|' + display.slice(caret);
}

function LogEntry({ entry }: { entry: DebugLogEntry }) {
    const levelColors = {
        info: '#90caf9',
        warn: '#ffb74d',
        error: '#f44336',
        debug: '#b0bec5',
    };

    return (
        <Box
            sx={{
                fontFamily: '"Fira Code", "Consolas", monospace',
                fontSize: '0.7rem',
                lineHeight: 1.3,
                py: 0.25,
                px: 0.5,
                borderLeft: `2px solid ${levelColors[entry.level]}`,
                bgcolor: 'rgba(0,0,0,0.15)',
                mb: 0.25,
                borderRadius: '0 2px 2px 0',
            }}
        >
            <Box sx={{ display: 'flex', gap: 0.5, color: 'text.secondary' }}>
                <span style={{ color: levelColors[entry.level], minWidth: 40, fontSize: '0.65rem' }}>
                    [{entry.stepNumber.toString().padStart(4, ' ')}]
                </span>
                <span style={{ color: '#fff', minWidth: 80, fontSize: '0.65rem' }}>{entry.action}</span>
                <span style={{ color: '#aaa', flex: 1, fontSize: '0.65rem' }}>{entry.detail}</span>
            </Box>
            <Box sx={{ color: '#4caf50', pl: 5, fontSize: '0.65rem' }}>
                "{formatBuffer(entry.buffer, entry.caret)}"
            </Box>
        </Box>
    );
}

export function DebugPanel({
    isOpen,
    onClose,
    logs,
    currentBuffer,
    currentCaret,
    onClearLogs,
    disableDoubleTap,
    onToggleDoubleTap,
}: DebugPanelProps) {
    const logsEndRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const [expanded, setExpanded] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true);

    // Dragging state
    const [position, setPosition] = useState({ x: 16, y: 16 }); // bottom-right offset
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    // Resizing state
    const [size, setSize] = useState({ width: 600, height: 500 });
    const [isResizing, setIsResizing] = useState(false);
    const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

    // Display settings
    const [bufferHeight, setBufferHeight] = useState(80);
    const [historyHeight, setHistoryHeight] = useState(300);
    const [visibleLogs, setVisibleLogs] = useState(500); // How many logs to render

    // Auto-scroll to bottom when new logs come in
    useEffect(() => {
        if (logsEndRef.current && expanded && autoScroll) {
            logsEndRef.current.scrollIntoView({ behavior: 'auto' });
        }
    }, [logs, expanded, autoScroll]);

    // Drag handlers
    const handleDragStart = useCallback(
        (e: React.MouseEvent) => {
            if (!panelRef.current) return;
            e.preventDefault();
            setIsDragging(true);
            const rect = panelRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
            });
        },
        []
    );

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            const newX = window.innerWidth - e.clientX - (size.width - dragOffset.x);
            const newY = window.innerHeight - e.clientY - (size.height - dragOffset.y);
            setPosition({
                x: Math.max(0, Math.min(newX, window.innerWidth - size.width)),
                y: Math.max(0, Math.min(newY, window.innerHeight - size.height)),
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset, size]);

    // Resize handlers
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            width: size.width,
            height: size.height,
        };
    }, [size]);

    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            const deltaX = resizeStartRef.current.x - e.clientX;
            const deltaY = resizeStartRef.current.y - e.clientY;
            setSize({
                width: Math.max(400, Math.min(1200, resizeStartRef.current.width + deltaX)),
                height: Math.max(300, Math.min(800, resizeStartRef.current.height + deltaY)),
            });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing]);

    if (!isOpen) return null;

    const displayedLogs = logs.slice(-visibleLogs);

    return (
        <Paper
            ref={panelRef}
            elevation={8}
            sx={{
                position: 'fixed',
                bottom: position.y,
                right: position.x,
                width: size.width,
                height: expanded ? size.height : 48,
                bgcolor: 'rgba(20, 18, 24, 0.98)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 2,
                overflow: 'hidden',
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                transition: isDragging || isResizing ? 'none' : 'height 0.2s ease',
                cursor: isDragging ? 'grabbing' : 'default',
            }}
        >
            {/* Resize handle (top-left corner) */}
            <Box
                onMouseDown={handleResizeStart}
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 16,
                    height: 16,
                    cursor: 'nwse-resize',
                    zIndex: 10,
                    '&::before': {
                        content: '""',
                        position: 'absolute',
                        top: 4,
                        left: 4,
                        width: 8,
                        height: 8,
                        borderTop: '2px solid rgba(255,255,255,0.3)',
                        borderLeft: '2px solid rgba(255,255,255,0.3)',
                    },
                }}
            />

            {/* Header - Draggable */}
            <Box
                onMouseDown={handleDragStart}
                sx={{
                    px: 1.5,
                    py: 0.75,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderBottom: expanded ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    bgcolor: 'rgba(103, 80, 164, 0.4)',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    userSelect: 'none',
                }}
            >
                <DragIndicator sx={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }} />
                <BugReport color="primary" sx={{ fontSize: 18 }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 600, flex: 1, fontSize: '0.85rem' }}>
                    Debug Console
                </Typography>
                <Chip
                    label={`${logs.length.toLocaleString()} logs`}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.1)' }}
                />
                <IconButton size="small" onClick={() => setShowSettings(!showSettings)} title="Settings">
                    <Settings sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton size="small" onClick={() => setExpanded(!expanded)}>
                    {expanded ? <ExpandMore sx={{ fontSize: 16 }} /> : <ExpandLess sx={{ fontSize: 16 }} />}
                </IconButton>
                <IconButton size="small" onClick={onClose}>
                    <Close sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            <Collapse in={expanded} sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                    {/* Settings Panel */}
                    <Collapse in={showSettings}>
                        <Box sx={{ px: 2, py: 1.5, bgcolor: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                Panel Settings
                            </Typography>

                            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                <Box sx={{ flex: 1, minWidth: 120 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Buffer Height: {bufferHeight}px
                                    </Typography>
                                    <Slider
                                        size="small"
                                        value={bufferHeight}
                                        onChange={(_, v) => setBufferHeight(v as number)}
                                        min={40}
                                        max={200}
                                    />
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 120 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        History Height: {historyHeight}px
                                    </Typography>
                                    <Slider
                                        size="small"
                                        value={historyHeight}
                                        onChange={(_, v) => setHistoryHeight(v as number)}
                                        min={100}
                                        max={600}
                                    />
                                </Box>
                                <Box sx={{ flex: 1, minWidth: 120 }}>
                                    <Typography variant="caption" color="text.secondary">
                                        Visible Logs: {visibleLogs}
                                    </Typography>
                                    <Slider
                                        size="small"
                                        value={visibleLogs}
                                        onChange={(_, v) => setVisibleLogs(v as number)}
                                        min={100}
                                        max={10000}
                                        step={100}
                                    />
                                </Box>
                            </Box>
                        </Box>
                    </Collapse>

                    {/* Current Buffer Display */}
                    <Box sx={{ px: 1.5, py: 1, bgcolor: 'rgba(0,0,0,0.2)' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: '0.7rem' }}>
                            Current Buffer ({currentBuffer.length} chars):
                        </Typography>
                        <Box
                            sx={{
                                fontFamily: '"Fira Code", "Consolas", monospace',
                                fontSize: '0.8rem',
                                color: '#4caf50',
                                bgcolor: 'rgba(0,0,0,0.4)',
                                p: 1,
                                borderRadius: 1,
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                height: bufferHeight,
                                overflowY: 'auto',
                            }}
                        >
                            "{formatBuffer(currentBuffer, currentCaret)}"
                        </Box>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                    {/* Controls */}
                    <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={disableDoubleTap}
                                    onChange={(e) => onToggleDoubleTap(e.target.checked)}
                                />
                            }
                            label={
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                    Disable Double-Tap
                                </Typography>
                            }
                            sx={{ mr: 0 }}
                        />
                        <FormControlLabel
                            control={
                                <Switch size="small" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                            }
                            label={
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                    Auto-scroll
                                </Typography>
                            }
                            sx={{ mr: 0 }}
                        />
                        <Box sx={{ flex: 1 }} />
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                            Showing {displayedLogs.length} of {logs.length}
                        </Typography>
                        <IconButton size="small" onClick={onClearLogs} title="Clear logs">
                            <Delete sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                    {/* Log List */}
                    <Box
                        sx={{
                            flex: 1,
                            overflowY: 'auto',
                            p: 0.5,
                            minHeight: 0,
                            maxHeight: historyHeight,
                        }}
                    >
                        {displayedLogs.length === 0 ? (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{ display: 'block', textAlign: 'center', py: 2 }}
                            >
                                No logs yet. Start typing to see debug output.
                            </Typography>
                        ) : (
                            displayedLogs.map((log, idx) => <LogEntry key={`${log.timestamp}-${idx}`} entry={log} />)
                        )}
                        <div ref={logsEndRef} />
                    </Box>
                </Box>
            </Collapse>
        </Paper>
    );
}

// Hook for managing debug state - stores up to 10,000 log entries
const MAX_LOGS = 10000;

export function useDebugPanel() {
    const [isDebugOpen, setIsDebugOpen] = useState(false);
    const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
    const [currentBuffer, setCurrentBuffer] = useState('');
    const [currentCaret, setCurrentCaret] = useState(0);
    const [disableDoubleTap, setDisableDoubleTap] = useState(false);

    const addLog = useCallback((entry: Omit<DebugLogEntry, 'timestamp'>) => {
        setDebugLogs((prev) => {
            const newLogs = [...prev, { ...entry, timestamp: Date.now() }];
            // Keep only the last MAX_LOGS entries
            return newLogs.length > MAX_LOGS ? newLogs.slice(-MAX_LOGS) : newLogs;
        });
        setCurrentBuffer(entry.buffer);
        setCurrentCaret(entry.caret);
    }, []);

    const clearLogs = useCallback(() => {
        setDebugLogs([]);
        setCurrentBuffer('');
        setCurrentCaret(0);
    }, []);

    return {
        isDebugOpen,
        setIsDebugOpen,
        debugLogs,
        addLog,
        clearLogs,
        currentBuffer,
        currentCaret,
        disableDoubleTap,
        setDisableDoubleTap,
    };
}

export default DebugPanel;
