import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ThemeProvider, createTheme, CssBaseline,
  Box, Drawer, ListItemButton, ListItemIcon,
  Typography, IconButton, Button, TextField,
  Paper, Divider, Stack, Switch,
  CircularProgress, Tooltip, Grid
} from '@mui/material';
import {
  PlayArrow, Stop, TextFields,
  Settings, ContentPaste, Delete,
  FlashOn, Palette, Monitor,
  DarkMode, LightMode, OpenInFull,
  BugReport, FileUpload, FileDownload, Code
} from '@mui/icons-material';
import { textAnalysis, TextAnalysisResult } from './lib/analysis';
import { estimateTypingSeconds } from './lib/typing/estimate';
import { solveWpmForTargetSeconds } from './lib/typing/solve';
import { DEFAULT_ADVANCED_SETTINGS } from './lib/typing/defaults';
import { motion, AnimatePresence } from 'framer-motion';
import TitleBar from './components/TitleBar';
import ConfigPanel from './components/ConfigPanel';
import { DebugPanel, useDebugPanel } from './components/DebugPanel';

// Hook for local storage persistence
function useStickyState<T>(defaultValue: T, key: string): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const stickyValue = localStorage.getItem(key);
    if (stickyValue === null) return defaultValue;
    const parsed = JSON.parse(stickyValue);
    // Shallow-merge saved objects with defaults to allow painless setting migrations.
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      defaultValue &&
      typeof defaultValue === 'object' &&
      !Array.isArray(defaultValue)
    ) {
      return { ...(defaultValue as any), ...(parsed as any) };
    }
    return parsed;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  // Sync across windows (main <-> overlay)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue) {
        try {
          setValue(JSON.parse(e.newValue));
        } catch (err) {
          console.error('Failed to parse storage update', err);
        }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [value, setValue];
}

// Color Palettes Definition
const colorPalettes: Record<string, {
  light: { primary: string; secondary: string; background: string; surface: string };
  dark: { primary: string; secondary: string; background: string; surface: string };
}> = {
  violet: {
    light: { primary: '#6750A4', secondary: '#625B71', background: '#FDF8FD', surface: '#F3EDF7' },
    dark: { primary: '#D0BCFF', secondary: '#CCC2DC', background: '#141218', surface: '#1D1B20' }
  },
  blue: {
    light: { primary: '#0061A4', secondary: '#535F70', background: '#FDFCFF', surface: '#E1E7EC' },
    dark: { primary: '#A8C7FA', secondary: '#D6E3FF', background: '#121619', surface: '#1A2026' } // Slate Blue Tint
  },
  green: {
    light: { primary: '#206C2F', secondary: '#526350', background: '#FCFDF6', surface: '#E0E6DE' },
    dark: { primary: '#8CD699', secondary: '#BCCBBF', background: '#0E1510', surface: '#19211B' } // Deep Green Tint
  },
  orange: {
    light: { primary: '#8B5000', secondary: '#6F5B40', background: '#FFF8F1', surface: '#F0E0CF' },
    dark: { primary: '#FFB74D', secondary: '#DDC2A1', background: '#18120C', surface: '#241E18' } // Deep Orange/Brown Tint
  }
};

// --- OVERLAY COMPONENT ---
interface OverlayModeProps {
  stats: TextAnalysisResult | null;
  textLength: number;
}

function OverlayMode({ stats: _stats, textLength }: OverlayModeProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Listen for auto-collapse from main process (blur)
    const cleanup = window.electronAPI.onOverlayCollapsed(() => {
      setIsExpanded(false);
    });
    return cleanup;
  }, []);

  // Track progress via debug logs
  useEffect(() => {
    const cleanup = window.electronAPI.onDebugLog((log) => {
      if (textLength > 0 && typeof log.caret === 'number') {
        const p = Math.min(1, Math.max(0, log.caret / textLength));
        setProgress(p);
      }
    });
    return cleanup;
  }, [textLength]);

  const setExpanded = (expanded: boolean) => {
    if (isExpanded === expanded) return;
    setIsExpanded(expanded);
    // If expanding, resize window immediately to fit the panel
    if (expanded) {
      window.electronAPI.setOverlayExpanded(true);
    }
  };

  const handleToggleTyping = async () => {
    if (isTyping) {
      window.electronAPI.stopTyping();
      setIsTyping(false);
    } else {
      setIsTyping(true);
      setProgress(0); // Reset progress on start
      try {
        await window.electronAPI.signalStart();
      } catch (e) {
        console.error(e);
      } finally {
        setIsTyping(false);
      }
    }
  };

  const handleBackToMain = () => {
    window.electronAPI.toggleOverlay();
  };

  const collapseTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterPanel = () => {
    if (collapseTimeout.current) {
      clearTimeout(collapseTimeout.current);
      collapseTimeout.current = null;
    }
  };

  const handleMouseLeavePanel = () => {
    collapseTimeout.current = setTimeout(() => {
      setExpanded(false);
    }, 400);
  };

  return (
    <Box sx={{ width: '100%', height: '100%' }}>
      <AnimatePresence mode="wait" onExitComplete={() => {
        // If we just collapsed (isExpanded is false), NOW shrink the electron window
        if (!isExpanded) {
          window.electronAPI.setOverlayExpanded(false);
        }
      }}>
        {!isExpanded ? (
          <Box
            key="triangle"
            component={motion.div}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.2 }}
            sx={{
              width: '100%',
              height: '100%',
              position: 'relative',
              transformOrigin: 'top left',
              pointerEvents: 'none', // Container doesn't block clicks
            }}
          >
            {/* Triangle shape using CSS clip-path */}
            <Box
              className="triangle"
              onMouseEnter={() => setExpanded(true)}
              onClick={() => setExpanded(true)}
              sx={{
                width: 40,
                height: 40,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(200,200,200,0.9) 100%)',
                clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                borderRadius: '4px 0 0 0',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                position: 'relative',
                cursor: 'pointer',
                pointerEvents: 'auto', // Only triangle captures clicks
                '&:hover': {
                  transform: 'scale(1.1)',
                  boxShadow: '0 0 12px rgba(255,255,255,0.5)',
                },
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: isTyping ? '#4caf50' : 'rgba(0,0,0,0.3)',
                  boxShadow: isTyping ? '0 0 6px #4caf50' : 'none',
                  transition: 'all 0.3s',
                },
              }}
            />
          </Box>
        ) : (
          <Paper
            key="panel"
            onMouseEnter={handleMouseEnterPanel}
            onMouseLeave={handleMouseLeavePanel}
            component={motion.div}
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.2 }}
            style={{ transformOrigin: 'top left' }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            elevation={8}
            sx={{
              width: '100%',
              height: '100%',
              bgcolor: 'rgba(28, 27, 31, 0.95)',
              backdropFilter: 'blur(12px)',
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.1)',
              px: 1.5,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1,
              WebkitAppRegion: 'drag',
              '& button': { WebkitAppRegion: 'no-drag' },
            }}
          >
            {/* Circular Progress */}
            <Box sx={{ position: 'relative', width: 36, height: 36 }}>
              <CircularProgress
                variant="determinate"
                value={progress * 100}
                size={36}
                thickness={4}
                sx={{ color: 'primary.main' }}
              />
              <Typography
                variant="caption"
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  color: 'text.secondary',
                }}
              >
                {Math.round(progress * 100)}
              </Typography>
            </Box>

            {/* Play/Pause Button */}
            <IconButton
              onClick={handleToggleTyping}
              size="small"
              sx={{
                bgcolor: isTyping ? 'error.main' : 'primary.main',
                color: 'white',
                width: 36,
                height: 36,
                '&:hover': {
                  bgcolor: isTyping ? 'error.dark' : 'primary.dark',
                },
              }}
            >
              {isTyping ? <Stop sx={{ fontSize: 20 }} /> : <PlayArrow sx={{ fontSize: 20 }} />}
            </IconButton>

            {/* Open Main Window Button */}
            <IconButton
              onClick={handleBackToMain}
              size="small"
              sx={{
                color: 'text.secondary',
                width: 36,
                height: 36,
                '&:hover': { color: 'text.primary' },
              }}
            >
              <OpenInFull sx={{ fontSize: 18 }} />
            </IconButton>
          </Paper>
        )}
      </AnimatePresence>
    </Box>
  );
}

// --- MAIN APP ---
function App() {
  // Check mode
  const isOverlay = new URLSearchParams(window.location.search).get('mode') === 'overlay';

  const [text, setText] = useStickyState('', 'ft_text');
  const [speed, setSpeed] = useStickyState(65, 'ft_speed');
  const [speedMode, setSpeedMode] = useStickyState<'constant' | 'dynamic'>('constant', 'ft_speed_mode');
  const [speedVariance, setSpeedVariance] = useStickyState(0.2, 'ft_speed_variance');
  const [mistakeRatePercent, setMistakeRatePercent] = useStickyState(5, 'ft_mistake');
  const [fatigueMode, setFatigueMode] = useStickyState(true, 'ft_fatigue');

  // Theme State
  const [seedColor, setSeedColor] = useStickyState('violet', 'ft_theme_seed');
  const [mode, setMode] = useStickyState<'light' | 'dark'>('dark', 'ft_theme_mode');

  // Config Mode State
  const [configMode, setConfigMode] = useStickyState<'smart' | 'custom'>('smart', 'ft_config_mode');
  const [targetMinutes, setTargetMinutes] = useStickyState(5, 'ft_smart_min');
  const [targetSeconds, setTargetSeconds] = useStickyState(0, 'ft_smart_sec');

  // Advanced State
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advanced, setAdvanced] = useStickyState(DEFAULT_ADVANCED_SETTINGS, 'ft_adv_all');

  const [stats, setStats] = useState<TextAnalysisResult | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<'write' | 'settings'>('write');
  const [countdown, setCountdown] = useState<number | null>(null);

  // Auto-overlay setting
  const [autoOverlayEnabled, setAutoOverlayEnabled] = useStickyState(true, 'ft_auto_overlay');

  // Debug Panel State
  const {
    isDebugOpen,
    setIsDebugOpen,
    debugLogs,
    addLog,
    clearLogs,
    currentBuffer,
    currentCaret,
    disableDoubleTap,
    setDisableDoubleTap,
  } = useDebugPanel();

  // Listen for debug logs from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI.onDebugLog((log) => {
      addLog(log);
    });
    return () => unsubscribe();
  }, [addLog]);

  // Sync disable-double-tap setting with main process
  useEffect(() => {
    window.electronAPI.setDisableDoubleTap(disableDoubleTap);
  }, [disableDoubleTap]);

  // Sync typing state with main process (for auto-overlay)
  useEffect(() => {
    window.electronAPI.setTypingState(isTyping);
  }, [isTyping]);

  // Sync auto-overlay setting with main process
  useEffect(() => {
    window.electronAPI.setAutoOverlayEnabled(autoOverlayEnabled);
  }, [autoOverlayEnabled]);

  useEffect(() => {
    const res = textAnalysis(text);
    setStats(res);
  }, [text]);

  // Smart Mode Speed Calculation
  useEffect(() => {
    if (configMode === 'smart' && stats && stats.word_count > 0) {
      const totalSeconds = (targetMinutes * 60) + targetSeconds;
      if (totalSeconds > 0) {
        const calculatedMistakeRate = mistakeRatePercent / 100;
        const baseOptions = {
          speedMode: 'dynamic' as const,
          speedVariance: 0.15,
          mistakeRate: calculatedMistakeRate,
          fatigueMode,
          analysis: stats,
          advanced,
        };
        const solved = solveWpmForTargetSeconds(text, baseOptions, totalSeconds, { minWpm: 10, maxWpm: 350 });
        setSpeed(Math.max(10, Math.min(solved.wpm, 999)));
        setSpeedMode('dynamic');
        setSpeedVariance(0.15);
      }
    }
  }, [configMode, stats, targetMinutes, targetSeconds, setSpeed, setSpeedMode, setSpeedVariance, text, mistakeRatePercent, fatigueMode, advanced]);

  const theme = useMemo(() => {
    const palette = colorPalettes[seedColor][mode];
    // Force Dark mode for Overlay to look cool/unobtrusive
    const appliedMode = isOverlay ? 'dark' : mode;
    const appliedPalette = isOverlay ? colorPalettes[seedColor].dark : palette;

    return createTheme({
      palette: {
        mode: appliedMode,
        primary: { main: appliedPalette.primary },
        secondary: { main: appliedPalette.secondary },
        background: {
          default: isOverlay ? 'transparent' : appliedPalette.background,
          paper: isOverlay ? 'transparent' : appliedPalette.surface
        },
      },
      typography: {
        fontFamily: '"Roboto Flex", "Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h1: { fontSize: '2rem', fontWeight: 400, lineHeight: 1.2 },
        h2: { fontSize: '1.5rem', fontWeight: 400 },
        subtitle1: { fontSize: '1.125rem', fontWeight: 500 },
        body1: { fontSize: '1rem', letterSpacing: 0.15 },
        body2: { fontSize: '0.875rem', letterSpacing: 0.25 },
        button: { textTransform: 'none', fontWeight: 500, letterSpacing: 0.1 },
      },
      shape: { borderRadius: 16 },
      components: {
        MuiButton: {
          styleOverrides: {
            root: { borderRadius: 100, padding: '10px 24px' },
            contained: { boxShadow: 'none', '&:hover': { boxShadow: '0px 1px 3px 1px rgba(0, 0, 0, 0.15)' } },
            outlined: { borderColor: appliedMode === 'dark' ? '#938F99' : '#79747E' }
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: { backgroundImage: 'none' },
            rounded: { borderRadius: 16 },
            outlined: { borderColor: appliedMode === 'dark' ? '#49454F' : '#79747E', background: 'transparent' },
          },
        },
        MuiDrawer: {
          styleOverrides: {
            paper: { backgroundColor: appliedPalette.background, borderRight: 'none' }
          }
        },
        MuiListItemButton: { styleOverrides: { root: { borderRadius: 100 } } },
        MuiSwitch: {
          styleOverrides: {
            root: { width: 42, height: 24, padding: 0 },
            switchBase: {
              padding: 2,
              '&.Mui-checked': {
                transform: 'translateX(18px)',
                color: '#fff',
                '& + .MuiSwitch-track': {
                  opacity: 1,
                  backgroundColor: appliedPalette.primary,
                  border: 'none',
                },
              },
              '&.Mui-disabled + .MuiSwitch-track': {
                opacity: 0.3,
              },
            },
            thumb: {
              width: 20,
              height: 20,
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            },
            track: {
              borderRadius: 12,
              backgroundColor: appliedMode === 'dark' ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.25)',
              opacity: 1,
              border: appliedMode === 'dark' ? '1px solid rgba(255,255,255,0.1)' : 'none',
              transition: 'background-color 0.2s',
            },
          },
        },
        MuiSlider: { styleOverrides: { thumb: { width: 20, height: 20 } } },
      },
    });
  }, [seedColor, mode, isOverlay]);

  // Early return for Overlay
  if (isOverlay) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <OverlayMode stats={stats} textLength={text.length} />
      </ThemeProvider>
    );
  }

  const estimate = useMemo(() => {
    if (!text.trim() || !stats) return null;
    const calculatedMistakeRate = mistakeRatePercent / 100;
    return estimateTypingSeconds(
      text,
      {
        speed,
        speedMode,
        speedVariance,
        mistakeRate: calculatedMistakeRate,
        fatigueMode,
        analysis: stats,
        advanced,
      },
      3,
    );
  }, [text, stats, speed, speedMode, speedVariance, mistakeRatePercent, fatigueMode, advanced]);

  const estimatedTimeStr = useMemo(() => {
    const seconds = estimate?.meanSeconds ?? 0;
    if (!seconds || seconds <= 0) return '0s';
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s}s`;
  }, [estimate]);

  const syncConfig = useCallback(() => {
    if (!text.trim()) return;
    const analysis = textAnalysis(text);
    const calculatedMistakeRate = mistakeRatePercent / 100;
    window.electronAPI.setConfig({
      text,
      options: {
        speed,
        speedMode,
        speedVariance,
        mistakeRate: calculatedMistakeRate,
        fatigueMode,
        analysis,
        advanced
      }
    });
  }, [
    text,
    speed,
    speedMode,
    speedVariance,
    mistakeRatePercent,
    fatigueMode,
    advanced
  ]);

  useEffect(() => {
    syncConfig();
  }, [syncConfig]);

  const handleStart = async () => {
    if (!text.trim()) return;

    setIsTyping(true);

    // Countdown visual logic
    let count = 3;
    setCountdown(count);
    const timer = setInterval(() => {
      count--;
      if (count > 0) setCountdown(count);
      else {
        clearInterval(timer);
        setCountdown(null);
      }
    }, 1000);

    const analysis = textAnalysis(text);
    const calculatedMistakeRate = mistakeRatePercent / 100;

    try {
      await window.electronAPI.startTyping(text, {
        speed,
        speedMode,
        speedVariance,
        mistakeRate: calculatedMistakeRate,
        fatigueMode,
        analysis,
        advanced
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsTyping(false);
      setCountdown(null);
    }
  };

  const handleStop = () => {
    window.electronAPI.stopTyping();
    setIsTyping(false);
    setCountdown(null);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setText(text);
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  const drawerWidth = 88; // Standard Nav Rail width

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
        <TitleBar />
        <Box sx={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

          {/* Navigation Rail (Sidebar) */}
          <Drawer
            variant="permanent"
            sx={{
              width: drawerWidth,
              flexShrink: 0,
              [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 },
            }}
          >
            {/* ... (Keep existing Sidebar content) ... */}
            <Box sx={{ mb: 6, mt: 4 }}>
              <Paper
                elevation={0}
                sx={{
                  width: 48, height: 48, borderRadius: 3,
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 'bold', fontSize: '1.2rem'
                }}
              >
                FT
              </Paper>
            </Box>

            <Stack spacing={2} sx={{ width: '100%', alignItems: 'center' }}>
              <Tooltip title="Write & Configure" placement="right">
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  <ListItemButton
                    component={motion.div}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    selected={activeTab === 'write'}
                    onClick={() => setActiveTab('write')}
                    sx={{
                      width: 56,
                      height: 32,
                      borderRadius: 100,
                      justifyContent: 'center',
                      bgcolor: activeTab === 'write' ? 'rgba(74, 68, 88, 0.6)' : 'transparent', // Active indicator
                      '&.Mui-selected': { bgcolor: '#4A4458', color: '#E8DEF8' },
                      '&:hover': { bgcolor: activeTab === 'write' ? '#4A4458' : 'rgba(255,255,255,0.05)' }
                    }}
                  >
                    <ListItemIcon sx={{ justifyContent: 'center', minWidth: 0, color: activeTab === 'write' ? '#E8DEF8' : 'text.secondary' }}>
                      <TextFields fontSize="small" />
                    </ListItemIcon>
                  </ListItemButton>
                  <Typography variant="caption" color={activeTab === 'write' ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                    Write
                  </Typography>
                </Box>
              </Tooltip>

              <Tooltip title="Settings" placement="right">
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                  <ListItemButton
                    component={motion.div}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    selected={activeTab === 'settings'}
                    onClick={() => setActiveTab('settings')}
                    sx={{
                      width: 56,
                      height: 32,
                      borderRadius: 100,
                      justifyContent: 'center',
                      bgcolor: activeTab === 'settings' ? 'rgba(74, 68, 88, 0.6)' : 'transparent',
                      '&.Mui-selected': { bgcolor: '#4A4458', color: '#E8DEF8' },
                      '&:hover': { bgcolor: activeTab === 'settings' ? '#4A4458' : 'rgba(255,255,255,0.05)' }
                    }}
                  >
                    <ListItemIcon sx={{ justifyContent: 'center', minWidth: 0, color: activeTab === 'settings' ? '#E8DEF8' : 'text.secondary' }}>
                      <Settings fontSize="small" />
                    </ListItemIcon>
                  </ListItemButton>
                  <Typography variant="caption" color={activeTab === 'settings' ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                    Config
                  </Typography>
                </Box>
              </Tooltip>
            </Stack>

            <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pb: 2 }}>
              <Tooltip title="Debug Console" placement="right">
                <IconButton
                  onClick={() => setIsDebugOpen(!isDebugOpen)}
                  sx={{
                    color: isDebugOpen ? 'primary.main' : 'text.secondary',
                    bgcolor: isDebugOpen ? 'rgba(103, 80, 164, 0.2)' : 'transparent',
                    '&:hover': { bgcolor: 'rgba(103, 80, 164, 0.3)' }
                  }}
                >
                  <BugReport fontSize="small" />
                </IconButton>
              </Tooltip>

              <Tooltip title={isTyping ? "Active" : "Idle"}>
                <Box
                  sx={{
                    width: 12, height: 12, borderRadius: '50%',
                    bgcolor: isTyping ? 'success.main' : 'rgba(255,255,255,0.1)',
                    boxShadow: isTyping ? '0 0 10px rgba(181, 204, 186, 0.5)' : 'none',
                    transition: 'all 0.5s ease'
                  }}
                />
              </Tooltip>
            </Box>
          </Drawer>

          {/* Main Content Area */}
          <Box component="main" sx={{ flexGrow: 1, position: 'relative', height: '100%', bgcolor: 'background.default', borderRadius: '16px 0 0 16px', overflow: 'hidden' }}>

            {/* WRITE TAB */}
            <AnimatePresence mode="wait">
              {activeTab === 'write' && (
                <motion.div
                  key="write"
                  initial={{ opacity: 1, x: 0 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                  style={{ position: 'absolute', inset: 0, display: 'flex', padding: 24, gap: 24 }}
                >

                  {/* Editor Column */}
                  <Paper
                    elevation={0}
                    sx={{
                      flexGrow: 1,
                      height: '100%',
                      bgcolor: 'background.paper', // Surface Container
                      display: 'flex', flexDirection: 'column',
                      overflow: 'hidden',
                      position: 'relative'
                    }}
                  >
                    {/* Header */}
                    <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box>
                        <Typography variant="h6" sx={{ color: 'text.primary' }}>Simulation Input</Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        <Tooltip title="Paste from Clipboard">
                          <IconButton onClick={handlePaste} size="small" sx={{ color: 'primary.main' }}>
                            <ContentPaste fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Clear Text">
                          <IconButton onClick={() => setText('')} size="small" sx={{ color: 'error.main' }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </Box>

                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />

                    {/* Text Area */}
                    <Box sx={{ flexGrow: 1, position: 'relative', overflow: 'hidden' }}>
                      <TextField
                        multiline
                        fullWidth
                        placeholder="Paste or type the text to be simulated..."
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        disabled={isTyping}
                        variant="standard"
                        InputProps={{
                          disableUnderline: true,
                          sx: {
                            height: '100%',
                            p: 3,
                            alignItems: 'flex-start',
                            overflowY: 'auto',
                            fontSize: '1.1rem',
                            lineHeight: 1.6,
                            color: 'text.primary',
                            '& textarea': { height: '100% !important', overflowY: 'auto !important' }
                          }
                        }}
                        sx={{ height: '100%' }}
                      />



                      {/* Active Typing Overlay */}
                      {isTyping && (
                        <Box
                          sx={{
                            position: 'absolute', inset: 0,
                            bgcolor: 'rgba(20, 18, 24, 0.9)',
                            backdropFilter: 'blur(5px)',
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            zIndex: 10,
                            borderRadius: 4
                          }}
                        >
                          {countdown !== null ? (
                            <motion.div
                              key={countdown}
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 1.5, opacity: 0 }}
                              transition={{ duration: 0.5 }}
                            >
                              <Typography variant="h1" sx={{ fontSize: '8rem', fontWeight: 700, color: 'primary.main' }}>
                                {countdown}
                              </Typography>
                            </motion.div>
                          ) : (
                            <Stack spacing={4} alignItems="center">
                              <Box sx={{ position: 'relative' }}>
                                <CircularProgress size={100} thickness={3} sx={{ color: 'primary.main' }} />
                                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FlashOn sx={{ fontSize: 40, color: 'primary.main' }} />
                                </Box>
                              </Box>
                              <Button
                                component={motion.button}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                variant="contained"
                                color="error"
                                size="large"
                                startIcon={<Stop />}
                                onClick={handleStop}
                                sx={{ borderRadius: 100, px: 4, py: 1.5, fontSize: '1.1rem' }}
                              >
                                Stop
                              </Button>
                            </Stack>
                          )}
                        </Box>
                      )}
                    </Box>
                  </Paper>

                  {/* Config Panel (Right) - Surface Container High */}
                  <ConfigPanel
                    configMode={configMode}
                    setConfigMode={setConfigMode}
                    targetMinutes={targetMinutes}
                    setTargetMinutes={setTargetMinutes}
                    targetSeconds={targetSeconds}
                    setTargetSeconds={setTargetSeconds}
                    speed={speed}
                    setSpeed={setSpeed}
                    speedMode={speedMode}
                    setSpeedMode={setSpeedMode}
                    speedVariance={speedVariance}
                    setSpeedVariance={setSpeedVariance}
                    mistakeRatePercent={mistakeRatePercent}
                    setMistakeRatePercent={setMistakeRatePercent}
                    fatigueMode={fatigueMode}
                    setFatigueMode={setFatigueMode}
                    showAdvanced={showAdvanced}
                    setShowAdvanced={setShowAdvanced}
                    advanced={advanced}
                    setAdvanced={setAdvanced}
                    handleStart={handleStart}
                    text={text}
                    isTyping={isTyping}
                    stats={stats}
                    estimatedTimeStr={estimatedTimeStr}
                  />
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  style={{ position: 'absolute', inset: 0, padding: 48, overflowY: 'auto' }}
                >
                  <Box mb={6} sx={{ maxWidth: 800, mx: 'auto' }}>
                    <Typography variant="h2" gutterBottom>App Customization</Typography>
                    <Typography variant="body1" color="text.secondary">
                      Personalize your experience and configure system behavior.
                    </Typography>
                  </Box>

                  <Grid container spacing={3} sx={{ maxWidth: 800, mx: 'auto' }}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Paper sx={{ p: 3, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))', height: '100%', position: 'relative' }}>
                        <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                          <Palette color="primary" />
                          <Typography variant="h6">Appearance</Typography>
                        </Stack>

                        <Typography variant="subtitle2" color="text.secondary" mb={2}>Theme Mode</Typography>
                        <Stack spacing={2} mb={4}>
                          <Paper
                            component={motion.div}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            variant="outlined"
                            onClick={() => setMode('dark')}
                            sx={{
                              p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
                              bgcolor: mode === 'dark' ? (seedColor === 'violet' ? 'rgba(208, 188, 255, 0.08)' : 'rgba(0,0,0,0.2)') : 'transparent',
                              borderColor: mode === 'dark' ? 'primary.main' : 'divider',
                              transition: 'all 0.2s'
                            }}
                          >
                            <DarkMode color={mode === 'dark' ? 'primary' : 'disabled'} />
                            <Typography variant="body2" fontWeight={mode === 'dark' ? 600 : 400}>Deep Space</Typography>
                          </Paper>
                          <Paper
                            component={motion.div}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            variant="outlined"
                            onClick={() => setMode('light')}
                            sx={{
                              p: 2, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer',
                              bgcolor: mode === 'light' ? 'primary.light' : 'transparent', // tint
                              borderColor: mode === 'light' ? 'primary.main' : 'divider',
                              transition: 'all 0.2s',
                              opacity: mode === 'light' ? 1 : 0.7
                            }}
                          >
                            <LightMode color={mode === 'light' ? 'primary' : 'disabled'} />
                            <Typography variant="body2" fontWeight={mode === 'light' ? 600 : 400}>Light Mode</Typography>
                          </Paper>
                        </Stack>

                        <Typography variant="subtitle2" color="text.secondary" mb={2}>Color Scheme</Typography>
                        <Stack direction="row" spacing={2}>
                          {Object.entries(colorPalettes).map(([key, pal]) => (
                            <Tooltip title={key.charAt(0).toUpperCase() + key.slice(1)} key={key}>
                              <Box
                                component={motion.div}
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setSeedColor(key)}
                                sx={{
                                  width: 48, height: 48, borderRadius: '50%',
                                  bgcolor: pal[mode].primary,
                                  cursor: 'pointer',
                                  border: seedColor === key ? `4px solid ${theme.palette.text.primary}` : '2px solid transparent',
                                  boxShadow: seedColor === key ? '0 0 0 2px ' + pal[mode].background : 'none',
                                  transition: 'all 0.2s',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}
                              >
                                {seedColor === key && <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: theme.palette.background.default }} />}
                              </Box>
                            </Tooltip>
                          ))}
                        </Stack>

                      </Paper>
                    </Grid>

                    <Grid size={{ xs: 12, md: 6 }}>
                      <Paper sx={{ p: 3, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))', height: '100%', position: 'relative' }}>
                        <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                          <Monitor color="info" />
                          <Typography variant="h6">Overlay Mode</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          Switch to a minimal corner overlay that stays on top of other windows.
                          A small triangle appears in the top-left corner for quick access to controls.
                        </Typography>

                        {/* Auto-show overlay toggle */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                          <Box>
                            <Typography variant="body2" fontWeight={600}>Auto-show Overlay</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Show overlay when window is minimized during typing
                            </Typography>
                          </Box>
                          <Switch
                            checked={autoOverlayEnabled}
                            onChange={(e) => setAutoOverlayEnabled(e.target.checked)}
                          />
                        </Stack>

                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<OpenInFull />}
                          onClick={() => {
                            // Sync config so overlay can start typing
                            syncConfig();
                            // Then toggle to overlay mode
                            window.electronAPI.toggleOverlay();
                          }}
                        >
                          Switch to Overlay
                        </Button>
                      </Paper>
                    </Grid>

                    {/* Advanced Config Card */}
                    <Grid size={{ xs: 12 }}>
                      <Paper sx={{ p: 3, bgcolor: 'background.paper', backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))' }}>
                        <Stack direction="row" spacing={2} alignItems="center" mb={3}>
                          <Code color="warning" />
                          <Typography variant="h6">Advanced Configuration</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.secondary" paragraph>
                          View, edit, export and import your typing simulation settings as JSON.
                        </Typography>

                        <TextField
                          fullWidth
                          multiline
                          minRows={8}
                          maxRows={16}
                          value={JSON.stringify(advanced, null, 2)}
                          onChange={(e) => {
                            try {
                              const parsed = JSON.parse(e.target.value);
                              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                setAdvanced(prev => ({ ...prev, ...parsed }));
                              }
                            } catch {
                              // Invalid JSON, ignore
                            }
                          }}
                          sx={{
                            mb: 2,
                            '& .MuiInputBase-root': {
                              fontFamily: 'monospace',
                              fontSize: '0.8rem'
                            }
                          }}
                        />

                        <Stack direction="row" spacing={2}>
                          <Button
                            variant="outlined"
                            startIcon={<FileDownload />}
                            onClick={() => {
                              const json = JSON.stringify(advanced, null, 2);
                              const blob = new Blob([json], { type: 'application/json' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'final-typer-config.json';
                              a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            Export Config
                          </Button>
                          <Button
                            variant="outlined"
                            startIcon={<FileUpload />}
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.json';
                              input.onchange = (e) => {
                                const file = (e.target as HTMLInputElement).files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  try {
                                    const parsed = JSON.parse(ev.target?.result as string);
                                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                                      setAdvanced(prev => ({ ...prev, ...parsed }));
                                    }
                                  } catch {
                                    // Invalid JSON, ignore
                                  }
                                };
                                reader.readAsText(file);
                              };
                              input.click();
                            }}
                          >
                            Import Config
                          </Button>
                          <Button
                            variant="text"
                            color="secondary"
                            onClick={() => setAdvanced(DEFAULT_ADVANCED_SETTINGS)}
                          >
                            Reset to Defaults
                          </Button>
                        </Stack>
                      </Paper>
                    </Grid>
                  </Grid>
                </motion.div>
              )}
            </AnimatePresence>

          </Box>
        </Box>
      </Box>

      {/* Debug Panel */}
      <DebugPanel
        isOpen={isDebugOpen}
        onClose={() => setIsDebugOpen(false)}
        logs={debugLogs}
        currentBuffer={currentBuffer}
        currentCaret={currentCaret}
        onClearLogs={clearLogs}
        disableDoubleTap={disableDoubleTap}
        onToggleDoubleTap={setDisableDoubleTap}
      />
    </ThemeProvider>
  );
}

export default App;
