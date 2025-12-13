import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Stack, Button, TextField,
    Slider, Switch, Collapse, Divider
} from '@mui/material';
import {
    AutoAwesome, Tune, AccessTime, ErrorOutline,
    Science, ExpandLess, ExpandMore, PlayArrow
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import type { TypingAdvancedSettings } from '../lib/typing/types';

interface ConfigPanelProps {
    configMode: 'smart' | 'custom';
    setConfigMode: (mode: 'smart' | 'custom') => void;
    targetMinutes: number;
    setTargetMinutes: (min: number) => void;
    targetSeconds: number;
    setTargetSeconds: (sec: number) => void;
    speed: number;
    setSpeed: (speed: number) => void;
    speedMode: 'constant' | 'dynamic';
    setSpeedMode: (mode: 'constant' | 'dynamic') => void;
    speedVariance: number;
    setSpeedVariance: (variance: number) => void;
    mistakeRatePercent: number;
    setMistakeRatePercent: (rate: number) => void;
    fatigueMode: boolean;
    setFatigueMode: (mode: boolean) => void;
    showAdvanced: boolean;
    setShowAdvanced: (show: boolean) => void;
    advanced: TypingAdvancedSettings;
    setAdvanced: React.Dispatch<React.SetStateAction<TypingAdvancedSettings>>;
    handleStart: () => void;
    text: string;
    isTyping: boolean;
    stats: { word_count: number; character_count: number } | null;
    estimatedTimeStr: string;
}

export default function ConfigPanel(props: ConfigPanelProps) {
    const {
        configMode, setConfigMode,
        targetMinutes, setTargetMinutes,
        targetSeconds, setTargetSeconds,
        speed, setSpeed,
        speedMode, setSpeedMode,
        speedVariance, setSpeedVariance,
        mistakeRatePercent, setMistakeRatePercent,
        setFatigueMode,
        showAdvanced, setShowAdvanced,
        advanced, setAdvanced,
        handleStart, text, isTyping,
        stats, estimatedTimeStr
    } = props;

    const setA = <K extends keyof TypingAdvancedSettings>(key: K, value: TypingAdvancedSettings[K]) => {
        setAdvanced((prev) => ({ ...prev, [key]: value }));
    };

    const [width, setWidth] = useState(420);
    const [isDragging, setIsDragging] = useState(false);

    const [advancedJson, setAdvancedJson] = useState(() => JSON.stringify(advanced, null, 2));
    const [advancedJsonError, setAdvancedJsonError] = useState<string | null>(null);

    // Keep the editor in sync when advanced settings change externally (e.g. presets),
    // but don't fight the user while they are actively editing.
    const [isEditingAdvancedJson, setIsEditingAdvancedJson] = useState(false);
    useEffect(() => {
        if (isEditingAdvancedJson) return;
        setAdvancedJson(JSON.stringify(advanced, null, 2));
    }, [advanced, isEditingAdvancedJson]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newWidth = window.innerWidth - e.clientX;
            // Clamp width between 300 and 800
            setWidth(Math.max(300, Math.min(newWidth, 800)));
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging]);

    return (
        <Box
            sx={{
                width: width,
                minWidth: 300,
                height: '100%',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                transition: isDragging ? 'none' : 'width 0.2s ease',
                p: 3, // Match padding of Simulation Input panel
                gap: 3 // Match gap of Simulation Input panel
            }}
        >
            {/* Drag Handle */}
            <Box
                onMouseDown={handleMouseDown}
                sx={{
                    position: 'absolute',
                    left: -4,
                    top: 0,
                    bottom: 0,
                    width: 9,
                    cursor: 'ew-resize',
                    zIndex: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    '&:hover .handle-bar': { bgcolor: 'primary.main', opacity: 1 },
                    '&:active .handle-bar': { bgcolor: 'primary.main', opacity: 1 }
                }}
            >
                <Box
                    className="handle-bar"
                    sx={{
                        width: 4,
                        height: 48,
                        borderRadius: 2,
                        bgcolor: 'text.secondary',
                        opacity: 0,
                        transition: 'all 0.2s'
                    }}
                />
            </Box>

            {/* Top Section: Settings Panel */}
            <Paper
                elevation={0}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: 'hidden', // Contain scroll
                    display: 'flex',
                    flexDirection: 'column',
                    bgcolor: 'background.paper',
                    backgroundImage: 'linear-gradient(rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.05))',
                    border: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                <Box sx={{
                    flexGrow: 1,
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    '&::-webkit-scrollbar': { display: 'none' },
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                }}>
                    <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="body1" sx={{ color: 'text.primary', fontWeight: 600 }}>
                                Parameters
                            </Typography>
                        </Box>

                        <Stack
                            component={motion.div}
                            variants={{
                                hidden: { opacity: 0 },
                                show: { opacity: 1, transition: { staggerChildren: 0.1 } }
                            }}
                            initial="hidden"
                            animate="show"
                            spacing={1.5}
                        >
                            {/* Mode Selection Card */}
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 0.5,
                                    bgcolor: 'rgba(0,0,0,0.2)',
                                    borderRadius: 1.5,
                                    display: 'flex',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Animated Background Pill */}
                                <Box
                                    component={motion.div}
                                    initial={false}
                                    animate={{
                                        left: configMode === 'smart' ? 4 : 'calc(50% + 2px)',
                                    }}
                                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    sx={{
                                        position: 'absolute',
                                        top: 4, bottom: 4,
                                        width: 'calc(50% - 6px)',
                                        bgcolor: configMode === 'smart' ? 'primary.main' : 'secondary.main',
                                        borderRadius: 1,
                                        zIndex: 0
                                    }}
                                />

                                <Button
                                    fullWidth
                                    disableRipple
                                    onClick={() => setConfigMode('smart')}
                                    startIcon={<AutoAwesome sx={{ fontSize: '1rem' }} />}
                                    sx={{
                                        zIndex: 1,
                                        py: 0.75,
                                        color: configMode === 'smart' ? 'primary.contrastText' : 'text.secondary',
                                        transition: 'color 0.2s',
                                        '&:hover': { bgcolor: 'transparent' },
                                        fontSize: '0.85rem',
                                        minWidth: 0
                                    }}
                                >
                                    Smart
                                </Button>
                                <Button
                                    fullWidth
                                    disableRipple
                                    onClick={() => setConfigMode('custom')}
                                    startIcon={<Tune sx={{ fontSize: '1rem' }} />}
                                    sx={{
                                        zIndex: 1,
                                        py: 0.75,
                                        color: configMode === 'custom' ? 'secondary.contrastText' : 'text.secondary',
                                        transition: 'color 0.2s',
                                        '&:hover': { bgcolor: 'transparent' },
                                        fontSize: '0.85rem',
                                        minWidth: 0
                                    }}
                                >
                                    Custom
                                </Button>
                            </Paper>

                            {/* SMART MODE CARD */}
                            {configMode === 'smart' ? (
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        borderRadius: 1.5,
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}
                                >
                                    <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                                        Target Duration
                                    </Typography>

                                    <Stack direction="row" spacing={1.5} mb={1.5}>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontSize: '0.65rem' }}>MINUTES</Typography>
                                            <TextField
                                                type="number"
                                                fullWidth
                                                value={targetMinutes}
                                                onChange={(e) => setTargetMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                                                size="small"
                                                InputProps={{
                                                    inputProps: { min: 0 },
                                                    sx: { fontSize: '1rem', fontWeight: 500 }
                                                }}
                                                variant="outlined"
                                            />
                                        </Box>
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontSize: '0.65rem' }}>SECONDS</Typography>
                                            <TextField
                                                type="number"
                                                fullWidth
                                                value={targetSeconds}
                                                onChange={(e) => setTargetSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                                size="small"
                                                InputProps={{
                                                    inputProps: { min: 0, max: 59 },
                                                    sx: { fontSize: '1rem', fontWeight: 500 }
                                                }}
                                                variant="outlined"
                                            />
                                        </Box>
                                    </Stack>

                                    <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem' }}>Calculated Speed</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                                            <Typography variant="h6" color="primary.main" fontWeight={700}>
                                                {speed}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">WPM</Typography>
                                        </Box>
                                    </Box>
                                </Paper>
                            ) : (
                                /* CUSTOM MODE CARD */
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 1.5,
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        borderRadius: 1.5,
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        display: 'flex', flexDirection: 'column', gap: 1.5
                                    }}
                                >
                                    {/* Target Speed */}
                                    <Box>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                            <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <AccessTime sx={{ fontSize: '1rem' }} color={speedMode === 'constant' ? 'primary' : 'secondary'} />
                                                Target Speed
                                            </Typography>
                                            <Box sx={{
                                                bgcolor: speedMode === 'constant' ? 'primary.main' : 'secondary.main',
                                                color: 'primary.contrastText',
                                                px: 1.5, py: 0.25,
                                                borderRadius: 100,
                                                fontSize: '0.75rem',
                                                fontWeight: 700
                                            }}>
                                                {speed} WPM
                                            </Box>
                                        </Stack>
                                        <Slider
                                            value={speed}
                                            min={10} max={200}
                                            onChange={(_, v) => setSpeed(v as number)}
                                            valueLabelDisplay="auto"
                                            size="small"
                                            sx={{ color: speedMode === 'constant' ? 'primary.main' : 'secondary.main', height: 3, py: 0 }}
                                        />
                                    </Box>

                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                                    {/* Natural Variation */}
                                    <Box>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="body2" fontWeight={600}>Natural Variation</Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>Simulate human speed drift</Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={speedMode === 'dynamic'}
                                                onChange={(e) => {
                                                    setSpeedMode(e.target.checked ? 'dynamic' : 'constant');
                                                    if (e.target.checked) setFatigueMode(false);
                                                    else setFatigueMode(true);
                                                }}
                                            />
                                        </Stack>

                                        <Collapse in={speedMode === 'dynamic'}>
                                            <Box sx={{ mt: 1, p: 1.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1 }}>
                                                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                                                    <Typography variant="caption" color="text.secondary">Variance Intensity</Typography>
                                                    <Typography variant="caption" fontFamily="monospace" fontWeight={700}>+/- {Math.round(speedVariance * 100)}%</Typography>
                                                </Stack>
                                                <Slider
                                                    value={speedVariance}
                                                    min={0} max={0.5} step={0.05}
                                                    onChange={(_, v) => setSpeedVariance(v as number)}
                                                    size="small"
                                                    sx={{ color: 'secondary.light', height: 3, py: 0 }}
                                                />
                                            </Box>
                                        </Collapse>
                                    </Box>
                                </Paper>
                            )}

                            {/* Error Rate Card */}
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 1.5,
                                    bgcolor: 'rgba(255,255,255,0.03)',
                                    borderRadius: 1.5,
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}
                            >
                                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                    <Typography variant="body2" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ErrorOutline sx={{ fontSize: '1rem' }} color="warning" /> Mistake Rate
                                    </Typography>
                                    <Box sx={{
                                        bgcolor: 'warning.main',
                                        color: '#3E2D16',
                                        px: 1.5, py: 0.25,
                                        borderRadius: 100,
                                        fontSize: '0.75rem',
                                        fontWeight: 700
                                    }}>
                                        {mistakeRatePercent}%
                                    </Box>
                                </Stack>
                                <Slider
                                    value={mistakeRatePercent}
                                    min={0} max={20} step={0.5}
                                    onChange={(_, v) => setMistakeRatePercent(v as number)}
                                    size="small"
                                    sx={{ color: 'warning.main', height: 3, py: 0 }}
                                />
                            </Paper>

                            {/* Advanced Controls Accordion */}
                            <Box>
                                <Button
                                    fullWidth
                                    onClick={() => setShowAdvanced(!showAdvanced)}
                                    endIcon={showAdvanced ? <ExpandLess sx={{ fontSize: '1rem' }} /> : <ExpandMore sx={{ fontSize: '1rem' }} />}
                                    startIcon={<Science sx={{ fontSize: '1rem' }} />}
                                    sx={{
                                        justifyContent: 'space-between',
                                        color: 'text.secondary',
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                                        textTransform: 'none',
                                        borderRadius: 1.5,
                                        py: 0.75,
                                        px: 1.5,
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    Advanced Behavior
                                </Button>

                                <Collapse in={showAdvanced}>
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            mt: 1,
                                            p: 1.5,
                                            bgcolor: 'rgba(0,0,0,0.2)',
                                            borderRadius: 1.5,
                                            display: 'flex', flexDirection: 'column', gap: 1
                                        }}
                                    >
                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Backtrack Sensitivity</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.realizationSensitivity}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.realizationSensitivity}
                                                min={0.05} max={0.5} step={0.01}
                                                onChange={(_, v) => setA('realizationSensitivity', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Realization Base Chance</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{Math.round(advanced.realizationBaseChance * 100)}%</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.realizationBaseChance}
                                                min={0} max={0.2} step={0.005}
                                                onChange={(_, v) => setA('realizationBaseChance', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Instant Correction %</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{Math.round(advanced.reflexRate * 100)}%</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.reflexRate}
                                                min={0} max={0.5} step={0.01}
                                                onChange={(_, v) => setA('reflexRate', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Backspace Delay (s)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.backspaceDelaySeconds}s</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.backspaceDelaySeconds}
                                                min={0.01} max={0.2} step={0.01}
                                                onChange={(_, v) => setA('backspaceDelaySeconds', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Realization Min Delay (chars)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.realizationMinDelayChars}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.realizationMinDelayChars}
                                                min={0} max={10} step={1}
                                                onChange={(_, v) => setA('realizationMinDelayChars', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Realization Max Delay (chars)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.realizationMaxDelayChars}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.realizationMaxDelayChars}
                                                min={4} max={60} step={1}
                                                onChange={(_, v) => setA('realizationMaxDelayChars', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Aggressive Backtrack Chance</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{Math.round(advanced.deletionBacktrackChance * 100)}%</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.deletionBacktrackChance}
                                                min={0} max={1} step={0.01}
                                                onChange={(_, v) => setA('deletionBacktrackChance', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Pause Multiplier</Typography>
                                                <Typography variant="caption" fontFamily="monospace">x{advanced.pauseScale}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.pauseScale}
                                                min={0.5} max={2.0} step={0.1}
                                                onChange={(_, v) => setA('pauseScale', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Keystrokes / Word</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.keystrokesPerWord}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.keystrokesPerWord}
                                                min={4} max={7} step={1}
                                                onChange={(_, v) => setA('keystrokesPerWord', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Delay Variance (Sigma)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.lognormalSigma}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.lognormalSigma}
                                                min={0.05} max={0.6} step={0.01}
                                                onChange={(_, v) => setA('lognormalSigma', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Micro-Pause Chance</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{Math.round(advanced.microPauseChance * 100)}%</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.microPauseChance}
                                                min={0} max={0.1} step={0.005}
                                                onChange={(_, v) => setA('microPauseChance', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', my: 0.5 }} />

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Burst Length (Words)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.burstWordsMax}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.burstWordsMax}
                                                min={1} max={10} step={1}
                                                onChange={(_, v) => {
                                                    const n = v as number;
                                                    setA('burstEnabled', true);
                                                    setA('burstWordsMin', n);
                                                    setA('burstWordsMax', n);
                                                }}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Burst Mode</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Speeds up in short “bursts”
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.burstEnabled}
                                                onChange={(e) => setA('burstEnabled', e.target.checked)}
                                            />
                                        </Stack>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Burst Speed</Typography>
                                                <Typography variant="caption" fontFamily="monospace">x{advanced.burstSpeedMultiplier}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.burstSpeedMultiplier}
                                                min={1.0} max={1.5} step={0.01}
                                                onChange={(_, v) => setA('burstSpeedMultiplier', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Case-Sensitive Typos</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Typos match capitalization
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.caseSensitiveTypos}
                                                onChange={(e) => setA('caseSensitiveTypos', e.target.checked)}
                                            />
                                        </Stack>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Dynamic Mistakes</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Scale errors with complexity
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.dynamicMistakes}
                                                onChange={(e) => setA('dynamicMistakes', e.target.checked)}
                                            />
                                        </Stack>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Fix Sessions</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Revisits older mistakes after chunks of text
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.fixSessionsEnabled}
                                                onChange={(e) => setA('fixSessionsEnabled', e.target.checked)}
                                            />
                                        </Stack>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Fix Interval (words)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.fixSessionIntervalWords}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.fixSessionIntervalWords}
                                                min={2} max={60} step={1}
                                                onChange={(_, v) => setA('fixSessionIntervalWords', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Max Fixes / Session</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.fixSessionMaxFixes}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.fixSessionMaxFixes}
                                                min={1} max={12} step={1}
                                                onChange={(_, v) => setA('fixSessionMaxFixes', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Cursor Move Delay (ms)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{Math.round(advanced.fixSessionCursorMoveDelaySeconds * 1000)}ms</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.fixSessionCursorMoveDelaySeconds}
                                                min={0.02} max={0.15} step={0.01}
                                                onChange={(_, v) => setA('fixSessionCursorMoveDelaySeconds', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', mt: 0.5 }}>
                                                Higher = more reliable on slow apps (Google Docs)
                                            </Typography>
                                        </Box>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Synonym Replace</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Temporarily types a synonym, then fixes it
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.synonymReplaceEnabled}
                                                onChange={(e) => setA('synonymReplaceEnabled', e.target.checked)}
                                            />
                                        </Stack>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Synonym Chance</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{Math.round(advanced.synonymReplaceChance * 100)}%</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.synonymReplaceChance}
                                                min={0} max={0.25} step={0.01}
                                                onChange={(_, v) => setA('synonymReplaceChance', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Synonym Live Fix</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Otherwise fixes via backtrack
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.synonymCorrectionMode === 'live'}
                                                onChange={(e) => setA('synonymCorrectionMode', e.target.checked ? 'live' : 'backtrack')}
                                            />
                                        </Stack>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Synonym Backtrack Min (words)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.synonymBacktrackMinWords}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.synonymBacktrackMinWords}
                                                min={0} max={6} step={1}
                                                onChange={(_, v) => setA('synonymBacktrackMinWords', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Synonym Backtrack Max (words)</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.synonymBacktrackMaxWords}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.synonymBacktrackMaxWords}
                                                min={1} max={12} step={1}
                                                onChange={(_, v) => setA('synonymBacktrackMaxWords', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Final Verify (Clipboard)</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Ctrl+A/Ctrl+C readback (optional)
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.finalVerifyViaClipboard}
                                                onChange={(e) => setA('finalVerifyViaClipboard', e.target.checked)}
                                            />
                                        </Stack>

                                        <Box>
                                            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                                <Typography variant="caption" color="text.secondary">Verify Attempts</Typography>
                                                <Typography variant="caption" fontFamily="monospace">{advanced.finalVerifyMaxAttempts}</Typography>
                                            </Stack>
                                            <Slider
                                                size="small"
                                                value={advanced.finalVerifyMaxAttempts}
                                                min={1} max={10} step={1}
                                                onChange={(_, v) => setA('finalVerifyMaxAttempts', v as number)}
                                                sx={{ height: 3, py: 0 }}
                                            />
                                        </Box>

                                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                                            <Box>
                                                <Typography variant="caption" color="text.secondary" display="block">Rewrite On Mismatch</Typography>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                                                    Ctrl+A then retype as a last resort
                                                </Typography>
                                            </Box>
                                            <Switch
                                                size="small"
                                                checked={advanced.finalRewriteOnMismatch}
                                                onChange={(e) => setA('finalRewriteOnMismatch', e.target.checked)}
                                            />
                                        </Stack>

                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', my: 0.5 }} />

                                        <Typography variant="caption" color="text.secondary">
                                            Advanced Settings (JSON)
                                        </Typography>
                                        <TextField
                                            value={advancedJson}
                                            onChange={(e) => {
                                                setAdvancedJson(e.target.value);
                                                setAdvancedJsonError(null);
                                            }}
                                            onFocus={() => setIsEditingAdvancedJson(true)}
                                            onBlur={() => setIsEditingAdvancedJson(false)}
                                            multiline
                                            minRows={6}
                                            size="small"
                                            spellCheck={false}
                                            sx={{
                                                '& .MuiInputBase-root': {
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem'
                                                }
                                            }}
                                        />
                                        {advancedJsonError && (
                                            <Typography variant="caption" color="error.main" sx={{ fontSize: '0.7rem' }}>
                                                {advancedJsonError}
                                            </Typography>
                                        )}
                                        <Stack direction="row" justifyContent="flex-end" gap={1}>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => {
                                                    setAdvancedJson(JSON.stringify(advanced, null, 2));
                                                    setAdvancedJsonError(null);
                                                }}
                                            >
                                                Reset
                                            </Button>
                                            <Button
                                                size="small"
                                                variant="contained"
                                                onClick={() => {
                                                    try {
                                                        const parsed = JSON.parse(advancedJson);
                                                        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                                                            throw new Error('Expected a JSON object');
                                                        }
                                                        setAdvanced((prev) => ({ ...prev, ...(parsed as any) }));
                                                        setAdvancedJsonError(null);
                                                        setIsEditingAdvancedJson(false);
                                                    } catch (err) {
                                                        setAdvancedJsonError((err as Error).message);
                                                    }
                                                }}
                                            >
                                                Apply
                                            </Button>
                                        </Stack>
                                    </Paper>
                                </Collapse>
                            </Box>
                        </Stack>
                    </Box>
                </Box>
            </Paper>

            {/* Footer with Stats and Start Button - Isolated Bubble */}
            <Paper
                elevation={4}
                sx={{
                    flexShrink: 0,
                    p: 1.5,
                    bgcolor: 'rgba(30, 30, 35, 0.9)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}
            >
                {/* Stats Row */}
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5} sx={{ px: 0.5 }}>
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem', letterSpacing: 1 }}>WORDS</Typography>
                        <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: '0.9rem' }}>
                            {stats?.word_count || 0}
                        </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem', letterSpacing: 1 }}>CHARS</Typography>
                        <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: '0.9rem' }}>
                            {stats?.character_count || 0}
                        </Typography>
                    </Box>
                    <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.6rem', letterSpacing: 1 }}>TIME</Typography>
                        <Typography variant="body2" fontWeight={700} fontFamily="monospace" sx={{ fontSize: '0.9rem' }}>
                            {estimatedTimeStr}
                        </Typography>
                    </Box>
                </Stack>

                <Button
                    component={motion.button}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    fullWidth
                    variant="contained"
                    color="primary"
                    onClick={handleStart}
                    disabled={!text || isTyping}
                    startIcon={<PlayArrow sx={{ fontSize: '1rem' }} />}
                    sx={{
                        py: 1,
                        fontSize: '0.85rem',
                        borderRadius: 2,
                        fontWeight: 600,
                        boxShadow: '0 4px 12px rgba(var(--mui-palette-primary-mainChannel), 0.4)'
                    }}
                >
                    Start Engine
                </Button>
            </Paper>
        </Box >
    );
}
