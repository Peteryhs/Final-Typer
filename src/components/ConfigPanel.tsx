import React, { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Stack, Button, TextField,
    Slider, Switch, Collapse, Divider
} from '@mui/material';
import {
    AutoAwesome, Tune, AccessTime, ErrorOutline,
    Science, ExpandLess, ExpandMore, PlayArrow, Pause,
    Speed, Psychology, Create, Refresh, Verified
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
    handlePauseResume: () => void;
    text: string;
    isTyping: boolean;
    isPaused: boolean;
    stats: { word_count: number; character_count: number } | null;
    estimatedTimeStr: string;
}

// Reusable slider component for cleaner code
interface SettingSliderProps {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    format?: (value: number) => string;
    description?: string;
}

function SettingSlider({ label, value, min, max, step, onChange, format, description }: SettingSliderProps) {
    const displayValue = format ? format(value) : value.toString();
    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Typography variant="caption" fontFamily="monospace">{displayValue}</Typography>
            </Stack>
            <Slider
                size="small"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(_, v) => onChange(v as number)}
                sx={{ height: 3, py: 0 }}
            />
            {description && (
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', display: 'block', mt: 0.5 }}>
                    {description}
                </Typography>
            )}
        </Box>
    );
}

// Reusable toggle component
interface SettingToggleProps {
    label: string;
    description?: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
}

function SettingToggle({ label, description, checked, onChange }: SettingToggleProps) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
                <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                {description && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                        {description}
                    </Typography>
                )}
            </Box>
            <Switch
                size="small"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
        </Stack>
    );
}

// Collapsible section component with cool styling
interface CollapsibleSectionProps {
    icon: React.ElementType;
    title: string;
    subtitle?: string;
    isOpen: boolean;
    onToggle: () => void;
    children: React.ReactNode;
}

function CollapsibleSection({ icon: Icon, title, subtitle, isOpen, onToggle, children }: CollapsibleSectionProps) {
    return (
        <Box>
            <Button
                fullWidth
                onClick={onToggle}
                sx={{
                    justifyContent: 'space-between',
                    py: 1,
                    px: 1.5,
                    bgcolor: 'rgba(255,255,255,0.03)',
                    borderRadius: 1,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
                    textTransform: 'none',
                }}
            >
                <Stack direction="row" spacing={1} alignItems="center">
                    <Icon sx={{ fontSize: '1rem', color: 'primary.main' }} />
                    <Box sx={{ textAlign: 'left' }}>
                        <Typography variant="caption" fontWeight={700} color="text.primary" sx={{
                            textTransform: 'uppercase',
                            letterSpacing: 1,
                            fontSize: '0.7rem',
                            display: 'block'
                        }}>
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Stack>
                {isOpen ? <ExpandLess sx={{ fontSize: '1rem', color: 'text.secondary' }} /> : <ExpandMore sx={{ fontSize: '1rem', color: 'text.secondary' }} />}
            </Button>
            <Collapse in={isOpen}>
                <Box sx={{ pt: 1.5, pb: 0.5, px: 0.5 }}>
                    <Stack spacing={1.5}>
                        {children}
                    </Stack>
                </Box>
            </Collapse>
        </Box>
    );
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
        setFatigueMode, // Not used directly in this component
        showAdvanced, setShowAdvanced,
        advanced, setAdvanced,
        handleStart, handlePauseResume, text, isTyping, isPaused,
        stats, estimatedTimeStr
    } = props;

    const setA = <K extends keyof TypingAdvancedSettings>(key: K, value: TypingAdvancedSettings[K]) => {
        setAdvanced((prev) => ({ ...prev, [key]: value }));
    };

    const [width, setWidth] = useState(420);
    const [isDragging, setIsDragging] = useState(false);

    // Track which advanced sections are expanded
    const [openSections, setOpenSections] = useState<Record<string, boolean>>({
        rhythm: false,
        hyperdrive: false,
        chaos: false,
        recovery: false,
        hindsight: false,
        wordswap: false,
        integrity: false,
    });

    const toggleSection = (key: string) => {
        setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const newWidth = window.innerWidth - e.clientX;
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
                p: 3,
                gap: 3
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
                    overflow: 'hidden',
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
                                        {/* FLOW & RHYTHM */}
                                        <CollapsibleSection
                                            icon={Speed}
                                            title="Flow & Rhythm"
                                            subtitle="Timing and natural variation"
                                            isOpen={openSections.rhythm}
                                            onToggle={() => toggleSection('rhythm')}
                                        >
                                            <SettingSlider
                                                label="Keystrokes per Word"
                                                value={advanced.keystrokesPerWord}
                                                min={4} max={7} step={1}
                                                onChange={(v) => setA('keystrokesPerWord', v)}
                                                description="Standard WPM uses 5 chars/word"
                                            />
                                            <SettingSlider
                                                label="Delay Variance"
                                                value={advanced.lognormalSigma}
                                                min={0.05} max={0.6} step={0.01}
                                                onChange={(v) => setA('lognormalSigma', v)}
                                                description="Higher = more random timing between keys"
                                            />
                                            <SettingSlider
                                                label="Pause Multiplier"
                                                value={advanced.pauseScale}
                                                min={0.5} max={2.0} step={0.1}
                                                onChange={(v) => setA('pauseScale', v)}
                                                format={(v) => `x${v}`}
                                            />
                                            <SettingSlider
                                                label="Micro-Pause Chance"
                                                value={advanced.microPauseChance}
                                                min={0} max={0.1} step={0.005}
                                                onChange={(v) => setA('microPauseChance', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                            />
                                        </CollapsibleSection>

                                        {/* HYPERDRIVE */}
                                        <CollapsibleSection
                                            icon={Speed}
                                            title="Hyperdrive"
                                            subtitle="Speed bursts and momentum"
                                            isOpen={openSections.hyperdrive}
                                            onToggle={() => toggleSection('hyperdrive')}
                                        >
                                            <SettingToggle
                                                label="Enable Bursts"
                                                description="Speeds up in short bursts, then pauses"
                                                checked={advanced.burstEnabled}
                                                onChange={(v) => setA('burstEnabled', v)}
                                            />
                                            <SettingSlider
                                                label="Burst Length (words)"
                                                value={advanced.burstWordsMax}
                                                min={1} max={10} step={1}
                                                onChange={(v) => {
                                                    setA('burstWordsMin', v);
                                                    setA('burstWordsMax', v);
                                                }}
                                            />
                                            <SettingSlider
                                                label="Burst Speed Boost"
                                                value={advanced.burstSpeedMultiplier}
                                                min={1.0} max={1.5} step={0.01}
                                                onChange={(v) => setA('burstSpeedMultiplier', v)}
                                                format={(v) => `x${v}`}
                                            />
                                        </CollapsibleSection>

                                        {/* CHAOS ENGINE */}
                                        <CollapsibleSection
                                            icon={Create}
                                            title="Chaos Engine"
                                            subtitle="Controlled imperfection"
                                            isOpen={openSections.chaos}
                                            onToggle={() => toggleSection('chaos')}
                                        >
                                            <SettingToggle
                                                label="Dynamic Mistakes"
                                                description="Error rate scales with text complexity"
                                                checked={advanced.dynamicMistakes}
                                                onChange={(v) => setA('dynamicMistakes', v)}
                                            />
                                            <SettingToggle
                                                label="Case-Sensitive Typos"
                                                description="Typos match original capitalization"
                                                checked={advanced.caseSensitiveTypos}
                                                onChange={(v) => setA('caseSensitiveTypos', v)}
                                            />
                                        </CollapsibleSection>

                                        {/* RECOVERY PROTOCOL */}
                                        <CollapsibleSection
                                            icon={Refresh}
                                            title="Recovery Protocol"
                                            subtitle="Error detection and correction"
                                            isOpen={openSections.recovery}
                                            onToggle={() => toggleSection('recovery')}
                                        >
                                            <SettingSlider
                                                label="Instant Correction %"
                                                value={advanced.reflexRate}
                                                min={0} max={0.5} step={0.01}
                                                onChange={(v) => setA('reflexRate', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                                description="Chance to immediately correct a typo"
                                            />
                                            <SettingSlider
                                                label="Backspace Delay"
                                                value={advanced.backspaceDelaySeconds}
                                                min={0.01} max={0.2} step={0.01}
                                                onChange={(v) => setA('backspaceDelaySeconds', v)}
                                                format={(v) => `${v}s`}
                                            />
                                            <SettingSlider
                                                label="Realization Chance"
                                                value={advanced.realizationBaseChance}
                                                min={0} max={0.2} step={0.005}
                                                onChange={(v) => setA('realizationBaseChance', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                                description="Base chance to notice a past mistake"
                                            />
                                            <SettingSlider
                                                label="Realization Growth"
                                                value={advanced.realizationSensitivity}
                                                min={0.01} max={0.15} step={0.005}
                                                onChange={(v) => setA('realizationSensitivity', v)}
                                                description="How much chance increases per char since error"
                                            />
                                            <SettingSlider
                                                label="Backtrack Chance"
                                                value={advanced.deletionBacktrackChance}
                                                min={0} max={1} step={0.05}
                                                onChange={(v) => setA('deletionBacktrackChance', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                                description="Chance to delete-and-retype vs deferred fix"
                                            />
                                        </CollapsibleSection>

                                        {/* HINDSIGHT MODE */}
                                        <CollapsibleSection
                                            icon={Psychology}
                                            title="Hindsight Mode"
                                            subtitle="Go back and fix old mistakes"
                                            isOpen={openSections.hindsight}
                                            onToggle={() => toggleSection('hindsight')}
                                        >
                                            <SettingToggle
                                                label="Enable Hindsight"
                                                description="Periodically revisit and correct past errors"
                                                checked={advanced.fixSessionsEnabled}
                                                onChange={(v) => setA('fixSessionsEnabled', v)}
                                            />
                                            <SettingSlider
                                                label="Review Interval (words)"
                                                value={advanced.fixSessionIntervalWords}
                                                min={2} max={60} step={1}
                                                onChange={(v) => setA('fixSessionIntervalWords', v)}
                                                description="Words typed before looking back"
                                            />
                                            <SettingSlider
                                                label="Max Corrections"
                                                value={advanced.fixSessionMaxFixes}
                                                min={4} max={20} step={1}
                                                onChange={(v) => setA('fixSessionMaxFixes', v)}
                                            />
                                            <SettingSlider
                                                label="Cursor Speed"
                                                value={advanced.fixSessionCursorMoveDelaySeconds}
                                                min={0.001} max={0.06} step={0.001}
                                                onChange={(v) => setA('fixSessionCursorMoveDelaySeconds', v)}
                                                format={(v) => `${Math.round(v * 1000)}ms`}
                                                description="Lower = faster, higher = more reliable"
                                            />
                                        </CollapsibleSection>

                                        {/* WORD SWAP */}
                                        <CollapsibleSection
                                            icon={Create}
                                            title="Word Swap"
                                            subtitle="Synonym substitution simulation"
                                            isOpen={openSections.wordswap}
                                            onToggle={() => toggleSection('wordswap')}
                                        >
                                            <SettingToggle
                                                label="Enable Word Swap"
                                                description="Type a synonym, then correct it"
                                                checked={advanced.synonymReplaceEnabled}
                                                onChange={(v) => setA('synonymReplaceEnabled', v)}
                                            />
                                            <SettingSlider
                                                label="Swap Chance"
                                                value={advanced.synonymReplaceChance}
                                                min={0} max={0.25} step={0.01}
                                                onChange={(v) => setA('synonymReplaceChance', v)}
                                                format={(v) => `${Math.round(v * 100)}%`}
                                            />
                                            <SettingToggle
                                                label="Instant Fix"
                                                description="Correct immediately vs later"
                                                checked={advanced.synonymCorrectionMode === 'live'}
                                                onChange={(v) => setA('synonymCorrectionMode', v ? 'live' : 'backtrack')}
                                            />
                                        </CollapsibleSection>

                                        {/* INTEGRITY CHECK */}
                                        <CollapsibleSection
                                            icon={Verified}
                                            title="Integrity Check"
                                            subtitle="Final verification and repair"
                                            isOpen={openSections.integrity}
                                            onToggle={() => toggleSection('integrity')}
                                        >
                                            <SettingToggle
                                                label="Clipboard Verify"
                                                description="Use Ctrl+A/C to verify final text"
                                                checked={advanced.finalVerifyViaClipboard}
                                                onChange={(v) => setA('finalVerifyViaClipboard', v)}
                                            />
                                            <SettingSlider
                                                label="Max Verify Attempts"
                                                value={advanced.finalVerifyMaxAttempts}
                                                min={1} max={10} step={1}
                                                onChange={(v) => setA('finalVerifyMaxAttempts', v)}
                                            />
                                            <SettingToggle
                                                label="Full Rewrite on Fail"
                                                description="If verification fails, Ctrl+A and retype"
                                                checked={advanced.finalRewriteOnMismatch}
                                                onChange={(v) => setA('finalRewriteOnMismatch', v)}
                                            />
                                        </CollapsibleSection>
                                    </Paper>
                                </Collapse>
                            </Box>
                        </Stack>
                    </Box>
                </Box>
            </Paper>

            {/* Footer with Stats and Start Button */}
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

                {isTyping ? (
                    <Button
                        component={motion.button}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        fullWidth
                        variant="contained"
                        color={isPaused ? "success" : "warning"}
                        onClick={handlePauseResume}
                        startIcon={isPaused ? <PlayArrow sx={{ fontSize: '1rem' }} /> : <Pause sx={{ fontSize: '1rem' }} />}
                        sx={{
                            py: 1,
                            fontSize: '0.85rem',
                            borderRadius: 2,
                            fontWeight: 600,
                            boxShadow: '0 4px 12px rgba(var(--mui-palette-primary-mainChannel), 0.4)'
                        }}
                    >
                        {isPaused ? "Resume" : "Pause"}
                    </Button>
                ) : (
                    <Button
                        component={motion.button}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        fullWidth
                        variant="contained"
                        color="primary"
                        onClick={handleStart}
                        disabled={!text}
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
                )}
            </Paper>
        </Box >
    );
}
